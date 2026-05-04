import { describe, expect, it } from "vitest";
import {
  generateRandomContinent,
  generateEarthMap,
  getWorldMap,
  randomLandCell,
  suggestedEarthOrigin,
  sharedEdgeCount,
  territoryCentroid,
} from "../geo/map";
import {
  tickTerritory,
  partitionTerritory,
  arealShareAffinity,
  releaseTerritory,
} from "../geo/territory";
import { translateSentence, tokeniseEnglish } from "../translator/sentence";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import type { Language, LanguageTree } from "../types";

function bareLang(id: string, overrides: Partial<Language> = {}): Language {
  return {
    id,
    name: id,
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none", tenseMarking: "none", hasCase: false, genderCount: 0 },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["p","t","k","a","e","i","o","u"], tones: [], usesTones: false },
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

describe("§C — geo / map module", () => {
  it("generateRandomContinent is deterministic from seed", () => {
    const a = generateRandomContinent("seed-a");
    const b = generateRandomContinent("seed-a");
    expect(a.cells.length).toBe(b.cells.length);
    for (let i = 0; i < a.cells.length; i++) {
      expect(a.cells[i]!.elevation).toBeCloseTo(b.cells[i]!.elevation, 8);
      expect(a.cells[i]!.biome).toBe(b.cells[i]!.biome);
    }
  });

  it("different seeds produce different maps", () => {
    const a = generateRandomContinent("seed-x");
    const b = generateRandomContinent("seed-y");
    let differences = 0;
    for (let i = 0; i < a.cells.length; i++) {
      if (a.cells[i]!.biome !== b.cells[i]!.biome) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("Earth map has the suggested-origin per preset on land", () => {
    const earth = generateEarthMap();
    for (const presetId of ["pie", "germanic", "romance", "bantu", "tokipona"]) {
      const cellId = suggestedEarthOrigin(presetId, earth);
      expect(cellId).not.toBeNull();
      if (cellId !== null) expect(earth.cells[cellId]!.biome).not.toBe("ocean");
    }
  });

  it("getWorldMap memoises by mode + seed", () => {
    const a1 = getWorldMap("random", "memo-test");
    const a2 = getWorldMap("random", "memo-test");
    expect(a1).toBe(a2);
    const e1 = getWorldMap("earth", "any-seed");
    const e2 = getWorldMap("earth", "different-seed");
    expect(e1).toBe(e2);
  });

  it("sharedEdgeCount is symmetric and zero for empty intersections", () => {
    const map = generateRandomContinent("share-edges");
    expect(sharedEdgeCount(map, [], [0])).toBe(0);
    expect(sharedEdgeCount(map, [0], [])).toBe(0);
    const cellA = map.cells.find((c) => c.neighbours.length > 0);
    if (cellA) {
      const cellB = map.cells[cellA.neighbours[0]!]!;
      const ab = sharedEdgeCount(map, [cellA.id], [cellB.id]);
      const ba = sharedEdgeCount(map, [cellB.id], [cellA.id]);
      expect(ab).toBeGreaterThan(0);
      expect(ab).toBe(ba);
    }
  });

  it("territoryCentroid averages cell centroids", () => {
    const map = generateRandomContinent("centroid-test");
    const cells = [0, 1, 2];
    const c = territoryCentroid(map, cells);
    let cx = 0, cy = 0;
    for (const id of cells) {
      cx += map.cells[id]!.centroid.x;
      cy += map.cells[id]!.centroid.y;
    }
    expect(c.x).toBeCloseTo(cx / 3, 6);
    expect(c.y).toBeCloseTo(cy / 3, 6);
  });
});

describe("§C — territory dynamics", () => {
  it("tickTerritory expands the territory over many calls", () => {
    const map = generateRandomContinent("ticks");
    const start = randomLandCell(map, makeRng("origin"));
    expect(start).not.toBeNull();
    const lang = bareLang("L-1", {
      territory: { cells: [start!] },
      coords: map.cells[start!]!.centroid,
      speakers: 5000,
    });
    const tree: LanguageTree = { [lang.id]: { language: lang, parentId: null, childrenIds: [] } };
    const rng = makeRng("expand");
    for (let i = 0; i < 200; i++) tickTerritory(lang, tree, map, rng);
    expect(lang.territory!.cells.length).toBeGreaterThan(1);
  });

  it("partitionTerritory gives every daughter a non-empty cell list when parent has cells", () => {
    const map = generateRandomContinent("partition");
    const startCells: number[] = [];
    for (const c of map.cells) {
      if (c.biome !== "ocean") startCells.push(c.id);
      if (startCells.length >= 8) break;
    }
    const parent = bareLang("P", { territory: { cells: startCells } });
    const daughters = [bareLang("D1"), bareLang("D2"), bareLang("D3")];
    const rng = makeRng("partition-rng");
    partitionTerritory(parent, daughters, map, rng);
    for (const d of daughters) {
      expect(d.territory!.cells.length).toBeGreaterThan(0);
    }
    const seen = new Set<number>();
    for (const d of daughters) {
      for (const c of d.territory!.cells) {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
    }
  });

  it("arealShareAffinity returns 0 for non-touching languages, > 0 for touching", () => {
    const map = generateRandomContinent("areal");
    const farA = bareLang("FA", { territory: { cells: [0] } });
    const farB = bareLang("FB", { territory: { cells: [map.cells.length - 1] } });
    expect(arealShareAffinity(map, farA, farB)).toBe(0);
    const cellA = map.cells.find((c) => c.neighbours.length > 0);
    if (cellA) {
      const aLang = bareLang("A", { territory: { cells: [cellA.id] } });
      const bLang = bareLang("B", { territory: { cells: [cellA.neighbours[0]!] } });
      expect(arealShareAffinity(map, aLang, bLang)).toBeGreaterThan(0);
    }
  });

  // Phase 29 Tranche 4l: releaseTerritory no longer blanks the cell
  // list immediately. The cells stay on the extinct lang as historical
  // territory and get gradually reabsorbed by living neighbours via
  // `reabsorbExtinctTerritory`. See territory.ts for rationale.
  it("releaseTerritory preserves the cell list (Phase 29 Tranche 4l)", () => {
    const lang = bareLang("L", { territory: { cells: [1, 2, 3] } });
    releaseTerritory(lang);
    expect(lang.territory!.cells).toEqual([1, 2, 3]);
  });
});

describe("§C — sim integration", () => {
  it("simulation init seeds the proto's territory", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "sim-init" });
    const proto = sim.getState().tree["L-0"]!.language;
    expect(proto.territory).toBeDefined();
    expect(proto.territory!.cells.length).toBeGreaterThanOrEqual(1);
  });

  it("default and explicit Earth-mode produce non-crashing 50-gen runs", () => {
    for (const mode of ["random", "earth"] as const) {
      const sim = createSimulation({ ...defaultConfig(), seed: `mode-${mode}`, mapMode: mode });
      for (let i = 0; i < 50; i++) sim.step();
      const state = sim.getState();
      let totalCells = 0;
      for (const id of Object.keys(state.tree)) {
        totalCells += state.tree[id]!.language.territory?.cells.length ?? 0;
      }
      expect(totalCells).toBeGreaterThan(0);
    }
  });
});

describe("§B — translator", () => {
  it("tokeniseEnglish detects subject + verb + object roles", () => {
    const tokens = tokeniseEnglish("the dog sees the mother");
    const subj = tokens.find((t) => t.features.role === "subject");
    const obj = tokens.find((t) => t.features.role === "object");
    const verb = tokens.find((t) => t.tag === "V");
    expect(subj?.lemma).toBe("dog");
    expect(verb?.lemma).toBe("see");
    expect(obj?.lemma).toBe("mother");
  });

  it("tokeniseEnglish handles past-tense -ed", () => {
    const tokens = tokeniseEnglish("the dog walked");
    const verb = tokens.find((t) => t.tag === "V");
    expect(verb).toBeDefined();
    expect(verb!.features.tense).toBe("past");
  });

  it("translateSentence resolves direct hits via the lexicon", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "translate-test" });
    for (let i = 0; i < 20; i++) sim.step();
    const state = sim.getState();
    const id = Object.keys(state.tree).find((k) => !state.tree[k]!.language.extinct);
    expect(id).toBeDefined();
    const lang = state.tree[id!]!.language;
    const result = translateSentence(lang, "the dog sees the mother");
    expect(result.targetTokens.length).toBeGreaterThan(0);
    const direct = result.targetTokens.filter((t) => t.resolution === "direct");
    expect(direct.length).toBeGreaterThan(0);
  });

  it("translateSentence rearranges by wordOrder", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "translate-order" });
    for (let i = 0; i < 5; i++) sim.step();
    const state = sim.getState();
    const id = Object.keys(state.tree).find((k) => !state.tree[k]!.language.extinct)!;
    const lang = state.tree[id]!.language;
    lang.grammar.wordOrder = "SOV";
    const result = translateSentence(lang, "dog sees mother");
    expect(result.targetTokens.length).toBeGreaterThanOrEqual(3);
    const lastResolved = result.targetTokens[result.targetTokens.length - 1]!;
    expect(lastResolved.englishTag).toBe("V");
  });

  it("translateSentence flags unresolved tokens", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "translate-miss" });
    for (let i = 0; i < 5; i++) sim.step();
    const state = sim.getState();
    const id = Object.keys(state.tree).find((k) => !state.tree[k]!.language.extinct)!;
    const lang = state.tree[id]!.language;
    const result = translateSentence(lang, "the xyzqwerty zooflark");
    expect(result.missing.length).toBeGreaterThan(0);
  });
});
