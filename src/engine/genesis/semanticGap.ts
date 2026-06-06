/**
 * semanticGap.ts — pure-geometry detector for salient empty regions of meaning space.
 *
 * Finds the most salient anchor concept the language has NOT yet lexicalised that sits
 * INSIDE a populated neighbourhood (so it is a genuine gap, not an isolated outlier).
 * Additive and not yet wired into the genesis loop — unit-tested in isolation only.
 */
import type { Vec } from "../semantics/vec";
import { distanceSq } from "../semantics/vec";
import { anchorsWithin } from "../semantics/anchors";
import { meaningPointFor } from "../semantics/meaningPoint";
import { lexKeys, lexHas } from "../lexicon/access";
import type { Language, Meaning } from "../types";

// --- Tunable constants (not yet consumed by the genesis loop) ---
/** Radius (fixed-point units) that defines a concept's neighbourhood. */
const NEIGHBOR_RADIUS = 200_000; // tunable — probe measured typical cluster radii at ~120k-200k
/** A candidate gap must be at least this far from every existing word. */
const MIN_GAP_DIST = 100_000; // tunable — below typical within-cluster NN distance (~120k)
/** A candidate gap needs at least this many existing words in its neighbourhood. */
const MIN_SUPPORT = 3; // tunable — typical rich cluster has 6-9 members; 3 is a low floor

export interface SemanticGap {
  /** The empty anchor's position — a keyless lexeme can be coined here. */
  point: Vec;
  /** That anchor's concept (the gap's emergent label). Diagnostic only. */
  gloss: Meaning;
  /** Squared distance to the language's nearest existing word (bigger = emptier). */
  nearestExistingDistSq: number;
  /** How many of the language's existing words lie inside the gap's neighbourhood. */
  neighborSupport: number;
}

/**
 * Finds the most salient empty region of the meaning space for `lang`, or `null` if none
 * qualifies. "Salient" = an unlexicalised anchor A that is:
 *   1. Not yet lexicalised by the language,
 *   2. At least MIN_GAP_DIST from every existing word (the region is genuinely empty),
 *   3. Has at least MIN_SUPPORT existing words within NEIGHBOR_RADIUS (the region is populated).
 * Among qualifiers, picks max neighborSupport, then max nearestExistingDistSq, then smallest
 * concept string (deterministic).
 */
export function findSemanticGap(lang: Language): SemanticGap | null {
  // Step 1: gather all existing word points (keyed lexemes + keyless lexemes)
  const existingPoints: Vec[] = [];
  for (const m of lexKeys(lang)) {
    existingPoints.push(meaningPointFor(lang, m));
  }
  if (lang.keylessLexemes) {
    for (const entry of Object.values(lang.keylessLexemes)) {
      existingPoints.push(Int32Array.from(entry.point));
    }
  }
  if (existingPoints.length === 0) return null;

  // Step 2: gather candidate anchors — union of anchorsWithin each existing point,
  // deduped by concept, skipping already-lexicalised meanings. This restricts candidates
  // to the populated region (far cheaper than scanning all ~2400 ANCHORS).
  const MIN_GAP_DIST_SQ = MIN_GAP_DIST * MIN_GAP_DIST;
  const NEIGHBOR_RADIUS_SQ = NEIGHBOR_RADIUS * NEIGHBOR_RADIUS;

  const seen = new Set<Meaning>();
  const candidates: Array<{
    concept: Meaning;
    point: Vec;
    nearestExistingDistSq: number;
    neighborSupport: number;
  }> = [];

  for (const p of existingPoints) {
    for (const anchor of anchorsWithin(p, NEIGHBOR_RADIUS)) {
      if (seen.has(anchor.concept)) continue;
      seen.add(anchor.concept);
      if (lexHas(lang, anchor.concept)) continue;

      // Step 3: score the candidate
      let nearestDistSq = Infinity;
      let support = 0;
      for (const ep of existingPoints) {
        const d = distanceSq(anchor.point, ep);
        if (d < nearestDistSq) nearestDistSq = d;
        if (d <= NEIGHBOR_RADIUS_SQ) support++;
      }

      if (nearestDistSq < MIN_GAP_DIST_SQ) continue; // too close to an existing word
      if (support < MIN_SUPPORT) continue;            // neighbourhood not populated enough

      candidates.push({
        concept: anchor.concept,
        point: anchor.point,
        nearestExistingDistSq: nearestDistSq,
        neighborSupport: support,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Step 4: pick best: max neighborSupport, then max nearestExistingDistSq, then smallest concept
  candidates.sort((a, b) => {
    if (b.neighborSupport !== a.neighborSupport) return b.neighborSupport - a.neighborSupport;
    if (b.nearestExistingDistSq !== a.nearestExistingDistSq)
      return b.nearestExistingDistSq - a.nearestExistingDistSq;
    return a.concept < b.concept ? -1 : a.concept > b.concept ? 1 : 0;
  });

  const best = candidates[0]!;
  return {
    point: best.point,
    gloss: best.concept,
    nearestExistingDistSq: best.nearestExistingDistSq,
    neighborSupport: best.neighborSupport,
  };
}
