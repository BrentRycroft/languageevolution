import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import { sharedEdgeCount, territoryCentroid, type WorldMap } from "./map";
import { leafIds } from "../tree/split";

/**
 * Territory dynamics. Each language holds a contiguous (or nearly so)
 * set of Voronoi cells on the world map. Per-generation rules:
 *
 *   - **Growth.** With low probability, a language tries to expand
 *     into one neighbouring cell. The chance scales with log(speakers)
 *     so larger communities expand faster. Uncontested cells get
 *     added; contested cells (held by another language) require the
 *     attacker to have more speakers.
 *   - **Splits.** When a parent splits into N daughters, the parent's
 *     cells are partitioned by flood-fill from N seed cells.
 *   - **Death.** Extinct languages release their cells back to the
 *     unowned pool. Adjacent alive languages can pick them up next
 *     gen via normal growth.
 *
 * Territory derivation drives `lang.coords` (always set to the
 * centroid of the territory) so areal mechanics keep their existing
 * distance-based gates working alongside the new share-edge metric.
 */

const GROWTH_PROBABILITY_BASE = 0.04;

/**
 * Per-step territory tick. Called once per alive leaf per generation
 * inside `simulation.ts`. Mutates `lang.territory.cells` and
 * `lang.coords` in place.
 */
export function tickTerritory(
  lang: Language,
  tree: LanguageTree,
  map: WorldMap,
  rng: Rng,
): void {
  if (!lang.territory) {
    // Pre-territory save → derive a singleton territory from coords.
    const closest = nearestLandCell(map, lang.coords ?? { x: 500, y: 300 });
    lang.territory = { cells: closest !== null ? [closest] : [] };
  }
  if (lang.territory.cells.length === 0) return;
  // Growth gate scaled by log10(speakers/100). A 100-speaker
  // language barely expands; a 100k-speaker one expands frequently.
  const pop = lang.speakers ?? 1000;
  const growthRate = GROWTH_PROBABILITY_BASE * Math.max(0.2, Math.log10(Math.max(100, pop) / 100));
  if (!rng.chance(growthRate)) {
    // No growth this tick — still refresh the centroid for safety.
    const c = territoryCentroid(map, lang.territory.cells);
    lang.coords = c;
    return;
  }
  // Pick a random cell on our boundary.
  const ours = new Set(lang.territory.cells);
  const boundary: number[] = [];
  for (const cellId of lang.territory.cells) {
    const cell = map.cells[cellId];
    if (!cell) continue;
    for (const n of cell.neighbours) {
      if (ours.has(n)) continue;
      boundary.push(n);
    }
  }
  if (boundary.length === 0) {
    const c = territoryCentroid(map, lang.territory.cells);
    lang.coords = c;
    return;
  }
  const target = boundary[rng.int(boundary.length)]!;
  const targetCell = map.cells[target];
  if (!targetCell) return;
  // Ocean cells aren't claimable directly — communities don't live
  // on the open sea.
  if (targetCell.biome === "ocean") {
    const c = territoryCentroid(map, lang.territory.cells);
    lang.coords = c;
    return;
  }
  // Is the cell already owned by another alive language?
  const occupier = findOccupier(target, tree);
  if (occupier && occupier.id !== lang.id) {
    // Contested. We win iff we have more speakers, with a coin flip
    // to break ties / dampen the outcome.
    const ourPop = lang.speakers ?? 1000;
    const theirPop = occupier.speakers ?? 1000;
    if (ourPop <= theirPop) {
      const c = territoryCentroid(map, lang.territory.cells);
      lang.coords = c;
      return;
    }
    if (!rng.chance(Math.min(0.7, (ourPop - theirPop) / (ourPop + theirPop)))) {
      const c = territoryCentroid(map, lang.territory.cells);
      lang.coords = c;
      return;
    }
    // Win — strip the cell from the occupier.
    if (occupier.territory) {
      occupier.territory.cells = occupier.territory.cells.filter((c) => c !== target);
      occupier.coords = territoryCentroid(map, occupier.territory.cells);
    }
  }
  lang.territory.cells.push(target);
  lang.coords = territoryCentroid(map, lang.territory.cells);
}

/**
 * Partition a parent's territory among `daughterIds.length` children
 * via flood-fill from random seed cells. Each daughter gets at least
 * one cell when possible.
 */
export function partitionTerritory(
  parent: Language,
  daughters: Language[],
  map: WorldMap,
  rng: Rng,
): void {
  if (!parent.territory || parent.territory.cells.length === 0) {
    // No territory to partition — daughters get singleton territories
    // around the parent's coords.
    for (const d of daughters) {
      const seed = nearestLandCell(map, parent.coords ?? { x: 500, y: 300 });
      d.territory = { cells: seed !== null ? [seed] : [] };
      d.coords = territoryCentroid(map, d.territory.cells);
    }
    return;
  }
  const remaining = new Set(parent.territory.cells);
  // Pick distinct seed cells for each daughter — the daughters that
  // run out of cells get singleton starts at the parent's centroid.
  const seeds: number[] = [];
  const cellPool = parent.territory.cells.slice();
  for (let i = 0; i < daughters.length && cellPool.length > 0; i++) {
    const idx = rng.int(cellPool.length);
    seeds.push(cellPool.splice(idx, 1)[0]!);
  }
  // Flood-fill: assign each remaining cell to the daughter whose seed
  // is nearest by hop count along the cell graph.
  const ownership: Record<number, number> = {};
  for (let i = 0; i < seeds.length; i++) {
    ownership[seeds[i]!] = i;
    remaining.delete(seeds[i]!);
  }
  // BFS frontier expansion.
  const frontiers: number[][] = seeds.map((s) => [s]);
  while (remaining.size > 0) {
    let progressed = false;
    for (let i = 0; i < frontiers.length; i++) {
      const front = frontiers[i]!;
      const next: number[] = [];
      for (const cellId of front) {
        const cell = map.cells[cellId];
        if (!cell) continue;
        for (const n of cell.neighbours) {
          if (!remaining.has(n)) continue;
          if (ownership[n] !== undefined) continue;
          ownership[n] = i;
          remaining.delete(n);
          next.push(n);
          progressed = true;
        }
      }
      frontiers[i] = next;
    }
    if (!progressed) break;
  }
  // Assemble per-daughter cell lists.
  for (let i = 0; i < daughters.length; i++) {
    const cells: number[] = [];
    for (const [cellIdStr, owner] of Object.entries(ownership)) {
      if (owner === i) cells.push(Number(cellIdStr));
    }
    if (cells.length === 0 && i < seeds.length) {
      cells.push(seeds[i]!);
    } else if (cells.length === 0) {
      // No seed left — give this daughter a copy of any cell so it
      // isn't stranded with empty territory.
      const fallback = parent.territory.cells[0];
      if (fallback !== undefined) cells.push(fallback);
    }
    daughters[i]!.territory = { cells };
    daughters[i]!.coords = territoryCentroid(map, cells);
  }
  // Cells that didn't get reached by any frontier (e.g. an isolated
  // sub-region) go to the daughter with the smallest territory so
  // far. Improves balance.
  if (remaining.size > 0) {
    const sizes = daughters.map((d) => d.territory!.cells.length);
    for (const cellId of remaining) {
      let smallestIdx = 0;
      for (let i = 1; i < sizes.length; i++) {
        if (sizes[i]! < sizes[smallestIdx]!) smallestIdx = i;
      }
      daughters[smallestIdx]!.territory!.cells.push(cellId);
      sizes[smallestIdx]++;
    }
    for (const d of daughters) {
      d.coords = territoryCentroid(map, d.territory!.cells);
    }
  }
}

/**
 * Look up which (alive) language currently owns a given cell. Returns
 * undefined if no alive leaf claims it. O(leaves) — fine for the
 * leaf-counts we run at.
 */
function findOccupier(cellId: number, tree: LanguageTree): Language | undefined {
  for (const id of leafIds(tree)) {
    const lang = tree[id]!.language;
    if (lang.extinct) continue;
    if (lang.territory?.cells.includes(cellId)) return lang;
  }
  return undefined;
}

/** Closest non-ocean cell to a given (x, y). */
export function nearestLandCell(map: WorldMap, p: { x: number; y: number }): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const cell of map.cells) {
    if (cell.biome === "ocean") continue;
    const dx = cell.centroid.x - p.x;
    const dy = cell.centroid.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = cell.id;
    }
  }
  return best;
}

/**
 * Compute a normalised areal-share affinity between two languages
 * based on cells whose edges they share. Output ∈ [0, 1].
 *   1 - exp(-shareEdges / 3)
 * yields ~95 % of max for two languages with a long border.
 */
export function arealShareAffinity(
  map: WorldMap,
  a: Language,
  b: Language,
): number {
  const ac = a.territory?.cells ?? [];
  const bc = b.territory?.cells ?? [];
  const shared = sharedEdgeCount(map, ac, bc);
  return 1 - Math.exp(-shared / 3);
}

/**
 * Free a language's cells when it goes extinct. Cells become
 * unowned; nearby alive languages can absorb them next gen via
 * normal growth.
 */
export function releaseTerritory(lang: Language): void {
  if (!lang.territory) return;
  lang.territory = { cells: [] };
}
