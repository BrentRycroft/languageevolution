/**
 * anchors.ts — the fixed English-concept coordinate system (Vector-Native Lexicon Flip, Wave 0a).
 *
 * The English concepts in the `CONCEPTS` registry are the *anchor* points the translator reads a
 * preset's words against — a fixed coordinate frame that belongs to no preset and never evolves.
 * Each anchor sits at its concept's quantized GloVe position (`fromFloats(embed(concept))` — i.e.
 * the `EMBED_TABLE` vector, or the deterministic hash fallback for the ~3 concepts with no GloVe
 * token). A drifting/coined lexeme's *emergent gloss* is the concept of its `nearestAnchor`.
 *
 * Wave 0a is purely additive: the anchor table + nearest-anchor geometry, no engine wiring and no
 * determinism re-baseline. The interpretable LABELED dims (POS/tier/valence/…) are baked onto these
 * points in Wave 0b/0c; here the points carry only the lexical (GloVe-50) dims.
 *
 * Determinism: anchors are built in sorted `CONCEPT_IDS` order; every query ranks by integer-exact
 * `distanceSq` with a concept-id tie-break, so results are byte-identical across platforms.
 */
import type { Meaning } from "../types";
import { type Vec, distanceSq, fromFloats } from "./vec";
import { embed } from "./embeddings";
import { CONCEPT_IDS } from "../lexicon/conceptRegistry";

export interface Anchor {
  /** The English concept this anchor labels — the emergent gloss a lexeme adopts when nearest it. */
  concept: Meaning;
  /** The concept's fixed position (lexical dims = quantized GloVe; labeled dims baked in Wave 0b). */
  point: Vec;
}

/**
 * The anchor table: the curated `CONCEPT_IDS` (sorted) plus the anchor-coverage EXTRAS — basic
 * content words the registry never covered (house/body/door/…), given real GloVe points so the
 * translator's coordinate frame spans the vocabulary the presets actually use. Deterministic order
 * (CONCEPT_IDS already sorted; extras sorted), and every query ranks by integer-exact distance with
 * an id tie-break, so anchor-set order never affects results.
 */
// CONCEPT_IDS (geometry-native, G1) already unions the anchor-coverage EXTRAS, so the
// anchor frame is exactly the derived concept vocabulary (sorted, deduplicated).
const ANCHOR_CONCEPTS: readonly Meaning[] = CONCEPT_IDS;
export const ANCHORS: readonly Anchor[] = ANCHOR_CONCEPTS.map((concept) => ({
  concept,
  point: fromFloats(embed(concept)),
}));

/**
 * The EMERGENT GLOSS of a point: the concept of its nearest anchor. A lexeme's English label is not
 * stored — it is read off the coordinate frame here, so a word that drifts into a new region
 * re-labels automatically (D-gloss). This is a pure read-time function; it draws no RNG and is never
 * stored as state (determinism footgun §5).
 */
export function glossOf(point: Vec): Meaning {
  return nearestAnchor(point).concept;
}

/** The single anchor whose point is closest to `point` (integer-exact, id tie-break). */
export function nearestAnchor(point: Vec): Anchor {
  let best = ANCHORS[0]!;
  let bestD = distanceSq(point, best.point);
  for (let i = 1; i < ANCHORS.length; i++) {
    const a = ANCHORS[i]!;
    const d = distanceSq(point, a.point);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/**
 * Every anchor within fixed-point radius `r` of `point` (i.e. `distanceSq ≤ r²`), nearest-first.
 * `r` is a radius in vector-component units (the same fixed-point scale as the points themselves).
 */
export function anchorsWithin(point: Vec, r: number): Anchor[] {
  const r2 = r * r;
  const hits = ANCHORS.map((a) => ({ a, d: distanceSq(point, a.point) })).filter((x) => x.d <= r2);
  hits.sort((x, y) => x.d - y.d || (x.a.concept < y.a.concept ? -1 : x.a.concept > y.a.concept ? 1 : 0));
  return hits.map((x) => x.a);
}

/** The `k` anchors nearest `point`, nearest-first (integer-exact distance, id tie-break). */
export function kNearestAnchors(point: Vec, k: number): Anchor[] {
  const scored = ANCHORS.map((a) => ({ a, d: distanceSq(point, a.point) }));
  scored.sort((x, y) => x.d - y.d || (x.a.concept < y.a.concept ? -1 : x.a.concept > y.a.concept ? 1 : 0));
  return scored.slice(0, k).map((x) => x.a);
}
