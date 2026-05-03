import type { Language, Meaning, WordForm } from "../types";
import type { MorphCategory } from "./types";
import { inflect, inflectCascade } from "./evolve";

/**
 * Phase 26a: full verb conjugation table.
 *
 * Real-world Spanish verb *hablar* has 6 person-number forms in any
 * tense:
 *   1sg hablo  /  2sg hablas /  3sg habla
 *   1pl hablamos / 2pl habláis / 3pl hablan
 *
 * Today the engine's per-paradigm inflection produces the right form
 * when the corresponding `verb.person.{N}{ng}` paradigm is seeded
 * (`translator/realise.ts:535`). This module provides a one-call
 * helper that returns the entire 6-form table at once for display,
 * conjugation lookup tables in the UI, and tests verifying that a
 * language with full paradigms produces 6 distinct surface forms.
 */
export type Person = "1" | "2" | "3";
export type Number_ = "sg" | "pl";

export interface ConjugationCell {
  person: Person;
  number: Number_;
  category: MorphCategory;
  form: WordForm;
  /** True if the language has no paradigm for this slot (form fell back to bare root). */
  fellBack: boolean;
}

const PERSON_NUMBER_GRID: ReadonlyArray<{ person: Person; number: Number_ }> = [
  { person: "1", number: "sg" },
  { person: "2", number: "sg" },
  { person: "3", number: "sg" },
  { person: "1", number: "pl" },
  { person: "2", number: "pl" },
  { person: "3", number: "pl" },
];

/**
 * Produce all 6 person-number conjugation cells for a given verb meaning
 * in a given language, optionally combined with a tense paradigm. The
 * cells preserve `fellBack=true` when the language lacks the relevant
 * person-number paradigm — the cascade silently no-ops on missing
 * paradigms, so the cell's form equals the input form (or just the
 * tense-inflected form, if a tense is provided).
 *
 * Suppletion is respected via `inflect`'s existing override path: if
 * `lang.suppletion[meaning][verb.person.1sg]` is set, that overrides
 * the default affix.
 */
export function verbConjugationTable(
  lang: Language,
  meaning: Meaning,
  options: { tense?: "verb.tense.past" | "verb.tense.fut" } = {},
): ConjugationCell[] {
  const root = lang.lexicon[meaning];
  if (!root || root.length === 0) return [];

  return PERSON_NUMBER_GRID.map(({ person, number }) => {
    const personCat = `verb.person.${person}${number}` as MorphCategory;
    const stack: MorphCategory[] = [];
    if (options.tense) stack.push(options.tense);
    stack.push(personCat);
    const cascade = inflectCascade(root, stack, lang, meaning);
    const fellBack = !cascade.applied.includes(personCat);
    return {
      person,
      number,
      category: personCat,
      form: cascade.form,
      fellBack,
    };
  });
}

/**
 * One-shot inflection for a single (person, number) cell. Convenience
 * wrapper used by narrative consumers that want a specific cell rather
 * than the full table.
 */
export function inflectForPerson(
  lang: Language,
  meaning: Meaning,
  person: Person,
  number: Number_,
  tense?: "verb.tense.past" | "verb.tense.fut",
): WordForm {
  const root = lang.lexicon[meaning];
  if (!root) return [];
  const personCat = `verb.person.${person}${number}` as MorphCategory;
  const stack: MorphCategory[] = [];
  if (tense) stack.push(tense);
  stack.push(personCat);
  const cascade = inflectCascade(root, stack, lang, meaning);
  return cascade.form;
}

/**
 * Count how many of the 6 person-number paradigms a language has seeded.
 * Used as a "conjugation richness" metric — Spanish-style would be 6;
 * English-style typically 1 (just 3sg); some languages might have 4
 * (sg-only). Used by `paradigm-richness` reports and tests.
 */
export function conjugationRichness(lang: Language): number {
  return PERSON_NUMBER_GRID.filter(({ person, number }) => {
    const cat = `verb.person.${person}${number}` as MorphCategory;
    const p = lang.morphology.paradigms[cat];
    return !!p && p.affix.length > 0;
  }).length;
}

void inflect; // keep export available for callers in future patches
