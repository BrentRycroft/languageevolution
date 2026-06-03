import type { Language, Meaning } from "../types";
import { zipfFrequencyFor } from "./concepts";

/**
 * frequencyDynamics.ts
 *
 * Concept registry, tier ladder, frequency dynamics, derivational suffixes, taboo handling, lexicon shape. Key exports: bumpFrequency, decayFrequencies.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const MIN = 0.05;
const MAX = 0.95;
const DEFAULT = 0.5;

/**
 * Phase 6a: per-generation pull of each word's frequency BACK toward its
 * Zipfian rank seed. This replaces the old blanket ×0.998 decay-toward-zero.
 * A word transiently pushed up by a real usage event (coinage, borrowing)
 * relaxes to its rank frequency over ~1/RATE generations, so the distribution
 * stays a STABLE Zipfian spread instead of (old regime) every word saturating
 * at the 0.95 cap or collapsing to the floor. Mild, so genuine usage shifts
 * still register for a while.
 */
const REVERSION_RATE = 0.02;

export function bumpFrequency(lang: Language, meaning: Meaning, delta: number): void {
  const cur = lang.wordFrequencyHints[meaning] ?? DEFAULT;
  const next = Math.max(MIN, Math.min(MAX, cur + delta));
  lang.wordFrequencyHints[meaning] = next;
}

export function decayFrequencies(lang: Language): void {
  for (const m of Object.keys(lang.wordFrequencyHints)) {
    const cur = lang.wordFrequencyHints[m]!;
    const seed = zipfFrequencyFor(m);
    const next = cur + (seed - cur) * REVERSION_RATE;
    lang.wordFrequencyHints[m] = Math.max(MIN, Math.min(MAX, next));
  }
}
