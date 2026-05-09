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
    /** Phase 53 T4: structural etymology threaded onto the new Word. */
    morphStructure?: import("../types").WordMorphStructure;
  },
): void {
  lang.lexicon[meaning] = form;
  if (!lang.words) return;
  const primary = findPrimaryWordForMeaning(lang, meaning);
  if (primary && primary.formKey === undefined) return; // defensive
  // Phase 53 T4: when the caller didn't pass an explicit morphStructure
  // but the existing primary Word had one (set at original coinage),
  // preserve it across the form-update. compound-recompose / variant-
  // actuation / phonology-driven respellings shouldn't erase the
  // record of how a word was originally formed.
  const preservedStructure = opts.morphStructure ?? primary?.morphStructure;
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
    morphStructure: preservedStructure,
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

/**
 * Phase 71b T2 (G8): meanings whose deletion would silently strand
 * suppletion entries and break translator/narrative output. The Phase
 * 70 diagnostic showed `go → (missing)` and `MISSING: be` across every
 * Romance daughter at gen 200 — semantic recarving deleted these high-
 * frequency verbs from the lexicon while their suppletion tables
 * remained orphaned. Refusing to delete them keeps the lexicon entry
 * alive (it can still drift phonologically); narrowly targeted at
 * cross-linguistically-suppletive verbs.
 */
export const PROTECTED_MEANINGS: ReadonlySet<Meaning> = new Set<Meaning>([
  // Suppletive copulas + auxiliaries (esse/sum, fui; habēre, etc.).
  "be", "have", "do", "will",
  // High-frequency suppletive motion / perception verbs.
  "go", "come", "see", "give", "say", "make", "take", "get",
  // Core cognition + state.
  "know", "want", "find", "think", "eat", "drink",
]);

export function deleteMeaning(lang: Language, meaning: Meaning): void {
  // Phase 71b T2 (G8): protected meanings refuse deletion. Their
  // lexicon entry stays alive even when semantic drift / bleaching
  // / obsolescence calls for removal. This is intentional — these
  // meanings underpin suppletion tables, closed-class translator
  // lookups, and narrative slot-fill; their absence is far worse
  // than their continued presence in a language that has otherwise
  // moved on.
  if (PROTECTED_MEANINGS.has(meaning)) return;

  delete lang.lexicon[meaning];
  delete lang.wordFrequencyHints[meaning];
  delete lang.lastChangeGeneration[meaning];
  delete lang.wordOrigin[meaning];
  delete lang.localNeighbors[meaning];
  if (lang.registerOf) delete lang.registerOf[meaning];
  if (lang.variants) delete lang.variants[meaning];
  if (lang.wordOriginChain) delete lang.wordOriginChain[meaning];
  if (lang.colexifiedAs) delete lang.colexifiedAs[meaning];
  // Phase 68a T1: purge Phase 64/66 per-meaning metadata so stale
  // entries don't survive bleaching / recarving / obsolescence.
  // Without this, `progressGrammaticalizationChain` could try to
  // advance a deleted meaning and `decayAblautClasses` would read
  // garbage. Symmetric with the legacy delete list above.
  if (lang.inflectionClass) delete lang.inflectionClass[meaning];
  if (lang.nounDeclensionClass) delete lang.nounDeclensionClass[meaning];
  if (lang.ablautClassAssignment) delete lang.ablautClassAssignment[meaning];
  if (lang.grammaticalizationStage) delete lang.grammaticalizationStage[meaning];
  // Phase 71b T2 (G8): purge suppletion entries too — was missed by
  // the Phase 68a sweep. Even though PROTECTED_MEANINGS shields most
  // suppletion-bearing items, this is a belt-and-braces fix for any
  // future suppletive verb that isn't on the protected list.
  if (lang.suppletion) delete lang.suppletion[meaning];
  removeSense(lang, meaning);
}
