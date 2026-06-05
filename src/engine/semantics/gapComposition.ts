/**
 * gapComposition.ts — Track B: vector-composition coinage. Build a form for a needed concept by
 * compounding the morphemes whose meaning points are most RELATED (closest in direction / cosine)
 * to the concept's point — the realistic kenning model (water+eye = tear, fire+stone = lava).
 *
 * Why nearest-RELATED rather than `nearestComposition` (the additive Plan-1 primitive): raw GloVe
 * root anchors are not additive (a target's anchor ≠ the sum of its parts' anchors), so a greedy
 * sum-search overshoots the target magnitude and returns a single part. Cosine proximity is
 * magnitude-robust and matches how compounds actually relate to their parts. `nearestComposition`
 * stays the right tool for the additive/affixal baked space, not arbitrary-root coinage.
 *
 * Pure + deterministic (no RNG): same language + meaning → same parts. The rare new-morpheme
 * fallback (Track B B2) and the genesis wiring (B4) build on this.
 */
import type { Language, Meaning, WordForm } from "../types";
import { cosineFixed } from "./vec";
import { meaningPointFor } from "./meaningPoint";
import { languageMorphemes } from "./languageMorphemes";
import { hasEmbedding } from "./embeddings";
import { langPhonotacticScore } from "../phonology/phonotactics";

/** A part must be at least this cosine-related to the target to be a compounding constituent. */
export const GAP_RELATEDNESS_COS = 0.4;
/** Reject a composed form longer than this (a coinage shouldn't be a tongue-twister). */
export const GAP_MAX_FORM_LEN = 10;
/** Phonotactic floor a composed form must clear (mirrors the compound mechanism's gate). */
export const GAP_PHONOTACTIC_FLOOR = 0.25;

export interface GapComposition {
  form: WordForm;
  parts: [Meaning, Meaning];
}

/**
 * Compose a form for `meaning` from the two open-class roots whose points are most related to it.
 * Returns null when fewer than two related roots exist, or the form is too long / phonotactically
 * illegal — the caller then falls back to a rare new morpheme (B2).
 */
export function composeForGap(lang: Language, meaning: Meaning): GapComposition | null {
  // Only compose for a target with a REAL distributional point; a hash-vector fallback would
  // produce meaningless "nearest" morphemes (spurious noise compositions).
  if (!hasEmbedding(meaning)) return null;
  const target = meaningPointFor(lang, meaning);
  const ranked = languageMorphemes(lang)
    .filter((m) => m.type === "root" && m.id !== meaning)
    .map((m) => ({ id: m.id, form: m.form, cos: cosineFixed(target, m.point) }))
    .filter((x) => x.cos >= GAP_RELATEDNESS_COS)
    .sort((a, b) => b.cos - a.cos || (a.id < b.id ? -1 : 1));
  if (ranked.length < 2) return null;

  const head = ranked[0]!; // most related = semantic head
  const modifier = ranked[1]!;
  // Head-final (modifier + head): the more-related root anchors the meaning at the end.
  const form: WordForm = [...modifier.form, ...head.form];
  if (form.length === 0 || form.length > GAP_MAX_FORM_LEN) return null;
  if (langPhonotacticScore(lang, form) < GAP_PHONOTACTIC_FLOOR) return null;

  return { form, parts: [modifier.id, head.id] };
}
