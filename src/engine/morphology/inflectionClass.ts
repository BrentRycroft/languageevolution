import type { Language, Meaning, WordForm } from "../types";
import type { InflectionClass, NounDeclensionClass } from "./types";
import { isVowel } from "../phonology/ipa";
import { stripTone } from "../phonology/tone";
import { posOf } from "../lexicon/pos";
import { lexGet, lexKeys } from "../lexicon/access";
import { satGet, satSet } from "../lexicon/satellites";

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
  lang: Language,
  meaning: Meaning,
): InflectionClass {
  return satGet(lang, "inflectionClass", meaning) ?? 1;
}

export function setInflectionClass(
  lang: Language,
  meaning: Meaning,
  cls: InflectionClass,
): void {
  satSet(lang, "inflectionClass", meaning, cls);
}

/**
 * One-shot assigner: walk every meaning in the lexicon and assign
 * a class. Called once at language birth (init.ts) so seed lexicons
 * have their classes populated. Idempotent — skips meanings already
 * classified.
 *
 * Phase 64 T1: now also walks nouns and assigns
 * `nounDeclensionClass`. Verbs continue to receive an
 * `inflectionClass`. The same `meaning` can carry both fields if it
 * is dual-pos, but in practice POS is unique per meaning.
 */
export function classifyLexicon(
  lang: Language,
  rng: MinimalRng,
): void {
  for (const meaning of lexKeys(lang)) {
    const form = lexGet(lang, meaning);
    if (!form || form.length === 0) continue;
    const pos = posOf(meaning);
    if (pos === "verb") {
      if (!satGet(lang, "inflectionClass", meaning)) {
        satSet(lang, "inflectionClass", meaning, assignInflectionClass(form, rng));
      }
    } else if (pos === "noun" || pos === "other") {
      // Treat unclassified content meanings as candidate nouns for
      // declension assignment — many concrete nouns return "other"
      // from the sparse POS table (see lexicon/pos.ts).
      if (!satGet(lang, "nounDeclensionClass", meaning)) {
        satSet(lang, "nounDeclensionClass", meaning, assignNounDeclensionClass(form, rng));
      }
    }
  }
}

/**
 * Phase 64 T1: Latin-noun-realistic declension distribution.
 * Approximate Latin frequencies:
 *   1st declension (a-stems, mostly fem): ~30%
 *   2nd declension (o/us-stems, mostly masc/neut): ~35%
 *   3rd declension (cons + i-stems, all genders): ~25%
 *   4th declension (u-stems): ~6%
 *   5th declension (e-stems): ~4%
 */
const NOUN_CLASS_BASE_WEIGHTS: Record<NounDeclensionClass, number> = {
  1: 0.30,
  2: 0.35,
  3: 0.25,
  4: 0.06,
  5: 0.04,
};

/**
 * Assign a declension class for a fresh noun coinage. Phonological
 * shape biases the pick:
 *   - `-a` final → class 1 (Latin puella, rosa)
 *   - `-o` / `-us` / `-um` final → class 2 (Latin dominus, bellum)
 *   - consonant-final → class 3 (Latin rex, lux)
 *   - `-u` final → class 4 (Latin manus)
 *   - `-e` final → class 5 (Latin res, dies)
 */
export function assignNounDeclensionClass(
  form: WordForm,
  rng: MinimalRng,
): NounDeclensionClass {
  const w: Partial<Record<NounDeclensionClass, number>> = {
    ...NOUN_CLASS_BASE_WEIGHTS,
  };
  if (form.length > 0) {
    const last = stripTone(form[form.length - 1] ?? "");
    if (last === "a" || last === "aː") {
      w[1] = (w[1] ?? 0) + 0.4;
    } else if (last === "o" || last === "oː" || last === "u" || last === "uː") {
      w[2] = (w[2] ?? 0) + 0.3;
      w[4] = (w[4] ?? 0) + 0.1;
    } else if (last === "e" || last === "eː") {
      w[5] = (w[5] ?? 0) + 0.15;
    } else if (!isVowel(last)) {
      w[3] = (w[3] ?? 0) + 0.3;
    }
  }
  let total = 0;
  for (const k of Object.keys(w) as Array<`${NounDeclensionClass}`>) {
    total += w[Number(k) as NounDeclensionClass] ?? 0;
  }
  let r = rng.next() * total;
  for (const k of Object.keys(w) as Array<`${NounDeclensionClass}`>) {
    const c = Number(k) as NounDeclensionClass;
    r -= w[c] ?? 0;
    if (r <= 0) return c;
  }
  return 1;
}

export function getNounDeclensionClass(
  lang: Language,
  meaning: Meaning,
): NounDeclensionClass {
  return satGet(lang, "nounDeclensionClass", meaning) ?? 1;
}

export function setNounDeclensionClass(
  lang: Language,
  meaning: Meaning,
  cls: NounDeclensionClass,
): void {
  satSet(lang, "nounDeclensionClass", meaning, cls);
}
