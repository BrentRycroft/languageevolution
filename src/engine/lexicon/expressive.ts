import type { Meaning } from "../types";

/**
 * Meanings whose forms are "expressive" — ideophones, onomatopoeia,
 * emotionally or sensorially iconic. Real languages' expressive lexicon
 * resists regular sound change: the form sticks around long after cognate
 * peers have drifted, because replacing it would dilute the iconicity.
 *
 * Words tagged here skip phonological mutation with high probability.
 */
export const EXPRESSIVE_MEANINGS: ReadonlySet<Meaning> = new Set([
  // None tagged in the default seed lexicon yet — add as ideophone-ish
  // meanings ("sharp", "loud", "tiny") get introduced.
  // The compound rule in genesis may also produce expressive forms; we
  // treat the `-intens` reduplication suffix as expressive below.
]);

export function isExpressive(meaning: Meaning): boolean {
  if (EXPRESSIVE_MEANINGS.has(meaning)) return true;
  // Reduplicated intensifier forms (`-intens`) are intrinsically expressive.
  if (/-intens$/.test(meaning)) return true;
  return false;
}

/**
 * Probability that a sound-change rule is actually applied to a word with
 * this meaning. Expressive words mostly resist change.
 */
export function soundChangeSensitivity(meaning: Meaning): number {
  if (isExpressive(meaning)) return 0.15;
  return 1.0;
}
