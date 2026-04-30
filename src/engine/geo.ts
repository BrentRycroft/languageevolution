import type { LanguageTree, SimulationState } from "./types";
import { fnv1a } from "./rng";

export interface GeoPosition {
  x: number;
  y: number;
}

export function computeGeoLayout(state: SimulationState): Record<string, GeoPosition> {
  const out: Record<string, GeoPosition> = {};
  const visit = (id: string, pos: GeoPosition, depth: number) => {
    out[id] = pos;
    const node = state.tree[id];
    if (!node) return;
    const children = node.childrenIds;
    if (children.length === 0) return;
    children.forEach((childId, i) => {
      const hash = fnv1a(childId) / 0xffffffff;
      const step = 120 / Math.sqrt(1 + depth);
      const spread = children.length > 1 ? (i / (children.length - 1) - 0.5) : 0;
      const angle = hash * Math.PI * 2 + spread * 1.1;
      const dx = Math.cos(angle) * step;
      const dy = Math.sin(angle) * step;
      visit(childId, { x: pos.x + dx, y: pos.y + dy }, depth + 1);
    });
  };
  visit(state.rootId, { x: 0, y: 0 }, 0);
  return out;
}

export function geoDistance(a: GeoPosition, b: GeoPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function boundingBox(positions: Record<string, GeoPosition>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of Object.values(positions)) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function leafIdsAlive(tree: LanguageTree): string[] {
  return Object.keys(tree)
    .filter(
      (id) => tree[id]!.childrenIds.length === 0 && !tree[id]!.language.extinct,
    )
    .sort();
}
