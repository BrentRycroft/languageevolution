import type { Language, WordForm } from "../types";

/**
 * stratal.ts — Phase 72g T1.
 *
 * Stratal phonology: underlying representations (URs) preserved
 * separately from surface representations (SRs).
 *
 * Pre-72g, sound changes mutated `lang.lexicon` (the surface) in place,
 * destroying the underlying form. Opacity (counter-feeding / counter-
 * bleeding interactions between rules) was impossible to model: once
 * a rule had bled or fed another, the simulator had no record of the
 * pre-rule state.
 *
 * Post-72g, when stratal mode is enabled (`lang.lexiconUR` defined),
 * each generation can:
 *   1. snapshot the current SR into UR before applying changes
 *      (preserving the input form), OR
 *   2. apply rules in stratal order (lexical → post-lexical) where
 *      each stratum reads from one map and writes to another.
 *
 * This module ships the foundation — minimal helpers for enabling
 * stratal mode and exposing the UR / SR pair. The active wiring of
 * stratal rule ordering into stepPhonology is intentionally NOT
 * shipped here — that's a deeper phonology refactor that needs its
 * own session. The current callers can detect opacity and inspect
 * URs in tests / probes / UI.
 */

/**
 * Enable stratal mode on a language. Snapshots the current
 * `lang.lexicon` into `lang.lexiconUR`, so the next generation's
 * sound changes operate on an SR derived from a preserved UR.
 *
 * Idempotent: a second call refreshes the UR snapshot.
 */
export function enableStratalMode(lang: Language): void {
  lang.lexiconUR = {};
  for (const meaning of Object.keys(lang.lexicon)) {
    lang.lexiconUR[meaning] = lang.lexicon[meaning]!.slice();
  }
}

/**
 * Read the underlying representation for a meaning. Falls back to the
 * surface form when stratal mode is not enabled (back-compat).
 */
export function getUR(lang: Language, meaning: string): WordForm | undefined {
  if (lang.lexiconUR && lang.lexiconUR[meaning]) {
    return lang.lexiconUR[meaning];
  }
  return lang.lexicon[meaning];
}

/**
 * Detect surface opacity: when SR differs from UR by more than just
 * the trivial identity. Useful for probes / diagnostics that want to
 * highlight forms whose surface no longer transparently reflects the
 * underlying input. Returns true when stratal mode is OFF (defensive
 * default — undefined UR means we can't claim opacity).
 */
export function isOpaque(lang: Language, meaning: string): boolean {
  if (!lang.lexiconUR) return false;
  const ur = lang.lexiconUR[meaning];
  const sr = lang.lexicon[meaning];
  if (!ur || !sr) return false;
  if (ur.length !== sr.length) return true;
  for (let i = 0; i < ur.length; i++) {
    if (ur[i] !== sr[i]) return true;
  }
  return false;
}
