import type { Rng } from "../rng";

/**
 * Pick one item from `items` weighted by `getWeight`. Returns `null` when all
 * weights are zero or the list is empty. Deterministic under the passed RNG.
 */
export function weightedSample<T>(
  items: readonly T[],
  getWeight: (item: T) => number,
  rng: Rng,
): T | null {
  if (items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    const w = getWeight(item);
    if (w > 0) total += w;
  }
  if (total <= 0) return null;
  let pick = rng.next() * total;
  for (const item of items) {
    const w = getWeight(item);
    if (w <= 0) continue;
    pick -= w;
    if (pick <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}
