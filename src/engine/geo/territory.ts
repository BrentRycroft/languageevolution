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
  lang.territory = { cells: [] };
}
