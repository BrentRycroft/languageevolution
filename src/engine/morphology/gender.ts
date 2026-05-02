import type { Language, Meaning, WordForm } from "../types";

/**
 * Heuristically assign a gender (0..genderCount-1) to a meaning based on its
 * surface form. Currently uses Romance-style endings as a baseline:
 *
 *   - In a 2-gender language: vowel-final stems → 0 (fem-like),
 *     consonant-final → 1 (masc-like).
 *   - In a 3-gender language: -a → 0 (fem), -o/-u → 1 (masc),
 *     consonant-final → 2 (neuter).
 *   - In any other count, falls back to (form length % count).
 */
export function assignGenderHeuristic(
  form: WordForm,
  genderCount: number,
): number {
  if (genderCount <= 0) return 0;
  if (form.length === 0) return 0;
  const last = form[form.length - 1]!;
  const isVowel = /^[aeiouɛɔəɨɯøyœæáéíóúàèìòùâêîôûāēīōū]/i.test(last);
  if (genderCount === 2) {
    return isVowel ? 0 : 1;
  }
  if (genderCount === 3) {
    if (last === "a" || last === "ɑ" || last === "æ") return 0;
    if (last === "o" || last === "ɔ" || last === "u" || last === "uː") return 1;
    if (!isVowel) return 2;
    return 0;
  }
  return form.length % genderCount;
}

/**
 * Look up the gender of a meaning, lazily filling it in based on the heuristic
 * if not yet assigned. Mutates lang.gender. Returns 0 if the language has no
 * gender system.
 */
export function genderOf(lang: Language, meaning: Meaning): number {
  const count = lang.grammar.genderCount ?? 0;
  if (count <= 0) return 0;
  const map = (lang.gender ??= {});
  if (map[meaning] !== undefined) return map[meaning]!;
  const form = lang.lexicon[meaning];
  if (!form) return 0;
  const g = assignGenderHeuristic(form, count);
  map[meaning] = g;
  return g;
}

/**
 * Eagerly assign genders to every lexicon entry that doesn't have one.
 * Use at language birth and after large lexicon additions.
 */
export function assignAllGenders(lang: Language): void {
  const count = lang.grammar.genderCount ?? 0;
  if (count <= 0) return;
  const map = (lang.gender ??= {});
  for (const meaning of Object.keys(lang.lexicon)) {
    if (map[meaning] === undefined) {
      map[meaning] = assignGenderHeuristic(lang.lexicon[meaning]!, count);
    }
  }
}
