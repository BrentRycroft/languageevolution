/**
 * anchorLabeled.ts — the 8 interpretable "labeled" feature dims baked onto each anchor
 * point (Vector-Native Lexicon Flip, Wave 0b).
 *
 * The grammatical region of every Vec ([50..57]) is reserved for Track E. Wave 0b fills
 * all 8 of those dims with curated, concept-level features: POS one-hot (4 dims), tier,
 * valence, taboo flag, and basic/core flag.  These are purely additive — Wave 0c will
 * wire them into the engine.
 *
 * Dim layout (offsets within the grammatical region; absolute index = LEXICAL_DIMS + offset):
 *   0  L_POS_NOUN   — noun one-hot
 *   1  L_POS_VERB   — verb one-hot
 *   2  L_POS_ADJ    — adjective one-hot
 *   3  L_POS_CLOSED — closed-class / everything-else one-hot
 *   4  L_TIER       — ordinal 0..3, stored * VEC_SCALE
 *   5  L_VALENCE    — valence projection, quantized to round(score * VEC_SCALE)
 *   6  L_TABOO      — dangerous-referent flag (VEC_SCALE or 0)
 *   7  L_BASIC      — basic/core flag (VEC_SCALE or 0)
 *
 * Determinism: every value is a pure function of the curated tables — no RNG, no
 * per-language state. Float math is used only for the valence projection (which is
 * already relied upon as deterministic by the rest of the engine); the result is
 * quantized with Math.round before storage.
 */

import type { Meaning } from "../types";
import { GRAMMATICAL_DIMS, LEXICAL_DIMS, VEC_SCALE, type Vec, fromFloats } from "./vec";
import { embed } from "./embeddings";
import { CONCEPTS } from "../lexicon/concepts";
import { BASIC_240 } from "../lexicon/basic240";
import { isTabooReferent } from "../lexicon/taboo";
import { projectOnAxis } from "./readoutAxes";

// ---------------------------------------------------------------------------
// Offset constants within the 8-dim grammatical region
// ---------------------------------------------------------------------------

/** Noun one-hot dim (offset within the grammatical region). */
export const L_POS_NOUN = 0;
/** Verb one-hot dim. */
export const L_POS_VERB = 1;
/** Adjective one-hot dim. */
export const L_POS_ADJ = 2;
/** Closed-class / everything-else one-hot dim. */
export const L_POS_CLOSED = 3;
/** Tier dim — value is `tier * VEC_SCALE` (recoverable by `/ VEC_SCALE`). */
export const L_TIER = 4;
/** Valence dim — `Math.round(projectOnAxis(c, "valence") * VEC_SCALE)`. */
export const L_VALENCE = 5;
/** Taboo-referent flag dim — `VEC_SCALE` if dangerous referent, else `0`. */
export const L_TABOO = 6;
/** Basic/core flag dim — `VEC_SCALE` if in BASIC_240 or frequencyClass==="basic", else `0`. */
export const L_BASIC = 7;

/** The labeled block fills the entire grammatical/reserved region (= GRAMMATICAL_DIMS = 8). */
export const LABELED_DIMS = GRAMMATICAL_DIMS;

// ---------------------------------------------------------------------------
// Module-level helpers (computed once)
// ---------------------------------------------------------------------------

/** O(1) BASIC_240 membership check. */
const BASIC_SET: ReadonlySet<Meaning> = new Set(BASIC_240);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns an `Int32Array` of length `GRAMMATICAL_DIMS` (8) with the labeled
 * feature values for `concept` — these are the values that fill dims [50..57]
 * of a full Vec.
 *
 * Results are computed freshly each call (cheap — 2247 concepts, simple lookups).
 * Call sites that need many can cache using the exported `labeledDimsFor`.
 */
export function labeledDimsFor(concept: Meaning): Int32Array {
  const out = new Int32Array(GRAMMATICAL_DIMS);
  const c = CONCEPTS[concept];
  if (!c) return out; // unknown concept → all zeros

  // POS one-hot (dims 0..3)
  const pos = c.pos;
  if (pos === "noun") {
    out[L_POS_NOUN] = VEC_SCALE;
  } else if (pos === "verb") {
    out[L_POS_VERB] = VEC_SCALE;
  } else if (pos === "adjective") {
    out[L_POS_ADJ] = VEC_SCALE;
  } else {
    out[L_POS_CLOSED] = VEC_SCALE;
  }

  // Tier (dim 4)
  out[L_TIER] = c.tier * VEC_SCALE;

  // Valence (dim 5)
  out[L_VALENCE] = Math.round(projectOnAxis(concept, "valence") * VEC_SCALE);

  // Taboo flag (dim 6)
  out[L_TABOO] = isTabooReferent(concept) ? VEC_SCALE : 0;

  // Basic flag (dim 7)
  out[L_BASIC] = BASIC_SET.has(concept) || c.frequencyClass === "basic" ? VEC_SCALE : 0;

  return out;
}

/**
 * Returns a full Vec (Int32Array of length 58): dims [0..49] hold the concept's
 * quantized GloVe embedding; dims [50..57] hold the labeled feature values from
 * `labeledDimsFor(concept)`.
 */
export function anchorPointFull(concept: Meaning): Vec {
  const v = fromFloats(embed(concept)); // fills [0..49]; [50..57] = 0
  const labeled = labeledDimsFor(concept);
  for (let i = 0; i < GRAMMATICAL_DIMS; i++) {
    v[LEXICAL_DIMS + i] = labeled[i]!;
  }
  return v;
}
