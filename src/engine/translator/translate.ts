import type { Language, WordForm } from "../types";
import { formToString } from "../phonology/ipa";
import { neighborsOf } from "../semantics/neighbors";
import { inflect } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";
import { lookupFormWithResolution } from "../lexicon/lookup";
import { recordedParts } from "../lexicon/word";
import { lexSize, lexIds, lexFormById } from "../lexicon/access";
import { idForConcept } from "../lexicon/conceptIndex";
import { meaningForLexemeId } from "../lexicon/lexemeIdentity";
import type { LemmaResolution } from "./syntax";

/**
 * translate.ts
 *
 * English → target sentence (parse / realise / sentence) and target → English caption (glossToEnglish, cognates, reverse). Key exports: TranslationResult, translate, translateBetween.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

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
  if (lexSize(lang) === 0) {
    return {
      form: "—",
      phonemes: [],
      source: "missing",
      notes: `${lang.name} has no surviving vocabulary.`,
    };
  }

  const exactId = idForConcept(lang, key);
  const exact = exactId !== undefined ? lexFormById(lang, exactId) : undefined;
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
    const nId = idForConcept(lang, n);
    const f = nId !== undefined ? lexFormById(lang, nId) : undefined;
    if (f) {
      return {
        form: formToString(f),
        phonemes: f,
        source: "neighbor",
        notes: `"${englishWord}" has no direct word; shown as the related term "${n}".`,
      };
    }
  }
  for (const id of lexIds(lang)) {
    const m = meaningForLexemeId(lang, id);
    if (m === undefined) continue;
    if (neighborsOf(m).includes(key)) {
      const mf = lexFormById(lang, id)!;
      return {
        form: formToString(mf),
        phonemes: mf,
        source: "neighbor",
        notes: `"${englishWord}" is semantically close to "${m}" in this language.`,
      };
    }
  }

  for (const id of lexIds(lang)) {
    const m = meaningForLexemeId(lang, id);
    if (m === undefined) continue;
    // Stage B: match against the RECORDED decomposition (compound /
    // derivation records), not the hyphenation of the English gloss.
    const parts = recordedParts(lang, m);
    if (parts && parts.includes(key)) {
      const mf = lexFormById(lang, id)!;
      return {
        form: formToString(mf),
        phonemes: mf,
        source: "compound",
        notes: `Coined compound "${m}" contains "${key}".`,
      };
    }
  }

  // Phase 73e: before giving up, route through the shared resolution
  // cascade (`lookupFormWithResolution`) — the same one the sentence
  // translator uses — so single-word lookups gain its richer rungs
  // (morphological synthesis, concept decomposition, registered
  // colexification, and on-demand graceful coinage) instead of stopping at
  // "missing". The simple exact/neighbor/compound chain above runs first so
  // a related existing word (e.g. river → water) is still preferred over
  // coining a fresh form.
  const resolved = lookupFormWithResolution(lang, key);
  if (resolved.form && resolved.form.length > 0) {
    const inflected =
      options.inflect && lang.morphology.paradigms[options.inflect]
        ? inflect(resolved.form, lang.morphology.paradigms[options.inflect], lang, key)
        : resolved.form;
    const SOURCE_BY_RESOLUTION: Record<LemmaResolution, TranslationResult["source"]> = {
      direct: "exact",
      concept: "exact",
      colex: "neighbor",
      "reverse-colex": "neighbor",
      "synth-affix": "compound",
      "synth-neg-affix": "compound",
      "synth-concept": "compound",
      "synth-cluster": "compound",
      "synth-fallback": "ai",
      fallback: "neighbor",
    };
    return {
      form: formToString(inflected),
      phonemes: inflected,
      source: SOURCE_BY_RESOLUTION[resolved.resolution] ?? "neighbor",
      notes: `Resolved via ${resolved.resolution}${resolved.glossNote ? ` (${resolved.glossNote})` : ""}.`,
    };
  }

  return {
    form: "—",
    phonemes: [],
    source: "missing",
    notes: `No translation; "${key}" couldn't be resolved or coined for ${lang.name}.`,
  };
}

export function translateBetween(
  source: Language,
  target: Language,
  sourceForm: string,
): TranslationResult {
  let matchedMeaning: string | null = null;
  for (const id of lexIds(source)) {
    const form = lexFormById(source, id);
    if (form && formToString(form) === sourceForm) {
      matchedMeaning = meaningForLexemeId(source, id) ?? null;
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

