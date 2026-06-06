import type { WordForm } from "../types";
import type { PhonologyState, LexiconState } from "../domains";
import { lexGet } from "../lexicon/access";
import type { LexemeId } from "../lexicon/lexemeIdentity";

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
 * Enable stratal mode on a language with the default "each-gen"
 * refresh policy. Snapshots the current `lang.lexicon` into
 * `lang.lexiconUR`. Idempotent: a second call refreshes the UR.
 */
export function enableStratalMode(lang: PhonologyState & LexiconState): void {
  lang.lexiconUR = {};
  for (const cid of Object.keys(lang.lexicon)) {
    lang.lexiconUR[cid] = lang.lexicon[cid as LexemeId]!.slice();
  }
  lang.lexiconURRefreshPolicy = "each-gen";
}

/**
 * Phase 72g T1 (full-delivery defer-1c): enable stratal mode with
 * "manual" refresh policy. URs persist across gens; the caller is
 * responsible for invoking `refreshUR(lang)` whenever a reanalysis
 * or other event justifies updating the UR. Use this for opacity
 * studies that span multiple generations.
 */
export function enableStratalModeManual(lang: PhonologyState & LexiconState): void {
  lang.lexiconUR = {};
  for (const cid of Object.keys(lang.lexicon)) {
    lang.lexiconUR[cid] = lang.lexicon[cid as LexemeId]!.slice();
  }
  lang.lexiconURRefreshPolicy = "manual";
}

/**
 * Phase 72g T1 (full-delivery defer-1c): manually refresh the UR
 * snapshot to match the current SR. Use under "manual" refresh
 * policy when a reanalysis event justifies updating UR (e.g.,
 * a morphological re-categorisation makes the speaker's mental
 * representation align with the surface).
 */
export function refreshUR(lang: PhonologyState & LexiconState): void {
  if (lang.lexiconUR === undefined) return;
  lang.lexiconUR = {};
  for (const cid of Object.keys(lang.lexicon)) {
    lang.lexiconUR[cid] = lang.lexicon[cid as LexemeId]!.slice();
  }
}

/**
 * Read the underlying representation for a meaning. Falls back to the
 * surface form when stratal mode is not enabled (back-compat).
 */
export function getUR(lang: PhonologyState & LexiconState, meaning: string): WordForm | undefined {
  const cid = lang.lexemeIds?.[meaning] as LexemeId | undefined;
  if (lang.lexiconUR && cid && lang.lexiconUR[cid]) {
    return lang.lexiconUR[cid];
  }
  return lexGet(lang, meaning);
}

/**
 * Detect surface opacity: when SR differs from UR by more than just
 * the trivial identity. Useful for probes / diagnostics that want to
 * highlight forms whose surface no longer transparently reflects the
 * underlying input. Returns true when stratal mode is OFF (defensive
 * default — undefined UR means we can't claim opacity).
 */
export function isOpaque(lang: PhonologyState & LexiconState, meaning: string): boolean {
  if (!lang.lexiconUR) return false;
  const cid = lang.lexemeIds?.[meaning] as LexemeId | undefined;
  const ur = cid ? lang.lexiconUR[cid] : undefined;
  const sr = lexGet(lang, meaning);
  if (!ur || !sr) return false;
  if (ur.length !== sr.length) return true;
  for (let i = 0; i < ur.length; i++) {
    if (ur[i] !== sr[i]) return true;
  }
  return false;
}
