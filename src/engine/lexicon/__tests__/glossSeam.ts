import type { Language } from "../../types";
import type { Meaning, WordForm } from "../../primitives";
import { lexFormById, lexHasById, lexDeleteById, lexIds, idForGloss, coinSeededLexeme } from "../access";
import { meaningForLexemeId } from "../lexemeIdentity";

/**
 * glossSeam.ts — TEST-ONLY gloss conveniences over the id-native lexicon seam.
 *
 * Storage step 5 S3 retired the gloss-in production API (`lexGet`/`lexKeys`/…): the engine addresses
 * lexemes by `LexemeId`. Tests still author/inspect by the human-readable gloss, so these helpers make the
 * gloss→id resolution explicit at a single thin boundary (`idForGloss` / `meaningForLexemeId`) and then
 * call the id-native seam. NOT collected by vitest (no `.test.` suffix) and never imported by production
 * code. Distinct `t…` names make it obvious a test is going through this boundary, not a production seam.
 */

/** Form for a gloss, or undefined. (id-native `lexGet`) */
export function tForm(lang: Language, m: Meaning): WordForm | undefined {
  const id = idForGloss(lang, m);
  return id !== undefined ? lexFormById(lang, id) : undefined;
}

/** Whether the language has a (record-backed) word for this gloss. (id-native `lexHas`) */
export function tHas(lang: Language, m: Meaning): boolean {
  return lexHasById(lang, idForGloss(lang, m));
}

/** Coin/replace the form for a gloss. (id-native `lexSet`) */
export function tSet(lang: Language, m: Meaning, form: WordForm): void {
  coinSeededLexeme(lang, m, form);
}

/** Delete a gloss's record. (id-native `lexDelete`) */
export function tDelete(lang: Language, m: Meaning): void {
  const id = idForGloss(lang, m);
  if (id !== undefined) lexDeleteById(lang, id);
}

/** Glosses (seeded, gloss-bearing) in INSERTION order. (id-native `lexKeys`) */
export function tGlosses(lang: Language): Meaning[] {
  return lexIds(lang).map((id) => meaningForLexemeId(lang, id)!);
}

/** Forms in insertion order — gloss-bearing records only. (id-native `lexValues`) */
export function tValues(lang: Language): WordForm[] {
  return lexIds(lang).map((id) => lexFormById(lang, id)!);
}

/** [gloss, form] pairs in insertion order — gloss-bearing records only. (id-native `lexEntries`) */
export function tEntries(lang: Language): [Meaning, WordForm][] {
  return lexIds(lang).map((id) => [meaningForLexemeId(lang, id)!, lexFormById(lang, id)!]);
}
