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

  // 1. exact meaning match
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

  // 2. semantic neighbor — either direction.
  //    Forward: neighbors listed for the English word itself.
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
  //    Reverse: find a lexicon meaning that considers `key` a neighbor.
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

  // 3. existing compound: look for a known compound containing this key
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

/**
 * Optional LLM-assisted translator. Lazy-imports WebLLM the same way the
 * semantic-drift module does; only called when the user clicks "Try AI".
 */
/**
 * Translate a form from one living language into another by tracing each
 * known meaning. Returns a best-effort form using the target language's
 * existing lexicon, or missing if no matching meaning can be found.
 */
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

// LLM-backed translation helpers were removed in Sprint 1 — Sprint 2's
// rule-based translator (§B in the overhaul roadmap) replaces this
// surface with a deterministic engine that uses POS-tagging + the
// concept dictionary + paradigm-based inflection. Until that lands,
// the Translator UI uses only the deterministic `translate` and
// `translateBetween` paths above.
