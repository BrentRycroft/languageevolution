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

// S3 B10b: the gloss-in seam API (lexGet/lexHas/lexSet/lexDelete/lexKeys/lexValues/lexEntries) is
// RETIRED — the engine addresses lexemes by LexemeId. Gloss→id resolution survives only at boundaries
// via `idForGloss` (non-minting) and `coinSeededLexeme` (the seeded-coinage mint). For display/string
// ops, resolve id→seed-gloss via `meaningForLexemeId` (lexemeIdentity.ts).

/** Number of gloss-bearing (seeded) entries. Keyless records are excluded. */
export function lexSize(lang: LexiconState): number {
  return lexIds(lang).length;
}
