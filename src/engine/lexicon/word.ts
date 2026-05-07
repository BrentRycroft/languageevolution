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
 *
 * Phase 29 Tranche 1e: when the form-key index `wordsByFormKey` is
 * present, the lookup is O(1) instead of O(N). The index is rebuilt
 * by `rebuildFormKeyIndex` after any wholesale `lang.words` mutation
 * (currently: syncWordsAfterPhonology, init, split). Per-call writers
 * like setLexiconForm / addWord update the index incrementally.
 */
export function findWordByForm(
  lang: Language,
  form: WordForm,
): Word | undefined {
  if (!lang.words) return undefined;
  const key = formKeyOf(form);
  if (lang.wordsByFormKey) {
    return lang.wordsByFormKey.get(key);
  }
  return lang.words.find((w) => w.formKey === key);
}

/**
 * Phase 29 Tranche 1e: rebuild the form-key index from scratch after
 * any mutation that may have replaced `lang.words` wholesale.
 */
export function rebuildFormKeyIndex(lang: Language): void {
  if (!lang.words) {
    lang.wordsByFormKey = undefined;
    return;
  }
  const map = new Map<string, Word>();
  for (const w of lang.words) {
    map.set(w.formKey, w);
  }
  lang.wordsByFormKey = map;
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
 * Used to power the lexicon[meaning] → primary-form view. Phase 37
 * skips senses tagged `synonym: true` so a synonym Word never wins
 * the primary slot.
 */
export function findPrimaryWordForMeaning(
  lang: Language,
  meaning: Meaning,
): Word | undefined {
  if (!lang.words) return undefined;
  return lang.words.find((w) => {
    const sense = w.senses[w.primarySenseIndex];
    return sense?.meaning === meaning && !sense.synonym;
  });
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
    synonym: sense.synonym,
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
    synonym?: boolean;
  },
): Word {
  if (!lang.words) lang.words = [];
  const key = formKeyOf(form);
  // Phase 29 Tranche 1e: prefer the O(1) index when present; falls
  // back to linear scan for v6 saves that haven't been touched yet.
  const existing = lang.wordsByFormKey
    ? lang.wordsByFormKey.get(key)
    : lang.words.find((w) => w.formKey === key);
  if (existing) {
    addSenseToWord(existing, {
      meaning,
      weight: opts.weight,
      register: opts.register,
      bornGeneration: opts.bornGeneration,
      origin: opts.origin,
      synonym: opts.synonym,
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
        synonym: opts.synonym,
      },
    ],
    primarySenseIndex: 0,
    bornGeneration: opts.bornGeneration,
    origin: opts.origin,
  };
  lang.words.push(word);
  if (lang.wordsByFormKey) lang.wordsByFormKey.set(key, word);
  return word;
}

/**
 * Phase 37: return every form that carries this meaning as a sense,
 * primary first. Used by the composer/realiser to pick among
 * synonyms based on context, and by the UI to display all forms for
 * a meaning. Returns at most a few forms; the empty array is the
 * normal "no synonyms exist" outcome.
 */
export function selectSynonyms(
  lang: Language,
  meaning: Meaning,
): Word[] {
  if (!lang.words) return [];
  const matches = findWordsByMeaning(lang, meaning);
  // Primary-first ordering: the Word whose primary sense is `meaning`
  // (and is not flagged as synonym) comes first; synonyms follow,
  // ranked by their sense weight.
  const primary = matches.find((w) => {
    const s = w.senses[w.primarySenseIndex];
    return s?.meaning === meaning && !s.synonym;
  });
  const others = matches
    .filter((w) => w !== primary)
    .sort((a, b) => {
      const sa = a.senses.find((s) => s.meaning === meaning)?.weight ?? 0;
      const sb = b.senses.find((s) => s.meaning === meaning)?.weight ?? 0;
      return sb - sa;
    });
  return primary ? [primary, ...others] : others;
}

/**
 * Phase 37: pick which form to surface for a meaning given the
 * caller's context (genre register + recently-used set). When no
 * synonyms exist, returns the primary form. Otherwise:
 *
 * - if `recentlyUsed` contains the primary form, prefer a synonym
 *   to avoid repetition (real-world variation).
 * - if `register` is set, bias toward a synonym whose sense register
 *   matches.
 * - otherwise return the primary form.
 *
 * The helper is pure — it doesn't mutate. The composer is expected
 * to update the caller-side recently-used set after each pick.
 */
export function pickSynonym(
  lang: Language,
  meaning: Meaning,
  ctx?: {
    register?: "high" | "low" | "neutral";
    recentlyUsed?: ReadonlySet<string>;
  },
): WordForm | undefined {
  const candidates = selectSynonyms(lang, meaning);
  if (candidates.length === 0) return lang.lexicon[meaning];
  const primary = candidates[0]!;
  if (candidates.length === 1) return primary.form;
  // Register-biased pick.
  if (ctx?.register) {
    const matched = candidates.find((w) =>
      w.senses.some((s) => s.meaning === meaning && s.register === ctx.register),
    );
    if (matched) return matched.form;
  }
  // Repetition avoidance.
  if (ctx?.recentlyUsed && ctx.recentlyUsed.has(primary.formKey)) {
    return candidates[1]!.form;
  }
  return primary.form;
}

/**
 * Phase 37: drop the meaning from the word with this exact form. If
 * the word's senses become empty after removal, the word itself is
 * removed from the language. Used to retire a synonym.
 */
export function removeSynonymSense(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
): void {
  if (!lang.words) return;
  const w = findWordByForm(lang, form);
  if (!w) return;
  const remaining = w.senses.filter((s) => s.meaning !== meaning);
  if (remaining.length === w.senses.length) return; // not a sense
  if (remaining.length === 0) {
    // Drop the word entirely.
    lang.words = lang.words.filter((x) => x !== w);
    if (lang.wordsByFormKey) lang.wordsByFormKey.delete(w.formKey);
    return;
  }
  const oldPrimary = w.senses[w.primarySenseIndex]?.meaning;
  w.senses = remaining;
  const newPrimary = remaining.findIndex((s) => s.meaning === oldPrimary);
  w.primarySenseIndex = newPrimary >= 0 ? newPrimary : 0;
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
  // Phase 29 Tranche 1e: keep the form-key index consistent.
  if (lang.wordsByFormKey) rebuildFormKeyIndex(lang);
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
  // Phase 29 Tranche 1e: build the form-key index alongside the
  // initial words[] so future findWordByForm calls are O(1).
  rebuildFormKeyIndex(lang);
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
  // Phase 29 Tranche 1e: index is now stale because words got
  // rewritten and form-keys may have collapsed. Rebuild from scratch.
  rebuildFormKeyIndex(lang);
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
  // Phase 48 T1: extend with derivational chain + compound-part
  // membership. This lets the homonym-avoidance check (T2/T3) treat
  // morphologically-related words as "related" — so e.g. a sound
  // change that would make a derived form homophonous with its base
  // is allowed (paradigm leveling), while one that would collide
  // with an unrelated lexeme is inhibited.
  if (originChainConnects(lang, a, b, 3)) return true;
  if (compoundsShareMember(lang, a, b)) return true;
  return false;
}

/**
 * Phase 48 T1: BFS through `lang.wordOriginChain` looking for a path
 * between `a` and `b` of at most `maxHops` edges. Each entry's `from`
 * and `via` fields count as 1 hop each.
 */
function originChainConnects(
  lang: Language,
  a: Meaning,
  b: Meaning,
  maxHops: number,
): boolean {
  const chain = lang.wordOriginChain;
  if (!chain) return false;
  const visited = new Set<Meaning>([a]);
  let frontier: Meaning[] = [a];
  for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
    const next: Meaning[] = [];
    for (const m of frontier) {
      const entry = chain[m];
      if (entry) {
        if (entry.from && !visited.has(entry.from)) {
          if (entry.from === b) return true;
          visited.add(entry.from);
          next.push(entry.from);
        }
        if (entry.via && !visited.has(entry.via)) {
          if (entry.via === b) return true;
          visited.add(entry.via);
          next.push(entry.via);
        }
      }
      // Reverse: any other meaning that lists `m` as parent counts too.
      for (const [child, e] of Object.entries(chain)) {
        if (visited.has(child)) continue;
        if (e?.from === m || e?.via === m) {
          if (child === b) return true;
          visited.add(child);
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return false;
}

/**
 * Phase 48 T1: two meanings are "compound-related" if either is a
 * member of the other's compound parts, or both share a part. This
 * keeps changes that shift the head of a compound from being
 * inhibited when they'd collide with a part.
 */
function compoundsShareMember(
  lang: Language,
  a: Meaning,
  b: Meaning,
): boolean {
  const compounds = lang.compounds;
  if (!compounds) return false;
  const ca = compounds[a];
  if (ca && ca.parts.includes(b)) return true;
  const cb = compounds[b];
  if (cb && cb.parts.includes(a)) return true;
  if (ca && cb) {
    for (const p of ca.parts) if (cb.parts.includes(p)) return true;
  }
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
  // Phase 37: progressively gate accidental homonymy. Each existing
  // sense on the target form halves the polysemy probability for
  // *unrelated* meanings (related polysemy stays at full rate). This
  // makes 3-way and 4-way homonyms vanishingly rare.
  const homonymPenalty = related
    ? 1
    : Math.pow(0.5, Math.max(0, existing.senses.length - 1));
  const prob = (related ? polyRel : polyUnrel) * homonymPenalty;
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

/**
 * Phase 21b: pick the most likely sense from a candidate list. Used when
 * the translator's reverse pipeline finds that an input form maps to
 * multiple meanings (homonyms / polysemy). Disambiguation strategy, in
 * priority order:
 *   1. Discourse topic match — if a candidate is the current
 *      discourseTopic, prefer it.
 *   2. Sentential context — score each candidate by semantic overlap
 *      with `contextLemmas` (the other resolved meanings in the same
 *      sentence). Higher overlap wins.
 *   3. Frequency hint — fallback to the candidate with the highest
 *      `lang.wordFrequencyHints[meaning]`.
 *   4. Alphabetic — deterministic tiebreaker.
 */
export function disambiguateSense(
  lang: Language,
  candidates: Meaning[],
  opts: {
    contextLemmas?: readonly Meaning[];
    discourseTopic?: Meaning;
  } = {},
): Meaning {
  if (candidates.length === 0) {
    throw new Error("disambiguateSense called with empty candidate list");
  }
  if (candidates.length === 1) return candidates[0]!;

  // 1. Discourse-topic match.
  if (opts.discourseTopic && candidates.includes(opts.discourseTopic)) {
    return opts.discourseTopic;
  }

  // 2. Sentential-context scoring.
  const ctx = opts.contextLemmas ?? [];
  if (ctx.length > 0) {
    let bestScore = 0;
    let best: Meaning | null = null;
    for (const c of candidates) {
      const neighbors = new Set<Meaning>([
        ...neighborsOf(c),
        ...(lang.localNeighbors?.[c] ?? []),
      ]);
      let score = 0;
      for (const ctxLemma of ctx) {
        if (ctxLemma === c) continue;
        if (neighbors.has(ctxLemma)) score += 2;
        else {
          const ctxNeighbors = new Set<Meaning>([
            ...neighborsOf(ctxLemma),
            ...(lang.localNeighbors?.[ctxLemma] ?? []),
          ]);
          if (ctxNeighbors.has(c)) score += 1;
        }
      }
      // Tiny frequency bonus to break true ties.
      score += (lang.wordFrequencyHints?.[c] ?? 0.4) * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) return best;
  }

  // 3. Frequency fallback. When multiple candidates tie on frequency
  //    (the common case for newly-coined words at default 0.4), fall
  //    through to alphabetic tiebreak instead of letting iteration
  //    order decide.
  let bestFreq = -1;
  for (const c of candidates) {
    const f = lang.wordFrequencyHints?.[c] ?? 0.4;
    if (f > bestFreq) bestFreq = f;
  }
  const tied = candidates.filter(
    (c) => (lang.wordFrequencyHints?.[c] ?? 0.4) === bestFreq,
  );
  return tied.slice().sort()[0]!;
}
