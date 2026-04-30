import type { Language, WordForm } from "../types";
import { formToString } from "../phonology/ipa";
import { neighborsOf } from "../semantics/neighbors";
import { inflect } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";

export interface TranslationResult {
  form: string;
  phonemes: WordForm;
  source: "exact" | "neighbor" | "compound" | "ai" | "missing";
  notes: string;
}

export function translate(
  lang: Language,
  englishWord: string,
  options: { inflect?: MorphCategory } = {},
): TranslationResult {
  const key = englishWord.trim().toLowerCase();
  if (!key) {
    return { form: "", phonemes: [], source: "missing", notes: "Empty input." };
  }
  if (Object.keys(lang.lexicon).length === 0) {
    return {
      form: "—",
      phonemes: [],
      source: "missing",
      notes: `${lang.name} has no surviving vocabulary.`,
    };
  }

  const exact = lang.lexicon[key];
  if (exact) {
    const inflected =
      options.inflect && lang.morphology.paradigms[options.inflect]
        ? inflect(exact, lang.morphology.paradigms[options.inflect], lang, key)
        : exact;
    return {
      form: formToString(inflected),
      phonemes: inflected,
      source: "exact",
      notes: `Direct lexicon entry${options.inflect ? ` inflected for ${options.inflect}` : ""}.`,
    };
  }

  for (const n of neighborsOf(key)) {
    const f = lang.lexicon[n];
    if (f) {
      return {
        form: formToString(f),
        phonemes: f,
        source: "neighbor",
        notes: `"${englishWord}" has no direct word; shown as the related term "${n}".`,
      };
    }
  }
  for (const m of Object.keys(lang.lexicon)) {
    if (neighborsOf(m).includes(key)) {
      return {
        form: formToString(lang.lexicon[m]!),
        phonemes: lang.lexicon[m]!,
        source: "neighbor",
        notes: `"${englishWord}" is semantically close to "${m}" in this language.`,
      };
    }
  }

  for (const m of Object.keys(lang.lexicon)) {
    if (m.includes("-")) {
      const parts = m.split("-");
      if (parts.includes(key)) {
        return {
          form: formToString(lang.lexicon[m]!),
          phonemes: lang.lexicon[m]!,
          source: "compound",
          notes: `Coined compound "${m}" contains "${key}".`,
        };
      }
    }
  }

  return {
    form: "—",
    phonemes: [],
    source: "missing",
    notes: `No direct translation; consider enabling AI drift to seed neighbors for "${key}".`,
  };
}

export function translateBetween(
  source: Language,
  target: Language,
  sourceForm: string,
): TranslationResult {
  let matchedMeaning: string | null = null;
  for (const m of Object.keys(source.lexicon)) {
    if (formToString(source.lexicon[m]!) === sourceForm) {
      matchedMeaning = m;
      break;
    }
  }
  if (!matchedMeaning) {
    return {
      form: "—",
      phonemes: [],
      source: "missing",
      notes: `"${sourceForm}" is not a word in ${source.name}.`,
    };
  }
  return translate(target, matchedMeaning);
}

