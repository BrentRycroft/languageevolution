/**
 * meaningPoint.ts — a concept's meaning POSITION, the source of truth for semantic distance.
 *
 * `lexPoint(meaning)` returns the fixed-point vector a meaning occupies: a decomposed word
 * (present in the baked morpheme space) sits at its morpheme COMPOSITION; every other word
 * sits at its quantized GloVe anchor. Pure + cached + deterministic — points are a function
 * of the meaning, so there is no per-language state to clone or persist (mutable points come
 * in a later plan). Drift reads distances from here instead of recomputing `embed()` per call.
 */
import type { Language, Meaning } from "../types";
import { type Vec, fromFloats, sumVecs, subVecs, roundDivVec } from "./vec";
import { embed, hasEmbedding } from "./embeddings";
import { glossOf } from "./anchors";
import { loadMorphemeSpace } from "./morphemeSpaceLoader";

let WORD_POINTS: Map<string, Vec> | null = null;
function wordPoints(): Map<string, Vec> {
  if (WORD_POINTS === null) WORD_POINTS = loadMorphemeSpace().wordPoints;
  return WORD_POINTS;
}

const cache = new Map<Meaning, Vec>();

/** The meaning point: baked composition if decomposed, else the quantized GloVe anchor. */
export function lexPoint(meaning: Meaning): Vec {
  const hit = cache.get(meaning);
  if (hit) return hit;
  const point = wordPoints().get(meaning) ?? fromFloats(embed(meaning));
  cache.set(meaning, point);
  return point;
}

import type { WordSense } from "../types";

/** Default breadth for a sense that hasn't broadened/narrowed yet. Tunable. */
export const DEFAULT_SPREAD = 1;

/** This sense's point — its own glided position if set, else the meaning's static default. */
export function sensePoint(sense: WordSense): Vec {
  return sense.point ? Int32Array.from(sense.point) : lexPoint(sense.meaning);
}

/** This sense's breadth (region radius); DEFAULT_SPREAD until broaden/narrow moves it. */
export function senseSpread(sense: WordSense): number {
  return sense.spread ?? DEFAULT_SPREAD;
}

/**
 * This sense's EMERGENT GLOSS — the concept of the anchor nearest its current point. The point is
 * the identity (vector-native flip, Wave 1); the English label is derived, not stored, so a sense
 * that glides into a new region re-labels. At seed time (no glide) a sense sits at its meaning's
 * `lexPoint`, so the emergent gloss equals the authored meaning for all but the few concepts whose
 * baked composition or quantized anchor is nearest a different anchor.
 */
export function senseGloss(sense: WordSense): Meaning {
  return glossOf(sensePoint(sense));
}

/**
 * A sense's EFFECTIVE label under the vector-native flip — hybrid by necessity. Emergent (nearest
 * anchor) gloss fires when the sense sits at a geometrically authoritative point:
 *   - its meaning is a direct GloVe **anchor** (`hasEmbedding`) — at seed it labels back to itself
 *     99.6% of the time, the rest being genuine emergent neighbours; OR
 *   - it has been **deliberately placed** (`sense.point` set by glide/coinage).
 * Otherwise the authored key stands, because there is no single faithful anchor to derive:
 *   - **compounds / derivations** (a baked morpheme composition) have a STRUCTURAL identity that sits
 *     between their parts — their nearest anchor is a part, not the whole, so the compound key is the
 *     truer label until the word glides; and
 *   - **orphans** (content gaps like `house`/`body`/`door`, and closed-class function words like
 *     `the`/`and`) sit on a hash-fallback point whose nearest anchor is noise.
 * This is the project's settled "vector-native, can fall back" stance applied to identity. See the
 * orphan-coverage note in the flip plan.
 */
export function effectiveGloss(sense: WordSense): Meaning {
  return sense.point !== undefined || hasEmbedding(sense.meaning)
    ? senseGloss(sense)
    : sense.meaning;
}

/** Fraction of the way a glide moves toward the target: 1/GLIDE_DENOM per metaphor/metonymy. */
export const GLIDE_DENOM = 8;

/** A meaning's CURRENT point: its glided override if any, else the static default. Lang-aware. */
export function meaningPointFor(lang: Language, meaning: Meaning): Vec {
  const o = lang.meaningPoints?.[meaning];
  return o ? Int32Array.from(o) : lexPoint(meaning);
}

/** Nudge `meaning` a fixed 1/GLIDE_DENOM toward `toward`'s current point; record the override. */
export function glideMeaningPoint(lang: Language, meaning: Meaning, toward: Meaning): void {
  const from = meaningPointFor(lang, meaning);
  const target = meaningPointFor(lang, toward);
  const step = roundDivVec(subVecs(target, from), GLIDE_DENOM);
  (lang.meaningPoints ??= {})[meaning] = Array.from(sumVecs([from, step]));
}
