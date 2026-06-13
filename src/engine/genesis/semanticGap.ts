/**
 * semanticGap.ts — pure-geometry detector for salient empty regions of meaning space.
 *
 * Finds the most salient anchor concept the language has NOT yet lexicalised that sits
 * INSIDE a populated neighbourhood (so it is a genuine gap, not an isolated outlier).
 * Additive and not yet wired into the genesis loop — unit-tested in isolation only.
 */
import type { Vec } from "../semantics/vec";
import { distanceSq } from "../semantics/vec";
import { ANCHORS } from "../semantics/anchors";
import { meaningPointFor } from "../semantics/meaningPoint";
import { lexIds, idForGloss, lexHasById } from "../lexicon/access";
import { meaningForLexemeId } from "../lexicon/lexemeIdentity";
import { keylessRecords } from "../lexicon/store";
import type { Language, Meaning } from "../types";
import { composeForGap } from "../semantics/gapComposition";
import { coinKeylessLexeme, type LexemeId } from "../lexicon/lexemeIdentity";

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
  // Gather all existing word points (seeded lexemes + keyless gloss-less records).
  const existingPoints: Vec[] = [];
  for (const id of lexIds(lang)) existingPoints.push(meaningPointFor(lang, meaningForLexemeId(lang, id)!));
  for (const r of keylessRecords(lang.lexemes)) existingPoints.push(Int32Array.from(r.point));
  const n = existingPoints.length;
  if (n === 0) return null;

  const MIN_GAP_DIST_SQ = MIN_GAP_DIST * MIN_GAP_DIST;
  const NEIGHBOR_RADIUS_SQ = NEIGHBOR_RADIUS * NEIGHBOR_RADIUS;

  // Scan every anchor once, scoring against the existing points in a single pass with an
  // early break the moment a word lands within MIN_GAP_DIST (the anchor is then NOT a gap —
  // most unlexicalised anchors disqualify after only a few words, so the common case is
  // cheap and we never allocate/sort a per-word neighbour list). An anchor that qualifies
  // (support ≥ MIN_SUPPORT) is necessarily within NEIGHBOR_RADIUS of ≥ MIN_SUPPORT words, so
  // visiting all anchors yields the SAME qualifying set as a neighbourhood-union gather.
  let best: SemanticGap | null = null;
  for (const a of ANCHORS) {
    if (lexHasById(lang, idForGloss(lang, a.concept))) continue;
    let nearest = Infinity;
    let support = 0;
    let disqualified = false;
    for (let i = 0; i < n; i++) {
      const d = distanceSq(a.point, existingPoints[i]!);
      if (d < MIN_GAP_DIST_SQ) {
        disqualified = true; // too close to an existing word → not an empty region
        break;
      }
      if (d < nearest) nearest = d;
      if (d <= NEIGHBOR_RADIUS_SQ) support++;
    }
    if (disqualified || support < MIN_SUPPORT) continue;
    // Most salient gap: max support, then max distance-to-nearest, then smallest concept.
    if (
      best === null ||
      support > best.neighborSupport ||
      (support === best.neighborSupport && nearest > best.nearestExistingDistSq) ||
      (support === best.neighborSupport &&
        nearest === best.nearestExistingDistSq &&
        a.concept < best.gloss)
    ) {
      best = {
        point: a.point,
        gloss: a.concept,
        nearestExistingDistSq: nearest,
        neighborSupport: support,
      };
    }
  }
  return best;
}

/**
 * Coin a keyless lexeme into a detected semantic gap. Builds a form for the gap's concept by
 * vector-composition (kenning) from the language's related roots, then stores it POINT-NATIVELY
 * at the gap point with NO concept/gloss key (a gloss-less record in lang.lexemes). Deterministic — composeForGap
 * draws no RNG. Returns the new keyless lexeme's id, or null when no legal form can be composed
 * (the caller's coinage cascade then moves on).
 */
export function coinKeylessForGap(lang: Language, gap: SemanticGap, generation = 0): LexemeId | null {
  const composed = composeForGap(lang, gap.gloss);
  if (!composed) return null;
  return coinKeylessLexeme(lang, gap.point, composed.form, generation);
}
