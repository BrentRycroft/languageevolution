import type { Meaning } from "../types";

/**
 * expressive.ts
 *
 * Concept registry, tier ladder, frequency dynamics, derivational suffixes, taboo handling, lexicon shape. Key exports: EXPRESSIVE_MEANINGS, isExpressive, soundChangeSensitivity.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const EXPRESSIVE_MEANINGS: ReadonlySet<Meaning> = new Set([
  "sharp", "loud", "tiny", "bright",
  "crow", "buzz", "hum", "growl",
  "flash", "snap", "burst",
]);

export function isExpressive(meaning: Meaning): boolean {
  if (EXPRESSIVE_MEANINGS.has(meaning)) return true;
  if (/-intens$/.test(meaning)) return true;
  return false;
}

export function soundChangeSensitivity(meaning: Meaning): number {
  if (isExpressive(meaning)) return 0.15;
  return 1.0;
}
