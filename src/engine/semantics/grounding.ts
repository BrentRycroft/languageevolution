/**
 * grounding.ts — nearest-anchor grounding for the translator (relocated from embeddings.ts).
 *
 * Lives in its own module so it can read `meaningPointFor` (a meaning's CURRENT, possibly
 * glided position) without a circular import through embeddings.ts (which meaningPoint.ts
 * depends on). The translator reuses the semantically nearest word a language ALREADY has,
 * measured at its present position in the space, rather than coining a novel form.
 */
import type { Language, Meaning } from "../types";
import { lexIds, lexFormById } from "../lexicon/access";
import { meaningForLexemeId } from "../lexicon/lexemeIdentity";
import { cosineFixed } from "./vec";
import { meaningPointFor } from "./meaningPoint";

/**
 * Default cosine bar for treating one meaning as a usable stand-in for another. Tuned so
 * genuine near-synonyms / hyponyms ground (river≈water) but loosely-associated words do not —
 * below it the translator coins a fresh form instead of substituting.
 */
export const SEMANTIC_GROUNDING_THRESHOLD = 0.5;

export interface GroundedMeaning {
  meaning: Meaning;
  similarity: number;
}

/**
 * The lexicalised meaning in `lang` whose current point is closest to `meaning`, provided it
 * clears `threshold`. Null if nothing's close enough. Read-only.
 */
export function nearestLexicalisedMeaning(
  lang: Language,
  meaning: Meaning,
  threshold: number = SEMANTIC_GROUNDING_THRESHOLD,
): GroundedMeaning | null {
  const target = meaningPointFor(lang, meaning);
  let best: GroundedMeaning | null = null;
  for (const id of lexIds(lang)) {
    const k = meaningForLexemeId(lang, id);
    if (k === undefined || k === meaning) continue;
    const f = lexFormById(lang, id);
    if (!f || f.length === 0) continue;
    const s = cosineFixed(target, meaningPointFor(lang, k));
    if (s >= threshold && (!best || s > best.similarity)) {
      best = { meaning: k, similarity: s };
    }
  }
  return best;
}
