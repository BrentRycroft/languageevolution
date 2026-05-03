import type { Language, Meaning, WordForm } from "../types";
import { addWord, findPrimaryWordForMeaning, removeSense } from "./word";

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
