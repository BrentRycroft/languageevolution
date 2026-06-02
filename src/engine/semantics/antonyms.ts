import type { Meaning } from "../types";

/**
 * antonyms.ts
 *
 * Curated antonym set (evolution-realism Phase 3b). GRADABLE and
 * COMPLEMENTARY (contradictory) opposites ONLY — big/small, alive/dead,
 * hot/cold. Deliberately NOT converses / relational opposites
 * (brother/sister, buy/sell, come/go, husband/wife): those legitimately
 * colexify into a single word cross-linguistically (a "sibling" term is
 * attested), so they stay eligible for drift.
 *
 * Used to gate semantic drift: a content word must not drift into its own
 * opposite. The audit found the 12-dim embedding was degenerate — antonyms
 * share a cluster centroid, so cos(alive,dead)=0.95 and the embedding-
 * nearest drift target could BE the antonym. Phase 3a demotes that
 * embedding below the curated neighbour/colex graph (which never links true
 * antonyms); this set is the belt-and-suspenders guard for the fallback
 * paths and for curated entries that list a near-opposite.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */
export const ANTONYM_PAIRS: ReadonlyArray<readonly [Meaning, Meaning]> = [
  ["big", "small"], ["good", "bad"], ["hot", "cold"], ["new", "old"],
  ["alive", "dead"], ["full", "empty"], ["wet", "dry"], ["long", "short"],
  ["light", "dark"], ["fast", "slow"], ["hard", "soft"], ["happy", "sad"],
  ["high", "low"], ["strong", "weak"], ["rich", "poor"], ["clean", "dirty"],
  ["wide", "narrow"], ["deep", "shallow"], ["thick", "thin"], ["sharp", "dull"],
  ["young", "old"], ["true", "false"], ["right", "wrong"], ["tight", "loose"],
  ["smooth", "rough"], ["near", "far"], ["early", "late"], ["bright", "dim"],
  ["heavy", "light"], ["sweet", "sour"],
];

const ANTONYM_OF = new Map<Meaning, Set<Meaning>>();
for (const [a, b] of ANTONYM_PAIRS) {
  if (!ANTONYM_OF.has(a)) ANTONYM_OF.set(a, new Set());
  if (!ANTONYM_OF.has(b)) ANTONYM_OF.set(b, new Set());
  ANTONYM_OF.get(a)!.add(b);
  ANTONYM_OF.get(b)!.add(a);
}

/** True if a and b are a curated gradable/complementary antonym pair. */
export function areAntonyms(a: Meaning, b: Meaning): boolean {
  return ANTONYM_OF.get(a)?.has(b) ?? false;
}
