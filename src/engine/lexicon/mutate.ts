import type { Language, Meaning, WordForm } from "../types";
import { addWord, findPrimaryWordForMeaning, findWordByForm, formKeyOf, removeSense, removeSynonymSense } from "./word";
import { invalidateReverseLexCache } from "../translator/reverse";

/**
 * Phase 28a: single chokepoint for writing a form to the meaning-keyed
 * lexicon. The simulator carries two parallel views of the lexicon:
 *
 *   - `lang.lexicon[m]: WordForm`  — meaning → primary form (legacy)
 *   - `lang.words: Word[]`         — form → senses (Phase 21)
 *
 * Pre-28a most call-sites mutated `lang.lexicon[m]` directly without
 * touching `lang.words`, leaving the views in silent disagreement.
 * Routing every write through `setLexiconForm` keeps them in sync.
 *
 * The function is a no-op for languages that haven't been migrated to
 * v6 yet (`lang.words` undefined) — they still get the lexicon write,
 * matching the legacy contract.
 */
export function setLexiconForm(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
  opts: {
    bornGeneration: number;
    register?: "high" | "low" | "neutral";
    origin?: string;
    weight?: number;
  },
): void {
  lang.lexicon[meaning] = form;
  if (!lang.words) return;
  const primary = findPrimaryWordForMeaning(lang, meaning);
  if (primary && primary.formKey === undefined) return; // defensive
  if (primary) {
    // Same meaning, possibly new form: drop the old primary sense and
    // re-attach to the new form. addWord handles the polysemy case
    // (form already exists for another meaning).
    removeSense(lang, meaning);
  }
  addWord(lang, form, meaning, {
    bornGeneration: opts.bornGeneration,
    register: opts.register,
    origin: opts.origin,
    weight: opts.weight,
  });
  // Phase 50 T3: invalidate the reverse-lookup cache so subsequent
  // reverseTranslate calls see new lexicon entries (specifically: the
  // forms coined by the translator's graceful-fallback rung). Pre-50
  // only addSynonym / removeSynonymSense invalidated; primary-form
  // additions slipped past the cache.
  invalidateReverseLexCache(lang);
}

/**
 * Phase 28a: single chokepoint for retiring a meaning from a language.
 * Tears down every meaning-keyed view in one place: lexicon,
 * frequency hints, register flags, origin tags, last-change tracking,
 * and the form-centric `words` table.
 *
 * Use this in place of the historical multi-line teardown pattern:
 *   delete lang.lexicon[m];
 *   delete lang.wordFrequencyHints[m];
 *   delete lang.lastChangeGeneration[m];
 *   delete lang.wordOrigin[m];
 *   delete lang.registerOf?.[m];
 *   removeSense(lang, m);
 */
/**
 * Phase 37: register a synonym for an existing meaning. Adds the form
 * to `lang.words` (creating a new Word or appending a sense to an
 * existing one) with the sense flagged as `synonym: true`. The
 * meaning's primary form in `lang.lexicon[meaning]` is left
 * unchanged. Idempotent — calling twice with the same (meaning, form)
 * pair is a no-op.
 *
 * Returns true on success, false when:
 * - the meaning has no primary form yet (caller should use
 *   setLexiconForm first), or
 * - the form is identical to the primary form (not a synonym).
 */
export function addSynonym(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
  opts: {
    bornGeneration: number;
    register?: "high" | "low" | "neutral";
    origin?: string;
    weight?: number;
  },
): boolean {
  if (!lang.lexicon[meaning]) return false;
  if (form.length === 0) return false;
  const primaryKey = formKeyOf(lang.lexicon[meaning]!);
  const newKey = formKeyOf(form);
  if (primaryKey === newKey) return false;
  if (!lang.words) return false;
  // Avoid double-registering on a Word that already has the meaning.
  const existing = findWordByForm(lang, form);
  if (existing && existing.senses.some((s) => s.meaning === meaning)) {
    return false;
  }
  addWord(lang, form, meaning, {
    bornGeneration: opts.bornGeneration,
    register: opts.register,
    origin: opts.origin ?? "synonym",
    weight: opts.weight ?? 0.3,
    synonym: true,
  });
  // Phase 37: invalidate the reverse-lookup cache so subsequent
  // translations pick up the new sense.
  invalidateReverseLexCache(lang);
  return true;
}

/**
 * Phase 37: remove a synonym entry. Strips the sense from the word
 * with this form; if the word has no remaining senses, the word is
 * dropped. The primary form in `lang.lexicon[meaning]` is untouched.
 */
export function removeSynonym(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
): void {
  removeSynonymSense(lang, meaning, form);
  invalidateReverseLexCache(lang);
}

export function deleteMeaning(lang: Language, meaning: Meaning): void {
  delete lang.lexicon[meaning];
  delete lang.wordFrequencyHints[meaning];
  delete lang.lastChangeGeneration[meaning];
  delete lang.wordOrigin[meaning];
  delete lang.localNeighbors[meaning];
  if (lang.registerOf) delete lang.registerOf[meaning];
  if (lang.variants) delete lang.variants[meaning];
  if (lang.wordOriginChain) delete lang.wordOriginChain[meaning];
  if (lang.colexifiedAs) delete lang.colexifiedAs[meaning];
  removeSense(lang, meaning);
}
