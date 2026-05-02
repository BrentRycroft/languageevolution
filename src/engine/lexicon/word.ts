import type { Language, Meaning, Word, WordSense, WordForm } from "../types";
import type { Rng } from "../rng";
import { formToString } from "../phonology/ipa";
import { neighborsOf } from "../semantics/neighbors";

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

/**
 * Result of a sound-change-driven word reconciliation pass. Each entry
 * records a merger event ("child" + "shall" → one word with both
 * meanings) so the engine can push a LanguageEvent for it.
 */
export interface WordMergerEvent {
  formKey: string;
  /** The two-or-more meanings now sharing this form. */
  mergedMeanings: Meaning[];
  /** Which meanings were already on the surviving word (no surprise). */
  preExistingMeanings: Meaning[];
  /** Which meanings were absorbed *into* this word from another entry. */
  newlyAbsorbed: Meaning[];
}

/**
 * Reconcile `lang.words` against the post-phonology `lang.lexicon`.
 *
 * After each generation's sound-change pass, two distinct words may have
 * drifted into the same surface form (the canonical "child / shall →
 * one word with two meanings" case). This helper:
 *   1. Refreshes each Word's form to match the new lang.lexicon[primary
 *      sense's meaning]; drops senses whose meanings were deleted.
 *   2. If a polysemous Word's senses now point at *different* forms,
 *      splits the word so each surviving form is its own entry.
 *   3. Groups the resulting entries by formKey; any group of size ≥2 is
 *      merged into the earliest-born entry, with newly absorbed senses
 *      tagged origin "sound-change-merger".
 *
 * Returns the list of merger events for the caller to log via pushEvent.
 * Idempotent: a second call on a fully-synced language emits no events.
 */
export function syncWordsAfterPhonology(
  lang: Language,
  _generation: number,
): WordMergerEvent[] {
  if (!lang.words || lang.words.length === 0) return [];

  // Step 1+2: refresh each word's form against the current lexicon.
  // If a word's senses now point at multiple distinct forms, split it.
  const next: Word[] = [];
  for (const word of lang.words) {
    // Group this word's senses by their post-phonology form. Each group
    // with senses sharing a form becomes one Word.
    const buckets = new Map<string, { form: WordForm; senses: WordSense[] }>();
    for (const sense of word.senses) {
      const lexForm = lang.lexicon[sense.meaning];
      if (!lexForm || lexForm.length === 0) continue; // meaning was deleted
      const key = formKeyOf(lexForm);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.senses.push(sense);
      } else {
        buckets.set(key, { form: lexForm.slice(), senses: [sense] });
      }
    }
    if (buckets.size === 0) continue; // every sense's meaning was deleted
    for (const { form, senses } of buckets.values()) {
      // The primary stays attached to the first surviving sense whose
      // meaning was the original primary; otherwise default to 0.
      const oldPrimaryMeaning = word.senses[word.primarySenseIndex]?.meaning;
      const newPrimary = senses.findIndex((s) => s.meaning === oldPrimaryMeaning);
      next.push({
        form,
        formKey: formKeyOf(form),
        senses,
        primarySenseIndex: newPrimary >= 0 ? newPrimary : 0,
        bornGeneration: word.bornGeneration,
        origin: word.origin,
      });
    }
  }

  // Step 3: group by formKey; merge collisions.
  const events: WordMergerEvent[] = [];
  const byKey = new Map<string, Word[]>();
  for (const w of next) {
    const list = byKey.get(w.formKey);
    if (list) list.push(w);
    else byKey.set(w.formKey, [w]);
  }
  const merged: Word[] = [];
  for (const [, list] of byKey) {
    if (list.length === 1) {
      merged.push(list[0]!);
      continue;
    }
    // Pick the earliest-born word as the anchor; the others fold in.
    list.sort((a, b) => a.bornGeneration - b.bornGeneration);
    const anchor = list[0]!;
    const preExistingMeanings = anchor.senses.map((s) => s.meaning);
    const absorbed: Meaning[] = [];
    for (let i = 1; i < list.length; i++) {
      for (const s of list[i]!.senses) {
        if (anchor.senses.some((a) => a.meaning === s.meaning)) continue;
        anchor.senses.push({ ...s, origin: "sound-change-merger" });
        absorbed.push(s.meaning);
      }
    }
    if (absorbed.length > 0) {
      events.push({
        formKey: anchor.formKey,
        mergedMeanings: anchor.senses.map((s) => s.meaning),
        preExistingMeanings,
        newlyAbsorbed: absorbed,
      });
    }
    merged.push(anchor);
  }
  lang.words = merged;
  return events;
}

/**
 * Cheap semantic relatedness check between two meanings. Used by the
 * Phase 21c collision logic to decide whether a candidate coinage that
 * would homophone-collide with an existing word should fold in as
 * polysemy (related → high probability) or be rejected (unrelated →
 * low probability). Real-world example: Spanish *banco* picked up the
 * "bench" + "bank-of-river" + "financial-bank" senses partly because
 * "bench" / "bank-of-river" are semantically adjacent.
 */
export function areMeaningsRelated(
  lang: Language,
  a: Meaning,
  b: Meaning,
): boolean {
  if (a === b) return true;
  const semA = neighborsOf(a);
  if (semA.includes(b)) return true;
  const semB = neighborsOf(b);
  if (semB.includes(a)) return true;
  const localA = lang.localNeighbors?.[a] ?? [];
  if (localA.includes(b)) return true;
  const localB = lang.localNeighbors?.[b] ?? [];
  if (localB.includes(a)) return true;
  return false;
}

/**
 * Phase 21c: register a coinage in `lang.words` with collision-aware
 * policy. When the candidate `form` already exists in the language for
 * a different meaning, this helper rolls a probability:
 *   - 0.4 (default) if any existing sense is semantically related to
 *     the new meaning → attach as polysemy.
 *   - 0.05 (default) for unrelated meanings → attach as accidental
 *     homonymy occurs but is rare.
 * If the roll fails, returns `committed: false` and the caller should
 * skip the coinage (the genesis loop will retry on its next iteration).
 *
 * Returns `viaPolysemy: true` when the coinage attached as a sense on
 * an existing word; the caller can use this to tag wordOrigin
 * accordingly. Idempotent if the word already contains this meaning.
 */
export function tryCommitCoinage(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
  rng: Rng,
  opts: {
    bornGeneration: number;
    weight?: number;
    register?: "high" | "low" | "neutral";
    origin?: string;
    polysemyProbRelated?: number;
    polysemyProbUnrelated?: number;
  },
): { committed: boolean; viaPolysemy: boolean } {
  const polyRel = opts.polysemyProbRelated ?? 0.4;
  const polyUnrel = opts.polysemyProbUnrelated ?? 0.05;
  const existing = findWordByForm(lang, form);
  if (!existing) {
    addWord(lang, form, meaning, opts);
    return { committed: true, viaPolysemy: false };
  }
  // The form is already in the language. If the new meaning is already
  // a sense of this word, we're idempotent.
  if (existing.senses.some((s) => s.meaning === meaning)) {
    return { committed: true, viaPolysemy: false };
  }
  const related = existing.senses.some((s) =>
    areMeaningsRelated(lang, s.meaning, meaning),
  );
  const prob = related ? polyRel : polyUnrel;
  if (!rng.chance(prob)) {
    return { committed: false, viaPolysemy: false };
  }
  addSenseToWord(existing, {
    meaning,
    weight: opts.weight,
    register: opts.register,
    bornGeneration: opts.bornGeneration,
    origin: opts.origin ?? "polysemy",
  });
  return { committed: true, viaPolysemy: true };
}
