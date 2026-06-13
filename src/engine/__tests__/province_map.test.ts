import { describe, expect, it } from "vitest";
import {
  generateProvinceMap,
  getWorldMap,
  randomLandCell,
  type WorldMap,
  type MapCell,
} from "../geo/map";
import { tickTerritory, territoryFragmentation } from "../geo/territory";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import { PROVINCE_COUNT, RASTER_W, RASTER_H, AREA, IS_SEA } from "../geo/provincesData";
import type { Language, LanguageTree } from "../types";

/**
 * province_map.test.ts
 *
 * Lane G (MEGA overhaul): the Provinces.png world map. Verifies the baked province
 * data → WorldMap conversion, the geographic fragmentation signal that drives splits,
 * province-mode continental spread, and that a province-mode sim is deterministic.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function bareLang(id: string, overrides: Partial<Language> = {}): Language {
  return {
    id,
    name: id,
    lexemes: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none", tenseMarking: "none", hasCase: false, genderCount: 0 },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["p", "t", "k", "a", "e", "i", "o", "u"], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    speakers: 1000,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    ...overrides,
  };
}

/** Build a throwaway WorldMap with explicit adjacency (all land) for unit tests. */
function fakeMap(adj: number[][]): WorldMap {
  const cells: MapCell[] = adj.map((ns, id) => ({
    id,
    centroid: { x: id, y: 0 },
    vertices: [],
    neighbours: ns,
    elevation: 0.5,
    biome: "lowland",
  }));
  return { cells, bounds: { minX: 0, minY: 0, maxX: adj.length, maxY: 1 }, kind: "province" };
}

describe("Lane G — Provinces.png world map", () => {
  const map = generateProvinceMap();

  it("has one cell per baked province", () => {
    expect(map.cells.length).toBe(PROVINCE_COUNT);
    expect(map.kind).toBe("province");
  });

  it("bounds match the display raster dimensions", () => {
    expect(map.bounds.maxX).toBe(RASTER_W);
    expect(map.bounds.maxY).toBe(RASTER_H);
  });

  it("most provinces are land, but land is ≈ one third of the surface AREA", () => {
    // Sea provinces are fewer but larger (open-ocean zones), so by province count
    // land dominates while by pixel area it is roughly a third — a populated world.
    const landByCount = map.cells.filter((c) => c.biome !== "ocean").length / map.cells.length;
    expect(landByCount).toBeGreaterThan(0.6);
    let landPx = 0, totalPx = 0;
    for (let i = 0; i < PROVINCE_COUNT; i++) {
      totalPx += AREA[i]!;
      if (IS_SEA[i] !== 1) landPx += AREA[i]!;
    }
    const areaRatio = landPx / totalPx;
    expect(areaRatio).toBeGreaterThan(0.25);
    expect(areaRatio).toBeLessThan(0.5);
  });

  it("adjacency is symmetric and non-empty", () => {
    let withNeighbours = 0;
    for (const cell of map.cells) {
      if (cell.neighbours.length > 0) withNeighbours++;
      for (const n of cell.neighbours) {
        expect(map.cells[n]!.neighbours).toContain(cell.id);
      }
    }
    // essentially every province borders something
    expect(withNeighbours).toBeGreaterThan(map.cells.length * 0.99);
  });

  it("tags coastlines on land cells bordering ocean", () => {
    const coast = map.cells.filter((c) => c.biome !== "ocean" && c.isCoast);
    expect(coast.length).toBeGreaterThan(0);
    for (const c of coast) {
      expect(c.neighbours.some((n) => map.cells[n]?.biome === "ocean")).toBe(true);
    }
  });

  it("getWorldMap('province') memoises and ignores seed", () => {
    const a = getWorldMap("province", "seed-a");
    const b = getWorldMap("province", "seed-b");
    expect(a).toBe(b);
    expect(a.kind).toBe("province");
  });
});

describe("Lane G — territoryFragmentation (the split 'reason')", () => {
  it("is 0 for a single connected blob", () => {
    const map = fakeMap([[1], [0, 2], [1]]); // 0-1-2 chain
    expect(territoryFragmentation(map, [0, 1, 2])).toBe(0);
  });

  it("rises when the territory is severed into components", () => {
    // 0-1-2 chain, 4-5 chain, 3 isolated; no edges between the groups.
    const map = fakeMap([[1], [0, 2], [1], [], [5], [4]]);
    // two equal halves of a 4-cell territory → 0.5
    expect(territoryFragmentation(map, [0, 1, 4, 5])).toBeCloseTo(0.5, 6);
    // second component smaller → between 0 and 0.5
    const f = territoryFragmentation(map, [0, 1, 2, 4, 5]);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(0.5);
  });
});

describe("Lane G — province-mode dynamics", () => {
  it("territory spreads continentally (batch expansion into empty land)", () => {
    const map = generateProvinceMap();
    const start = randomLandCell(map, makeRng("prov-origin"));
    expect(start).not.toBeNull();
    const lang = bareLang("L-1", {
      territory: { cells: [start!] },
      coords: map.cells[start!]!.centroid,
      speakers: 8000,
    });
    const tree: LanguageTree = { [lang.id]: { language: lang, parentId: null, childrenIds: [] } };
    const rng = makeRng("prov-expand");
    for (let i = 0; i < 150; i++) tickTerritory(lang, tree, map, rng);
    // A single-cell-per-tick claim would leave a speck; batch expansion reaches a region.
    expect(lang.territory!.cells.length).toBeGreaterThan(15);
    // all claimed cells are land
    for (const c of lang.territory!.cells) expect(map.cells[c]!.biome).not.toBe("ocean");
  });

  it("a province-mode sim runs and is deterministic for the same seed", () => {
    const digest = () => {
      const sim = createSimulation({ ...defaultConfig(), seed: "prov-det", mapMode: "province" });
      for (let i = 0; i < 20; i++) sim.step();
      const state = sim.getState();
      const leaves = Object.keys(state.tree)
        .filter((id) => state.tree[id]!.childrenIds.length === 0)
        .sort();
      return leaves
        .map((id) => `${id}:${(state.tree[id]!.language.territory?.cells.length ?? 0)}`)
        .join("|");
    };
    const a = digest();
    const b = digest();
    expect(a).toBe(b);
    // territory was actually claimed somewhere
    expect(a).toMatch(/:[1-9]/);
  });
});
