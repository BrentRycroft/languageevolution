import type { Language, Meaning, WordForm } from "../types";
import type { InflectionClass } from "./types";
import { isVowel } from "../phonology/ipa";
import { stripTone } from "../phonology/tone";

/**
 * Phase 29 Tranche 5e: inflection-class assignment.
 *
 * Real languages (Latin, Russian, Bantu) classify their inflectable
 * stems into a small number of conjugation / declension buckets.
 * Latin verbs split into 1st (-āre, the LARGEST class), 2nd (-ēre),
 * 3rd (-ere), 4th (-īre), with the 3rd being the catch-all
 * "irregular / consonant-stem" bucket. Distribution roughly:
 *   1st conjugation: 65%
 *   2nd conjugation: 8%
 *   3rd conjugation: 18%
 *   4th conjugation: 9%
 *
 * This module provides:
 *   - `assignInflectionClass(form, rng)` — pick a class for a fresh
 *     coinage, biased by phonological shape.
 *   - `getInflectionClass(lang, meaning)` — read with default 1.
 *   - `setInflectionClass(lang, meaning, class)` — write.
 *
 * Per-language assignment lives on `lang.inflectionClass[meaning]`.
 */

/** Probabilistic bias toward Latin-realistic class distribution. */
const CLASS_BASE_WEIGHTS: Record<InflectionClass, number> = {
  1: 0.65,
  2: 0.08,
  3: 0.18,
  4: 0.09,
};

interface MinimalRng {
  next: () => number;
}

/**
 * Assign a class for a fresh coinage. The form's last segment
 * shifts the distribution:
 *   - vowel-final → class 1 boosted (Latin amāre, Italian -are).
 *   - consonant-final → class 3 boosted (Latin agere, mittere).
 *   - high front vowel ending → class 4 boosted (audīre).
 */
export function assignInflectionClass(
  form: WordForm,
  rng: MinimalRng,
): InflectionClass {
  const w: Partial<Record<InflectionClass, number>> = { ...CLASS_BASE_WEIGHTS };
  if (form.length > 0) {
    const last = stripTone(form[form.length - 1] ?? "");
    if (isVowel(last)) {
      // Vowel-final: class 1 dominates.
      w[1] = (w[1] ?? 0) + 0.2;
      // High front vowel-final: class 4 boosted.
      if (last === "i" || last === "ī" || last === "iː") {
        w[4] = (w[4] ?? 0) + 0.15;
      }
    } else {
      // Consonant-final: class 3 boosted.
      w[3] = (w[3] ?? 0) + 0.15;
    }
  }
  let total = 0;
  for (const k of Object.keys(w) as Array<`${InflectionClass}`>) {
    total += w[Number(k) as InflectionClass] ?? 0;
  }
  let r = rng.next() * total;
  for (const k of Object.keys(w) as Array<`${InflectionClass}`>) {
    const c = Number(k) as InflectionClass;
    r -= w[c] ?? 0;
    if (r <= 0) return c;
  }
  return 1;
}

export function getInflectionClass(
  lang: Pick<Language, "inflectionClass">,
  meaning: Meaning,
): InflectionClass {
  return lang.inflectionClass?.[meaning] ?? 1;
}

export function setInflectionClass(
  lang: Language,
  meaning: Meaning,
  cls: InflectionClass,
): void {
  if (!lang.inflectionClass) lang.inflectionClass = {};
  lang.inflectionClass[meaning] = cls;
}

/**
 * One-shot assigner: walk every meaning in the lexicon and assign
 * a class. Called once at language birth (init.ts) so seed lexicons
 * have their classes populated. Idempotent — skips meanings already
 * classified.
 */
export function classifyLexicon(
  lang: Language,
  rng: MinimalRng,
): void {
  if (!lang.inflectionClass) lang.inflectionClass = {};
  for (const meaning of Object.keys(lang.lexicon)) {
    if (lang.inflectionClass[meaning]) continue;
    const form = lang.lexicon[meaning];
    if (!form || form.length === 0) continue;
    lang.inflectionClass[meaning] = assignInflectionClass(form, rng);
  }
}
