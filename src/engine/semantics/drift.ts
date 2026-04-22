import type { Language } from "../types";
import type { Rng } from "../rng";
import { neighborsOf } from "./neighbors";
import { relatedMeanings, clusterOf } from "./clusters";
import { nearestMeanings } from "./embeddings";
import { complexityFor } from "../lexicon/complexity";

export type SemanticShiftKind =
  | "metonymy"
  | "metaphor"
  | "narrowing"
  | "broadening";

export interface SemanticDrift {
  from: string;
  to: string;
  kind: SemanticShiftKind;
}

/**
 * Classify a drift event using a small heuristic so events are richer than
 * "A → B". Same-cluster = metonymy (contiguity); cross-cluster = metaphor
 * (conceptual jump); complexity delta picks narrowing vs broadening when
 * the link is ambiguous.
 */
export function classifyShift(from: string, to: string): SemanticShiftKind {
  const cFrom = clusterOf(from);
  const cTo = clusterOf(to);
  if (cFrom && cTo && cFrom === cTo) return "metonymy";
  const complexityDelta = complexityFor(to) - complexityFor(from);
  if (complexityDelta < 0) return "narrowing";
  if (complexityDelta > 0) return "broadening";
  return "metaphor";
}

export type NeighborOverride = Record<string, string[]>;

/**
 * Attempt one semantic drift event on the language's lexicon.
 * Picks a meaning with semantic neighbors and reassigns its current form to
 * a neighbor meaning. The old meaning is removed (the word "shifted").
 * Returns null if no applicable meaning was found.
 *
 * If `override` is provided (e.g. an LLM-populated neighbor map), it is
 * consulted before the built-in static table.
 */
export function driftOneMeaning(
  lang: Language,
  rng: Rng,
  override?: NeighborOverride,
): SemanticDrift | null {
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length === 0) return null;
  const shuffled: string[] = [];
  const used = new Set<number>();
  while (shuffled.length < meanings.length) {
    const idx = rng.int(meanings.length);
    if (used.has(idx)) continue;
    used.add(idx);
    shuffled.push(meanings[idx]!);
  }
  // Two passes: first try to drift into an EMPTY slot (the clean case),
  // then allow crowded drift where the target already has a form (the
  // new form replaces the old one — a realistic "meaning-takeover").
  // Dense lexicons (like the Basic-240 expansion) rarely have empty
  // slots, so without pass 2 drift would almost never fire.
  for (const strict of [true, false]) {
    for (const m of shuffled) {
      const overrideNeighbors = override?.[m];
      // Preference order:
      //   1. Explicit override (AI-generated LLM neighbors if enabled).
      //   2. Embedding-space nearest meanings (cosine similarity).
      //   3. Hand-curated semantic cluster (relatedMeanings()).
      //   4. Static neighbor table (neighborsOf()).
      const embeddingNearest = nearestMeanings(m, meanings, 5);
      const related = relatedMeanings(m);
      const neighbors =
        overrideNeighbors && overrideNeighbors.length > 0
          ? overrideNeighbors
          : embeddingNearest.length > 0
            ? embeddingNearest
            : related.length > 0
              ? related
              : neighborsOf(m);
      if (neighbors.length === 0) continue;
      const target = neighbors[rng.int(neighbors.length)]!;
      if (target === m) continue;
      const targetOccupied = !!lang.lexicon[target];
      if (strict && targetOccupied) continue;
      const form = lang.lexicon[m]!;
      lang.lexicon[target] = form;
      delete lang.lexicon[m];
      return { from: m, to: target, kind: classifyShift(m, target) };
    }
  }
  return null;
}
