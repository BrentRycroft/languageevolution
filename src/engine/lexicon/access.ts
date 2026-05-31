import type { Meaning, WordForm } from "../types";
import type { LexiconState } from "../domains";

/**
 * access.ts — the canonical lexicon ACCESSOR seam (concept re-key, R0).
 *
 * Every read/write/iteration of `lang.lexicon` routes through these helpers
 * instead of indexing the record directly. Today (R1) they are pass-through on
 * the gloss-keyed store, so routing a call site through them is byte-identical.
 * At R2 the canonical store flips to `Record<ConceptId, WordForm>` and ONLY the
 * bodies here change — `lexGet(lang, "water")` becomes
 * `lang.lexicon[conceptIdFor(lang, "water")]` etc. Call sites stay agnostic.
 * See docs/planning/CONCEPT-REKEY-PLAN.md.
 *
 * ORDER CONTRACT (determinism footgun — read this):
 *   - `lexKeys` returns meanings in **insertion order** (the raw `Object.keys`
 *     order). Several RNG-coupled sites feed this to `rng.int`-by-index, so the
 *     re-key must preserve the SAME positional sequence (insertion parity — the
 *     ConceptId store is built in the same order the gloss store was).
 *   - SORTED iteration is a DIFFERENT contract: use `orderedLexiconKeys`
 *     (conceptIdentity.ts), NOT `lexKeys().sort()`, so the re-key can reimplement
 *     the canonical sorted order in one place.
 *   Map `Object.keys(lexicon)` → `lexKeys(lang)`; `Object.keys(lexicon).sort()`
 *   → `orderedLexiconKeys(lang.lexicon)`. Do not conflate the two.
 */

/** Form for a meaning, or undefined. (`lang.lexicon[m]`) */
export function lexGet(lang: LexiconState, m: Meaning): WordForm | undefined {
  return lang.lexicon[m];
}

/** Whether the lexicon has a form for this meaning. (`lang.lexicon[m] !== undefined`) */
export function lexHas(lang: LexiconState, m: Meaning): boolean {
  return lang.lexicon[m] !== undefined;
}

/** Set/replace the form for a meaning, preserving insertion order. (`lang.lexicon[m] = form`) */
export function lexSet(lang: LexiconState, m: Meaning, form: WordForm): void {
  lang.lexicon[m] = form;
}

/** Remove a meaning's entry. (`delete lang.lexicon[m]`) */
export function lexDelete(lang: LexiconState, m: Meaning): void {
  delete lang.lexicon[m];
}

/** Meanings in INSERTION order. (`Object.keys(lang.lexicon)`) — NOT sorted. */
export function lexKeys(lang: LexiconState): Meaning[] {
  return Object.keys(lang.lexicon);
}

/** Forms in insertion order. (`Object.values(lang.lexicon)`) */
export function lexValues(lang: LexiconState): WordForm[] {
  return Object.values(lang.lexicon);
}

/** [meaning, form] pairs in insertion order. (`Object.entries(lang.lexicon)`) */
export function lexEntries(lang: LexiconState): [Meaning, WordForm][] {
  return Object.entries(lang.lexicon);
}

/** Number of entries. (`Object.keys(lang.lexicon).length`) */
export function lexSize(lang: LexiconState): number {
  return Object.keys(lang.lexicon).length;
}
