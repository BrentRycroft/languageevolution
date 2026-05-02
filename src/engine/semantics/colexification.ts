import type { Language, Meaning } from "../types";

/**
 * Records that two meanings now share a single lexical form (i.e. are
 * colexified, the cross-linguistic term for "same word for both").
 *
 * Used by:
 *  - drift.ts when a polysemous drift fires (both meanings remain in the
 *    lexicon, sharing the form).
 *  - recarve.ts merge events use a one-sided form of this (only the winner
 *    is recorded as "colexifies with [losers...]"), preserved here for
 *    backwards-compat by exposing a `oneSided` variant.
 *
 * Bidirectional by default — either meaning can be queried to find its
 * colexified partners.
 */
export function recordColexification(
  lang: Language,
  a: Meaning,
  b: Meaning,
): void {
  if (a === b) return;
  if (!lang.colexifiedAs) lang.colexifiedAs = {};
  appendUnique(lang.colexifiedAs, a, b);
  appendUnique(lang.colexifiedAs, b, a);
}

/**
 * One-sided record (winner gets credit for absorbing loser, loser is being
 * deleted from the lexicon and so cannot be queried). Used by merge-style
 * recarve events.
 */
export function recordOneSidedColexification(
  lang: Language,
  winner: Meaning,
  loser: Meaning,
): void {
  if (winner === loser) return;
  if (!lang.colexifiedAs) lang.colexifiedAs = {};
  appendUnique(lang.colexifiedAs, winner, loser);
}

function appendUnique(
  map: Record<Meaning, Meaning[]>,
  key: Meaning,
  value: Meaning,
): void {
  const bag = map[key] ?? [];
  if (!bag.includes(value)) bag.push(value);
  map[key] = bag;
}
