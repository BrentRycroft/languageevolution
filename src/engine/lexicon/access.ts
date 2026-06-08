import type { Meaning, WordForm } from "../types";
import type { LexiconState } from "../domains";
import { lexemeIdFor, buildLexemeIdToGloss, type LexemeId } from "./lexemeIdentity";
import { lexPoint } from "../semantics/meaningPoint";

/**
 * access.ts — the canonical lexicon ACCESSOR seam (concept re-key).
 *
 * Every read/write/iteration of `lang.lexicon` routes through these helpers
 * instead of indexing the record directly. R2 (the flip) made the canonical
 * store `Record<LexemeId, WordForm>`; ONLY the bodies here translate the
 * gloss the engine speaks in (`Meaning`) to/from the LexemeId the store is
 * keyed by. Call sites stay gloss-agnostic.
 * See docs/planning/CONCEPT-REKEY-PLAN.md.
 *
 * KEYING DISCIPLINE: `lang.lexicon` is the ONLY LexemeId-keyed map. Every
 * satellite per-meaning field (wordFrequencyHints, registerOf,
 * lastChangeGeneration, localNeighbors, …) and `lang.lexemeIds` itself stay
 * GLOSS-keyed. The bridge is `meaningForLexemeId` / `lexemeIdFor`.
 *
 * ORDER CONTRACT (determinism footgun — read this):
 *   - `lexKeys` returns GLOSSES in **insertion order** (the store's raw
 *     `Object.keys` order, resolved to glosses). Several RNG-coupled sites feed
 *     this to `rng.int`-by-index; insertion parity holds because the cid store
 *     is built in the same order the gloss store was.
 *   - SORTED iteration is a DIFFERENT contract: use `orderedLexiconKeys(lang)`
 *     (glosses) or `orderedLexemeIds(lexicon, lang)` (the matching store keys),
 *     NOT `lexKeys().sort()`, so the canonical sorted order lives in one place.
 *
 * Reads (`lexGet`/`lexHas`/`lexDelete`) use the NON-minting lookup
 * (`lang.lexemeIds?.[m]`) so a miss never perturbs the LexemeId mint stream;
 * only `lexSet` mints (via `lexemeIdFor`) when a genuinely new meaning is
 * coined.
 */

// --- S3: barcode-native primary accessors ---
/** Form for a record id, or undefined. Primary read. */
export function lexFormById(lang: LexiconState, id: LexemeId): WordForm | undefined {
  return lang.lexemes[id]?.form;
}
/** Set an EXISTING record's form in place (preserving point + gloss). Never mints; no-op if absent. */
export function lexSetFormById(lang: LexiconState, id: LexemeId, form: WordForm): void {
  const rec = lang.lexemes[id];
  if (rec) rec.form = form;
}
/** Whether a record id exists in the store. Accepts undefined (a gloss with no id → false) so callers
 *  can write `lexHasById(lang, idForGloss(lang, gloss))` as a faithful `lexHas`: that checks BOTH the
 *  gloss→id mapping AND record existence. They differ — a word killed via `lexDelete` can keep a stale
 *  `lexemeIds` entry (the registry purge is separate), so `idForGloss(...) !== undefined` alone would
 *  still count the dead word. */
export function lexHasById(lang: LexiconState, id: LexemeId | undefined): boolean {
  return id !== undefined && lang.lexemes[id] !== undefined;
}
/** Delete a record by id. */
export function lexDeleteById(lang: LexiconState, id: LexemeId): void {
  if (lang.lexemes[id] !== undefined) delete lang.lexemes[id];
}
/** Seeded ids in INSERTION order — gloss-bearing records only (keyless excluded). Positional twin of
 *  `lexKeys`. NOT sorted (use `orderedLexemeIds` for the RNG-draw order). */
export function lexIds(lang: LexiconState): LexemeId[] {
  const g = buildLexemeIdToGloss(lang);
  const out: LexemeId[] = [];
  for (const cid of Object.keys(lang.lexemes)) if (g.has(cid)) out.push(cid as LexemeId);
  return out;
}
/** Non-minting boundary resolver: gloss → id, or undefined if the word does not exist. */
export function idForGloss(lang: LexiconState, m: Meaning): LexemeId | undefined {
  return lang.lexemeIds?.[m] as LexemeId | undefined;
}
/** Coin a NEW seeded word (or update an existing one's form) by gloss — the single blessed seeded-mint
 *  boundary. Mints a LexemeId + record (materialized point + gloss) for a new meaning; an existing
 *  meaning updates its form in place. Returns the id. */
export function coinSeededLexeme(lang: LexiconState, m: Meaning, form: WordForm): LexemeId {
  const id = lexemeIdFor(lang, m);
  const rec = lang.lexemes[id];
  if (rec) rec.form = form;
  else lang.lexemes[id] = { form, point: Array.from(lexPoint(m)), gloss: m };
  return id;
}

/** Form for a meaning, or undefined. */
export function lexGet(lang: LexiconState, m: Meaning): WordForm | undefined {
  const id = idForGloss(lang, m);
  return id === undefined ? undefined : lexFormById(lang, id);
}

/** Whether the lexicon has a form for this meaning. */
export function lexHas(lang: LexiconState, m: Meaning): boolean {
  const id = idForGloss(lang, m);
  return id !== undefined && lexHasById(lang, id);
}

/** Set/replace the form for a meaning. Mints a LexemeId + record (materialized
 * point + gloss) for a new meaning, appending to the store in call order
 * (insertion parity with the old gloss store). An existing meaning updates its
 * record's form in place, preserving its point + gloss. */
export function lexSet(lang: LexiconState, m: Meaning, form: WordForm): void {
  coinSeededLexeme(lang, m, form);
}

/** Remove a meaning's record. (`lang.lexemeIds` is purged separately by
 * deleteMeaning's registry pass.) */
export function lexDelete(lang: LexiconState, m: Meaning): void {
  const id = idForGloss(lang, m);
  if (id !== undefined) { lexDeleteById(lang, id); return; }
  // S2b: a KEYLESS (gloss-less) record has no lexemeIds entry; if `m` is itself a store key (its
  // LexemeId, e.g. a keyless recarve loser), delete it directly. Seeded glosses are never store keys
  // post-flip, so this branch only fires for an id and leaves seeded deletion byte-identical.
  if (lexHasById(lang, m as unknown as LexemeId)) lexDeleteById(lang, m as unknown as LexemeId);
}

/** Meanings (glosses) in INSERTION order — gloss-bearing records only (keyless
 * EXCLUDED, preserving today's behaviour for every gloss-iterating caller). NOT sorted. */
export function lexKeys(lang: LexiconState): Meaning[] {
  const g = buildLexemeIdToGloss(lang);
  const out: Meaning[] = [];
  for (const cid of Object.keys(lang.lexemes)) {
    const m = g.get(cid);
    if (m !== undefined) out.push(m);
  }
  return out;
}

/** Forms in insertion order — gloss-bearing records only. */
export function lexValues(lang: LexiconState): WordForm[] {
  const g = buildLexemeIdToGloss(lang);
  const out: WordForm[] = [];
  for (const cid of Object.keys(lang.lexemes)) if (g.has(cid)) out.push(lang.lexemes[cid]!.form);
  return out;
}

/** [meaning, form] pairs in insertion order — gloss-bearing records only. */
export function lexEntries(lang: LexiconState): [Meaning, WordForm][] {
  const g = buildLexemeIdToGloss(lang);
  const out: [Meaning, WordForm][] = [];
  for (const cid of Object.keys(lang.lexemes)) {
    const m = g.get(cid);
    if (m !== undefined) out.push([m, lang.lexemes[cid]!.form]);
  }
  return out;
}

/** Number of gloss-bearing entries. */
export function lexSize(lang: LexiconState): number {
  return lexKeys(lang).length;
}
