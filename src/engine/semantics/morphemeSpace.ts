/**
 * morphemeSpace.ts — the additive-by-construction composition layer (A1).
 *
 * A word's meaning point is the SUM of its morphemes' points (compose). Because the space
 * is built so this holds for known words (the factorization in Plan 2), composition is
 * exact, which is what makes gap-filling (Track B) and preset morphemization (Track C)
 * well-defined. compositionError measures violation of the invariant (0 = exact).
 */
import type { WordForm } from "../types";
import { makeRng } from "../rng";
import { type Vec, sumVecs, distanceSq } from "./vec";

export type MorphemeType = "root" | "prefix" | "suffix" | "infix";

export interface Morpheme {
  id: string;
  form: WordForm;
  point: Vec;
  type: MorphemeType;
}

/** Additive composition: a word's point = the sum of its morpheme points. */
export function compose(points: readonly Vec[]): Vec {
  return sumVecs(points);
}

/** Squared distance between a stored point and the composition of its morphemes (0 = exact). */
export function compositionError(point: Vec, morphemePoints: readonly Vec[]): number {
  return distanceSq(point, compose(morphemePoints));
}

/**
 * Greedy search for a small morpheme combination whose composed point is nearest `target`.
 * At each step it adds the morpheme that most reduces the (integer) squared distance, up to
 * `maxParts`, stopping when nothing improves. Ties at the same minimal distance are broken
 * by a seeded RNG so the result is deterministic. This is the engine of necessity-driven
 * coinage (Track B).
 *
 * A morpheme MAY be selected more than once — the primitive imposes no distinctness policy,
 * because repetition is a legitimate compose (reduplication / intensives). The CALLER
 * (Track B) decides whether to constrain it (e.g. pass a deduplicated inventory). Returns
 * `[]` for an empty inventory or a `target` already at the origin (nothing improves on the
 * zero composition).
 *
 * Cost: O(maxParts² · |inventory|) — each of the `maxParts` steps rescans the inventory and
 * re-sums the growing partial composition. Fine as a primitive at these scales; Track B can
 * optimise (incremental sums / a `used` set) when it wires this into the hot path.
 */
export function nearestComposition(
  target: Vec,
  inventory: readonly Morpheme[],
  maxParts: number,
  seed: string,
): Morpheme[] {
  const chosen: Morpheme[] = [];
  const points: Vec[] = [];
  let bestDist = distanceSq(target, sumVecs(points));
  for (let step = 0; step < maxParts; step++) {
    let minDist = bestDist;
    for (const m of inventory) {
      const d = distanceSq(target, sumVecs([...points, m.point]));
      if (d < minDist) minDist = d;
    }
    if (minDist >= bestDist) break;
    const ties = inventory.filter(
      (m) => distanceSq(target, sumVecs([...points, m.point])) === minDist,
    );
    const pick = ties.length === 1 ? ties[0]! : ties[makeRng(`${seed}|${step}`).int(ties.length)]!;
    chosen.push(pick);
    points.push(pick.point);
    bestDist = minDist;
  }
  return chosen;
}
