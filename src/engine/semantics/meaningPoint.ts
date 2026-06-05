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
import { embed } from "./embeddings";
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
