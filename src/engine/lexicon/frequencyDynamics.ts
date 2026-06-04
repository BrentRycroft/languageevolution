import type { Language, Meaning } from "../types";
import { zipfFrequencyFor } from "./concepts";
import { lexKeys } from "./access";

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

/**
 * Lane B (#9 relevancy/usage signal): a steady per-generation DISUSE drift that
 * pulls every word a little toward the discard floor, ON TOP OF the mild
 * mean-reversion toward its rank seed. This is what makes frequency track USAGE
 * rather than age/rank: a word that is never bumped by a real usage event
 * (coinage, borrowing, drift, contact) loses ground each generation and
 * eventually sinks below the obsolescence death threshold. A word that IS used
 * gets bumped back up and stays core. The reversion target is the rank seed (the
 * ceiling a USED word relaxes to); the disuse drift is the downward pressure a
 * word must be used to resist. DISUSE_DRIFT must be able to dominate the typical
 * per-event bump magnitude (≈0.06–0.1) when usage is sparse, so unused words
 * really do decay toward discard instead of parking at their rank seed forever.
 */
const DISUSE_DRIFT = 0.012;

/**
 * The relevancy floor that disuse drift pulls toward — below the obsolescence
 * LOW_FREQ_THRESHOLD so an un-bumped word eventually enters the death zone.
 */
const DISUSE_FLOOR = 0.05;

export function bumpFrequency(lang: Language, meaning: Meaning, delta: number): void {
  const cur = lang.wordFrequencyHints[meaning] ?? DEFAULT;
  const next = Math.max(MIN, Math.min(MAX, cur + delta));
  lang.wordFrequencyHints[meaning] = next;
}

export function decayFrequencies(lang: Language): void {
  // Lane B: iterate over the ACTUAL lexicon, not just words that already carry a
  // hint. Pre-Lane-B this looped `Object.keys(wordFrequencyHints)`, so the bulk
  // of seeded registry words (which start with NO hint and default to 0.5) were
  // invisible to the relevancy signal and never decayed — "frequency" only ever
  // moved for coined/borrowed words. Now every lexeme participates: a word with
  // no hint is treated as sitting at its rank seed and then subjected to the same
  // mean-reversion + disuse drift, so the disuse-death channel can actually reach
  // long-tail registry vocabulary.
  for (const m of lexKeys(lang)) {
    const seed = zipfFrequencyFor(m);
    const cur = lang.wordFrequencyHints[m] ?? seed;
    // Mild mean-reversion toward the rank seed (the USED-word attractor)…
    let next = cur + (seed - cur) * REVERSION_RATE;
    // …plus a steady disuse drift toward the discard floor. The net standing
    // point for a never-bumped word sits BELOW its rank seed, so frequency
    // encodes relevancy (recent usage), not merely tier/age. A real usage event
    // (bumpFrequency) lifts the word back above this drift each time it fires.
    next += (DISUSE_FLOOR - next) * DISUSE_DRIFT;
    lang.wordFrequencyHints[m] = Math.max(MIN, Math.min(MAX, next));
  }
}
