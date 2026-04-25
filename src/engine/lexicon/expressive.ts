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
  // Sensory ideophones — sharp / loud / tiny / bright vocabulary that
  // cross-linguistically resists regular sound change. The list draws
  // from typologically common iconic categories (Dingemanse 2012).
  "sharp", "loud", "tiny", "bright",
  // Animal calls — onomatopoetic and similarly resistant.
  "crow", "buzz", "hum", "growl",
  // Quick / sudden motions
  "flash", "snap", "burst",
  // Reduplicated intensifier suffix is handled by the regex below.
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
