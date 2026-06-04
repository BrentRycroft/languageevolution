import type { Meaning, Language } from "../types";
import { isRegisteredConcept } from "../lexicon/concepts";
import { lexKeys, lexGet } from "../lexicon/access";
import { fnv1a } from "../rng";
import { EMBED_DIM, EMBED_TABLE } from "./embeddingData";

/**
 * embeddings.ts
 *
 * Distributional semantic vectors for meanings. Key exports: EMBEDDING_DIMS, embed, cosine.
 *
 * MEGA-overhaul Lane C0: the meaning vectors are now a real distributional embedding
 * (glove-wiki-gigaword-50, public-domain), quantized to int8 in `embeddingData.ts`,
 * with the curated gradable antonym pairs counter-fitted APART (raw distributional
 * embeddings place antonyms close — hot/cold share contexts — so drift could wander to
 * an opposite; counter-fitting + the `areAntonyms` guard prevent that). This replaces
 * the prior degenerate 12-dim hand-built centroid table (audit: antonyms cos≈0.99,
 * everything ≈ everything). Compounds/derivations compose from the embeddings of their
 * RECORDED parts; the ~0.1% of concepts with no GloVe token and unknown dynamic meanings
 * fall back to a deterministic hash vector.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const EMBEDDING_DIMS = EMBED_DIM;

function zero(): number[] {
  return new Array(EMBED_DIM).fill(0);
}

/** Deterministic per-meaning hash vector — fallback for meanings absent from the table. */
function jitter(id: Meaning, magnitude: number): number[] {
  const out = zero();
  let seed = fnv1a(id);
  for (let i = 0; i < EMBED_DIM; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    out[i] = ((seed / 0xffffffff) * 2 - 1) * magnitude;
  }
  return out;
}

/** Average the table vectors of the parts that have one; null if none do. */
function composeFrom(parts: readonly string[]): number[] | null {
  const v = zero();
  let n = 0;
  for (const p of parts) {
    const pv = EMBED_TABLE[p];
    if (!pv) continue;
    for (let i = 0; i < EMBED_DIM; i++) v[i]! += pv[i]!;
    n++;
  }
  if (n === 0) return null;
  for (let i = 0; i < EMBED_DIM; i++) v[i]! /= n;
  return v;
}

export function embed(meaning: Meaning, lang?: Language): number[] {
  const direct = EMBED_TABLE[meaning];
  if (direct) return direct.slice();
  // Prefer the RECORDED decomposition (compound / derivation parts) over the gloss.
  const recorded = lang?.compounds?.[meaning]?.parts;
  if (recorded && recorded.length > 0) {
    const c = composeFrom(recorded);
    if (c) return c;
  }
  if (meaning.includes("-")) {
    const c = composeFrom(meaning.split("-"));
    if (c) return c;
  }
  return jitter(meaning, 1);
}

export function cosine(a: number[], b: number[]): number {
  const dim = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < dim; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Default cosine bar for treating one meaning as a usable stand-in for another. Tuned so
 * genuine near-synonyms / hyponyms ground (river≈water, glad≈happy) but loosely-associated
 * words do not — below it the translator coins a fresh form instead of substituting.
 */
export const SEMANTIC_GROUNDING_THRESHOLD = 0.5;

export interface GroundedMeaning {
  meaning: Meaning;
  similarity: number;
}

/**
 * Nearest-anchor grounding: the lexicalised meaning in `lang` whose embedding is closest
 * (cosine) to `meaning`, provided it clears `threshold`. Lets the translator reuse the
 * semantically nearest word a language ALREADY has rather than coining a novel form when a
 * concept is missing. Returns null when nothing is close enough. Read-only.
 */
export function nearestLexicalisedMeaning(
  lang: Language,
  meaning: Meaning,
  threshold: number = SEMANTIC_GROUNDING_THRESHOLD,
): GroundedMeaning | null {
  const target = embed(meaning, lang);
  let best: GroundedMeaning | null = null;
  for (const k of lexKeys(lang)) {
    if (k === meaning) continue;
    const f = lexGet(lang, k);
    if (!f || f.length === 0) continue;
    const s = cosine(target, embed(k, lang));
    if (s >= threshold && (!best || s > best.similarity)) {
      best = { meaning: k, similarity: s };
    }
  }
  return best;
}

export function nearestMeanings(
  meaning: Meaning,
  candidates: readonly Meaning[],
  k = 5,
): Meaning[] {
  const target = embed(meaning);
  const scored = candidates
    .filter((c) => c !== meaning)
    .map((c) => ({ c, s: cosine(target, embed(c)) }))
    .filter((x) => x.s > 0.2);
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, k).map((x) => x.c);
}

export { isRegisteredConcept };
