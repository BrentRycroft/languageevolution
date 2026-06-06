import type { Meaning, WordForm } from "../types";
import type { LexiconState } from "../domains";
import { lexemeIdFor, buildLexemeIdToGloss, type LexemeId } from "./conceptIdentity";

/**
 * access.ts — the canonical lexicon ACCESSOR seam (concept re-key).
 *
 * Every read/write/iteration of `lang.lexicon` routes through these helpers
 * instead of indexing the record directly. R2 (the flip) made the canonical
 * store `Record<LexemeId, WordForm>`; ONLY the bodies here translate the
 * gloss the engine speaks in (`Meaning`) to/from the LexemeId the store is
 * keyed by. Call sites stay gloss-agnostic.
 * See docs/planning/CONCEPT-REKEY-PLAN.md.
 *
 * KEYING DISCIPLINE: `lang.lexicon` is the ONLY LexemeId-keyed map. Every
 * satellite per-meaning field (wordFrequencyHints, registerOf,
 * lastChangeGeneration, localNeighbors, …) and `lang.conceptIds` itself stay
 * GLOSS-keyed. The bridge is `meaningForLexemeId` / `lexemeIdFor`.
 *
 * ORDER CONTRACT (determinism footgun — read this):
 *   - `lexKeys` returns GLOSSES in **insertion order** (the store's raw
 *     `Object.keys` order, resolved to glosses). Several RNG-coupled sites feed
 *     this to `rng.int`-by-index; insertion parity holds because the cid store
 *     is built in the same order the gloss store was.
 *   - SORTED iteration is a DIFFERENT contract: use `orderedLexiconKeys(lang)`
 *     (glosses) or `orderedLexemeIds(lexicon, lang)` (the matching store keys),
 *     NOT `lexKeys().sort()`, so the canonical sorted order lives in one place.
 *
 * Reads (`lexGet`/`lexHas`/`lexDelete`) use the NON-minting lookup
 * (`lang.conceptIds?.[m]`) so a miss never perturbs the LexemeId mint stream;
 * only `lexSet` mints (via `lexemeIdFor`) when a genuinely new meaning is
 * coined.
 */

/** Form for a meaning, or undefined. */
export function lexGet(lang: LexiconState, m: Meaning): WordForm | undefined {
  const cid = lang.conceptIds?.[m] as LexemeId | undefined;
  return cid === undefined ? undefined : lang.lexicon[cid];
}

/** Whether the lexicon has a form for this meaning. */
export function lexHas(lang: LexiconState, m: Meaning): boolean {
  const cid = lang.conceptIds?.[m] as LexemeId | undefined;
  return cid !== undefined && lang.lexicon[cid] !== undefined;
}

/** Set/replace the form for a meaning. Mints a LexemeId for a new meaning,
 * appending to the store in call order (insertion parity with the old gloss
 * store). An existing meaning updates its LexemeId entry in place. */
export function lexSet(lang: LexiconState, m: Meaning, form: WordForm): void {
  lang.lexicon[lexemeIdFor(lang, m)] = form;
}

/** Remove a meaning's entry from the store. (`lang.conceptIds` is purged
 * separately by deleteMeaning's registry pass.) */
export function lexDelete(lang: LexiconState, m: Meaning): void {
  const cid = lang.conceptIds?.[m] as LexemeId | undefined;
  if (cid !== undefined) delete lang.lexicon[cid];
}

/** Meanings (glosses) in INSERTION order. NOT sorted. */
export function lexKeys(lang: LexiconState): Meaning[] {
  const g = buildLexemeIdToGloss(lang);
  return Object.keys(lang.lexicon).map((cid) => g.get(cid) ?? (cid as Meaning));
}

/** Forms in insertion order. (`Object.values(lang.lexicon)`) */
export function lexValues(lang: LexiconState): WordForm[] {
  return Object.values(lang.lexicon);
}

/** [meaning, form] pairs in insertion order. */
export function lexEntries(lang: LexiconState): [Meaning, WordForm][] {
  const g = buildLexemeIdToGloss(lang);
  return Object.keys(lang.lexicon).map(
    (cid) =>
      [g.get(cid) ?? (cid as Meaning), lang.lexicon[cid as LexemeId]!] as [Meaning, WordForm],
  );
}

/** Number of entries. (`Object.keys(lang.lexicon).length`) */
export function lexSize(lang: LexiconState): number {
  return Object.keys(lang.lexicon).length;
}
