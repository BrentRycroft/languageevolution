import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import { sharedEdgeCount, territoryCentroid, type WorldMap } from "./map";
import { leafIds } from "../tree/leafIds";

const GROWTH_PROBABILITY_BASE = 0.04;

export function tickTerritory(
  lang: Language,
  tree: LanguageTree,
  map: WorldMap,
  rng: Rng,
): void {
  if (!lang.territory) {
    const closest = nearestLandCell(map, lang.coords ?? { x: 500, y: 300 });
    lang.territory = { cells: closest !== null ? [closest] : [] };
  }
  if (lang.territory.cells.length === 0) return;
  const pop = lang.speakers ?? 1000;
  const growthRate = GROWTH_PROBABILITY_BASE * Math.max(0.2, Math.log10(Math.max(100, pop) / 100));
  if (!rng.chance(growthRate)) {
    const c = territoryCentroid(map, lang.territory.cells);
    lang.coords = c;
    return;
  }
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
  if (targetCell.biome === "ocean") {
    const c = territoryCentroid(map, lang.territory.cells);
    lang.coords = c;
    return;
  }
  const occupier = findOccupier(target, tree);
  if (occupier && occupier.id !== lang.id) {
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
    if (occupier.territory) {
      occupier.territory.cells = occupier.territory.cells.filter((c) => c !== target);
      occupier.coords = territoryCentroid(map, occupier.territory.cells);
    }
  }
  // Phase 29 Tranche 4l: even if no living occupier, an EXTINCT lang
  // may still nominally own this cell (dead territory pending
  // reabsorption). Strip the cell from any such extinct owner so the
  // ownership map stays consistent.
  for (const id of Object.keys(tree)) {
    const node = tree[id]!;
    if (!node.language.extinct) continue;
    const cells = node.language.territory?.cells;
    if (!cells || !cells.includes(target)) continue;
    node.language.territory!.cells = cells.filter((c) => c !== target);
  }
  lang.territory.cells.push(target);
  lang.coords = territoryCentroid(map, lang.territory.cells);
}

export function partitionTerritory(
  parent: Language,
  daughters: Language[],
  map: WorldMap,
  rng: Rng,
): void {
  if (!parent.territory || parent.territory.cells.length === 0) {
    for (const d of daughters) {
      const seed = nearestLandCell(map, parent.coords ?? { x: 500, y: 300 });
      d.territory = { cells: seed !== null ? [seed] : [] };
      d.coords = territoryCentroid(map, d.territory.cells);
    }
    return;
  }
  const remaining = new Set(parent.territory.cells);
  const seeds: number[] = [];
  const cellPool = parent.territory.cells.slice();
  for (let i = 0; i < daughters.length && cellPool.length > 0; i++) {
    const idx = rng.int(cellPool.length);
    seeds.push(cellPool.splice(idx, 1)[0]!);
  }
  const ownership: Record<number, number> = {};
  for (let i = 0; i < seeds.length; i++) {
    ownership[seeds[i]!] = i;
    remaining.delete(seeds[i]!);
  }
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
  for (let i = 0; i < daughters.length; i++) {
    const cells: number[] = [];
    for (const [cellIdStr, owner] of Object.entries(ownership)) {
      if (owner === i) cells.push(Number(cellIdStr));
    }
    if (cells.length === 0 && i < seeds.length) {
      cells.push(seeds[i]!);
    } else if (cells.length === 0) {
      const fallback = parent.territory.cells[0];
      if (fallback !== undefined) cells.push(fallback);
    }
    daughters[i]!.territory = { cells };
    daughters[i]!.coords = territoryCentroid(map, cells);
  }
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

function findOccupier(cellId: number, tree: LanguageTree): Language | undefined {
  for (const id of leafIds(tree)) {
    const lang = tree[id]!.language;
    if (lang.extinct) continue;
    if (lang.territory?.cells.includes(cellId)) return lang;
  }
  return undefined;
}

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

export function releaseTerritory(lang: Language): void {
  if (!lang.territory) return;
  // Phase 29 Tranche 4l: don't blank cells outright. Keep them on the
  // extinct lang as historical territory; the new
  // `reabsorbExtinctTerritory` step will redistribute them to living
  // neighbours over a few generations, while MapView already prefers
  // the living owner via buildOwnership when both claim the cell.
}

/**
 * Phase 29 Tranche 4l: gradually reassign cells of extinct languages
 * to living neighbours that border them. Replaces the prior behavior
 * (immediate blanking) which left interior cells permanently orphaned.
 *
 * Per call: for every cell still claimed by an extinct lang that has a
 * living neighbour, with `perCellProb` probability transfer it to one
 * of the bordering living langs (uniform random pick). Over ~10 calls
 * a typical dead territory is fully reabsorbed.
 */
export function reabsorbExtinctTerritory(
  tree: LanguageTree,
  map: WorldMap,
  rng: Rng,
  perCellProb = 0.18,
): void {
  const aliveByCell = new Map<number, string>();
  for (const id of Object.keys(tree)) {
    const lang = tree[id]!.language;
    if (lang.extinct) continue;
    for (const c of lang.territory?.cells ?? []) aliveByCell.set(c, id);
  }
  for (const id of Object.keys(tree)) {
    const lang = tree[id]!.language;
    if (!lang.extinct) continue;
    const cells = lang.territory?.cells;
    if (!cells || cells.length === 0) continue;
    const remaining: number[] = [];
    for (const cellId of cells) {
      if (aliveByCell.has(cellId)) {
        // Already claimed by a living lang (e.g. via tickTerritory);
        // drop from this extinct owner.
        continue;
      }
      if (!rng.chance(perCellProb)) {
        remaining.push(cellId);
        continue;
      }
      const cell = map.cells[cellId];
      if (!cell) {
        remaining.push(cellId);
        continue;
      }
      const candidates: string[] = [];
      for (const n of cell.neighbours) {
        const owner = aliveByCell.get(n);
        if (owner) candidates.push(owner);
      }
      if (candidates.length === 0) {
        remaining.push(cellId);
        continue;
      }
      const inheritor = candidates[rng.int(candidates.length)]!;
      const inheritorLang = tree[inheritor]!.language;
      if (!inheritorLang.territory) inheritorLang.territory = { cells: [] };
      inheritorLang.territory.cells.push(cellId);
      aliveByCell.set(cellId, inheritor);
      inheritorLang.coords = territoryCentroid(map, inheritorLang.territory.cells);
    }
    lang.territory = { cells: remaining };
  }
}
