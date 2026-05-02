import type { Language, Meaning, Word, WordSense, WordForm } from "../types";
import { formToString } from "../phonology/ipa";

/**
 * Stable join key for a phonemic form. Two words with the same key are
 * considered the same surface form for collision/merger purposes.
 * Delegates to `formToString` so it stays consistent with the rest of the
 * engine's IPA serialisation.
 */
export function formKeyOf(form: WordForm): string {
  return formToString(form);
}

/**
 * Find the Word entry matching the given form. Returns undefined if the
 * language hasn't been migrated to v6 yet (no `words` field) — callers
 * should fall back to the meaning-keyed lexicon in that case.
 */
export function findWordByForm(
  lang: Language,
  form: WordForm,
): Word | undefined {
  if (!lang.words) return undefined;
  const key = formKeyOf(form);
  return lang.words.find((w) => w.formKey === key);
}

/**
 * Find every Word entry whose senses include the given meaning. Most
 * meanings live in exactly one Word, but altForms can attach the same
 * meaning to multiple Words (one per alternate). Returns [] when the
 * language hasn't been migrated yet.
 */
export function findWordsByMeaning(
  lang: Language,
  meaning: Meaning,
): Word[] {
  if (!lang.words) return [];
  return lang.words.filter((w) =>
    w.senses.some((s) => s.meaning === meaning),
  );
}

/**
 * Find the Word entry whose primary sense is the given meaning, if any.
 * Used to power the lexicon[meaning] → primary-form view.
 */
export function findPrimaryWordForMeaning(
  lang: Language,
  meaning: Meaning,
): Word | undefined {
  if (!lang.words) return undefined;
  return lang.words.find(
    (w) => w.senses[w.primarySenseIndex]?.meaning === meaning,
  );
}

/**
 * Add a new sense to an existing word. Mirrors the real-world process by
 * which a word picks up a second meaning (polysemy from drift, sound-
 * change merger, borrowing into an occupied form). Idempotent: if the
 * meaning is already a sense of this word, the call is a no-op.
 */
export function addSenseToWord(
  word: Word,
  sense: Omit<WordSense, "weight"> & { weight?: number },
): void {
  if (word.senses.some((s) => s.meaning === sense.meaning)) return;
  word.senses.push({
    meaning: sense.meaning,
    weight: sense.weight ?? 0.4,
    register: sense.register,
    bornGeneration: sense.bornGeneration,
    origin: sense.origin,
  });
}

/**
 * Register a (form, meaning) pair as a Word entry. If a word with the
 * same form already exists, the new meaning is attached as a sense
 * (homonymy/polysemy). Otherwise a fresh Word is created. Returns the
 * resulting Word so callers can read back its `formKey`.
 */
export function addWord(
  lang: Language,
  form: WordForm,
  meaning: Meaning,
  opts: {
    bornGeneration: number;
    weight?: number;
    register?: "high" | "low" | "neutral";
    origin?: string;
  },
): Word {
  if (!lang.words) lang.words = [];
  const key = formKeyOf(form);
  const existing = lang.words.find((w) => w.formKey === key);
  if (existing) {
    addSenseToWord(existing, {
      meaning,
      weight: opts.weight,
      register: opts.register,
      bornGeneration: opts.bornGeneration,
      origin: opts.origin,
    });
    return existing;
  }
  const word: Word = {
    form: form.slice(),
    formKey: key,
    senses: [
      {
        meaning,
        weight: opts.weight ?? 0.4,
        register: opts.register,
        bornGeneration: opts.bornGeneration,
        origin: opts.origin,
      },
    ],
    primarySenseIndex: 0,
    bornGeneration: opts.bornGeneration,
    origin: opts.origin,
  };
  lang.words.push(word);
  return word;
}

/**
 * Remove a meaning from the language's word table. Strips the sense from
 * any word that carries it; if a word has no remaining senses afterward,
 * the word itself is removed. Mirrors `delete lang.lexicon[m]` semantics.
 */
export function removeSense(lang: Language, meaning: Meaning): void {
  if (!lang.words) return;
  const next: Word[] = [];
  for (const w of lang.words) {
    const remaining = w.senses.filter((s) => s.meaning !== meaning);
    if (remaining.length === 0) continue;
    if (remaining.length !== w.senses.length) {
      const oldPrimary = w.senses[w.primarySenseIndex]?.meaning;
      w.senses = remaining;
      const newPrimary = remaining.findIndex((s) => s.meaning === oldPrimary);
      w.primarySenseIndex = newPrimary >= 0 ? newPrimary : 0;
    }
    next.push(w);
  }
  lang.words = next;
}

/**
 * Rebuild `lang.lexicon` (and `colexifiedAs` derived view) from
 * `lang.words`. Call after any mutation to `words`. Preserves the
 * pre-Phase-21 contract: `lexicon[m]` returns one form per meaning, the
 * primary form. When two words share a meaning (rare doublets via
 * altForms), the highest-weighted sense wins.
 *
 * Pure read-side: callers that haven't been migrated to write through
 * `addWord`/`removeSense` keep working on their `lexicon[m] = form`
 * mutations; in that case `words` is left untouched here. The inverse
 * (rebuilding `words` from `lexicon`) is `syncWordsFromLexicon()`.
 */
export function syncLexiconFromWords(lang: Language): void {
  if (!lang.words) return;
  const nextLexicon: Record<Meaning, WordForm> = {};
  const colex: Record<Meaning, Meaning[]> = {};
  // For each meaning, track the (word, sense) pair with the highest weight.
  const bestBySense: Record<Meaning, { word: Word; weight: number }> = {};
  for (const w of lang.words) {
    for (const s of w.senses) {
      const prior = bestBySense[s.meaning];
      if (!prior || s.weight > prior.weight) {
        bestBySense[s.meaning] = { word: w, weight: s.weight };
      }
    }
    // Words with ≥2 senses generate colexification edges between every
    // pair of meanings on the word.
    if (w.senses.length >= 2) {
      for (const a of w.senses) {
        for (const b of w.senses) {
          if (a.meaning === b.meaning) continue;
          (colex[a.meaning] ??= []);
          if (!colex[a.meaning].includes(b.meaning)) {
            colex[a.meaning].push(b.meaning);
          }
        }
      }
    }
  }
  for (const [meaning, { word }] of Object.entries(bestBySense)) {
    nextLexicon[meaning] = word.form.slice();
  }
  lang.lexicon = nextLexicon;
  // Only overwrite colexifiedAs when we have data; pre-existing entries
  // from older code paths are preserved if the words table is empty.
  if (Object.keys(colex).length > 0 || lang.colexifiedAs) {
    lang.colexifiedAs = colex;
  }
}

/**
 * Inverse of `syncLexiconFromWords`. Builds `lang.words` from the
 * meaning-keyed `lexicon` (and existing `colexifiedAs` if present).
 * Idempotent: re-running on a language with `words` already populated is
 * a no-op. Used by:
 *   - `steps/init.ts` after seeding from a preset (so day-zero languages
 *     have `words` populated).
 *   - `persistence/migrate.ts` v5→v6 migrator.
 */
export function syncWordsFromLexicon(
  lang: Language,
  bornGeneration: number,
): void {
  if (lang.words && lang.words.length > 0) return;
  lang.words = [];
  // Group meanings that share a form.
  const byKey = new Map<string, { form: WordForm; meanings: Meaning[] }>();
  for (const [meaning, form] of Object.entries(lang.lexicon)) {
    if (!form || form.length === 0) continue;
    const key = formKeyOf(form);
    const existing = byKey.get(key);
    if (existing) {
      existing.meanings.push(meaning);
    } else {
      byKey.set(key, { form: form.slice(), meanings: [meaning] });
    }
  }
  // Also fold in colexification edges from older runs: meanings
  // recorded as colexified should land on the same word even if their
  // forms briefly differ during migration.
  if (lang.colexifiedAs) {
    for (const [m, partners] of Object.entries(lang.colexifiedAs)) {
      const formA = lang.lexicon[m];
      if (!formA) continue;
      const keyA = formKeyOf(formA);
      const entry = byKey.get(keyA);
      if (!entry) continue;
      for (const p of partners) {
        if (!entry.meanings.includes(p) && lang.lexicon[p]) {
          entry.meanings.push(p);
        }
      }
    }
  }
  for (const { form, meanings } of byKey.values()) {
    const senses: WordSense[] = meanings.map((meaning) => ({
      meaning,
      weight: lang.wordFrequencyHints?.[meaning] ?? 0.4,
      register: lang.registerOf?.[meaning],
      bornGeneration,
      origin:
        typeof lang.wordOrigin?.[meaning] === "string"
          ? (lang.wordOrigin![meaning] as string)
          : undefined,
    }));
    lang.words.push({
      form,
      formKey: formKeyOf(form),
      senses,
      primarySenseIndex: 0,
      bornGeneration,
    });
  }
}
