/**
 * Phase 48 T2: homonym-collision check used by the sound-change
 * actuation hook in `phonology/apply.ts`.
 *
 * Linguistic basis: Martinet 1952 ("functional load"); Wedel et al.
 * 2013 ("Functional Load and the Lexicon"); Blevins & Wedel 2009
 * ("Inhibited sound change"). Speakers tend not to actuate
 * word-specific sound changes that would make a word homophonous
 * with an UNRELATED word — but ARE willing to do so when the
 * resulting homonym is with a paradigm member, derivational sibling,
 * compound part, or semantic neighbour.
 *
 * The check operates per-actuation: given a candidate output form
 * for a meaning, return true iff some other word's primary form
 * already matches the candidate AND none of the colliding senses are
 * "related" per `areMeaningsRelated` (T1).
 */

import type { Language, Meaning, WordForm } from "../types";
import { formKeyOf, areMeaningsRelated } from "./word";

/**
 * Returns true when applying a sound change that produces
 * `candidateForm` for `meaning` would create a homonym with a word
 * that is NOT related to `meaning` (per `areMeaningsRelated`).
 *
 * - false: no collision, OR collision only with related words.
 * - true: collision with at least one unrelated word — caller may
 *   choose to inhibit the change.
 *
 * Uses `lang.wordsByFormKey` for O(1) lookup; the index is rebuilt
 * after each wholesale phonology pass via `rebuildFormKeyIndex`.
 *
 * Edge cases:
 * - Empty `candidateForm` returns false (no collision is meaningful).
 * - If `meaning`'s own current form already matches the candidate
 *   (i.e. the rule is a no-op), returns false.
 * - If the colliding word IS the same `meaning` (a self-collision via
 *   another sense), returns false — same lexeme, no homonym.
 */
export function wouldCreateUnrelatedHomonym(
  lang: Language,
  meaning: Meaning,
  candidateForm: WordForm,
): boolean {
  if (candidateForm.length === 0) return false;
  if (!lang.words || lang.words.length === 0) return false;
  const key = formKeyOf(candidateForm);
  // Prefer the O(1) form-key index when present; fall back to a linear
  // scan of `lang.words` when the index hasn't been built (e.g., in
  // synthetic test fixtures or pre-Phase-29-Tranche-1e code paths).
  let collidingWord = lang.wordsByFormKey?.get(key);
  if (!collidingWord) {
    for (const w of lang.words) {
      if (w.formKey === key) {
        collidingWord = w;
        break;
      }
    }
  }
  if (!collidingWord) return false;
  // Skip self-collisions: if the word that owns this form-key already
  // hosts `meaning` as one of its senses, this isn't a new homonym.
  for (const sense of collidingWord.senses) {
    if (sense.meaning === meaning) return false;
  }
  // For each colliding sense, check relatedness. Return true only when
  // EVERY colliding sense is unrelated (a single related collision
  // means the change can fold in as polysemy).
  let hasUnrelatedSense = false;
  for (const sense of collidingWord.senses) {
    if (!areMeaningsRelated(lang, meaning, sense.meaning)) {
      hasUnrelatedSense = true;
    } else {
      // At least one related sense — treat as polysemy candidate, allow.
      return false;
    }
  }
  return hasUnrelatedSense;
}
