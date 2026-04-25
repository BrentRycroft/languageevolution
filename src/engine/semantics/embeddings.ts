import type { Meaning } from "../types";
import { clusterOf } from "./clusters";
import { complexityFor } from "../lexicon/complexity";
import {
  CONCEPTS,
  CONCEPT_IDS,
  colexWith,
  isRegisteredConcept,
} from "../lexicon/concepts";
import { fnv1a } from "../rng";

/**
 * Hand-engineered + programmatically-extended semantic embeddings.
 *
 * Every registered concept (700+) gets a 12-dimensional vector built
 * from three layers:
 *
 *   1. **Cluster centroid** — every cluster (body, kinship, environment,
 *      tools…) has a hand-curated centroid that sets the broad
 *      semantic neighbourhood.
 *   2. **POS / tier modifiers** — verbs lean motion-axis, adjectives
 *      lean evaluation-axis, tier-2/3 concepts lean abstract.
 *   3. **Per-concept id-hash perturbation** + **colexification
 *      refinement** — gives each concept a distinct vector while
 *      pulling colex pairs (arm/hand, see/know, sun/day) closer.
 *
 * The output is functionally what the deleted WebLLM module gave us
 * — a continuous semantic similarity space — without the 2 MB
 * runtime cost.
 *
 * Dimensions:
 *   0. animacy           (animals / kin / people = +, objects = −)
 *   1. concreteness      (physical = +, abstract = −)
 *   2. body-part-ness
 *   3. environment / nature
 *   4. motion / action
 *   5. perception / cognition
 *   6. metabolism / consumption
 *   7. size / magnitude
 *   8. evaluation        (good/bad polarity)
 *   9. temporal / rhythmic
 *  10. kinship
 *  11. numeric / quantity
 */
export const EMBEDDING_DIMS = 12;

/**
 * Hand-curated centroids per cluster. Each centroid is a "typical
 * member" vector. Per-concept perturbation moves around it.
 */
const CLUSTER_CENTROIDS: Record<string, number[]> = {
  // animacy, concrete, body, env, motion, perception, metabolism, size, eval, time, kinship, numeric
  body:        [0.3, 0.85, 1.0,  0.0,  0.1,  0.1, 0.0,  0.0,  0.0,  0.0,  0.0,  0.0],
  kinship:     [1.0, 0.85, 0.0,  0.0,  0.0,  0.0, 0.0,  0.0,  0.3,  0.1,  1.0,  0.0],
  environment: [0.0, 0.85, 0.0,  1.0,  0.1,  0.1, 0.1,  0.5,  0.0,  0.3,  0.0,  0.0],
  animals:     [1.0, 0.9,  0.0,  0.5,  0.4,  0.0, 0.1,  0.4,  0.0,  0.0,  0.1,  0.0],
  plants:      [0.2, 0.85, 0.0,  0.8,  0.0,  0.0, 0.2,  0.4,  0.1,  0.2,  0.0,  0.0],
  food:        [0.0, 0.7,  0.0,  0.2,  0.1,  0.1, 1.0,  0.2,  0.3,  0.0,  0.0,  0.0],
  clothing:    [0.0, 0.8,  0.2,  0.0,  0.1,  0.0, 0.0,  0.2,  0.1,  0.0,  0.0,  0.0],
  tools:       [0.0, 0.85, 0.0,  0.0,  0.3,  0.0, 0.0,  0.3,  0.1,  0.0,  0.0,  0.0],
  motion:      [0.0, 0.2,  0.0,  0.0,  1.0,  0.0, 0.0,  0.0,  0.0,  0.1,  0.0,  0.0],
  perception:  [0.0, 0.2,  0.0,  0.0,  0.1,  1.0, 0.0,  0.0,  0.1,  0.0,  0.0,  0.0],
  metabolism:  [0.0, 0.3,  0.1,  0.0,  0.2,  0.0, 1.0,  0.0,  0.1,  0.1,  0.0,  0.0],
  action:      [0.0, 0.3,  0.0,  0.0,  0.7,  0.1, 0.1,  0.0,  0.0,  0.0,  0.0,  0.0],
  quality:     [0.0, 0.2,  0.0,  0.0,  0.0,  0.2, 0.0,  0.4,  0.4,  0.1,  0.0,  0.1],
  pronoun:     [0.5, 0.2,  0.0,  0.0,  0.0,  0.3, 0.0,  0.0,  0.0,  0.0,  0.4,  0.2],
  numbers:     [0.0, 0.0,  0.0,  0.0,  0.0,  0.1, 0.0,  0.2,  0.0,  0.0,  0.0,  1.0],
  spatial:     [0.0, 0.3,  0.0,  0.2,  0.2,  0.2, 0.0,  0.3,  0.0,  0.0,  0.0,  0.0],
  time:        [0.0, 0.1,  0.0,  0.2,  0.0,  0.1, 0.0,  0.0,  0.0,  1.0,  0.0,  0.0],
  abstract:    [0.0, -0.2, 0.0,  0.0,  0.0,  0.4, 0.0,  0.0,  0.2,  0.1,  0.1,  0.0],
};

/**
 * Hand-curated overrides: anchor concepts that should sit at very
 * specific positions (e.g. "water" anchors the environment cluster
 * along the metabolism axis because of the colex pair water/drink).
 * These nudge the cluster centroid in directions a uniform centroid
 * couldn't capture.
 */
const ANCHOR_OVERRIDES: Record<Meaning, number[]> = {
  water:  [0.0, 0.9, 0.0, 1.0, 0.2, 0.0, 0.4, 0.4, 0.0, 0.0, 0.0, 0.0],
  fire:   [0.0, 0.9, 0.0, 1.0, 0.3, 0.0, 0.2, 0.3, 0.1, 0.0, 0.0, 0.0],
  sun:    [0.0, 0.9, 0.0, 1.0, 0.0, 0.1, 0.0, 0.7, 0.3, 0.7, 0.0, 0.0],
  moon:   [0.0, 0.9, 0.0, 1.0, 0.0, 0.1, 0.0, 0.5, 0.1, 0.8, 0.0, 0.0],
  day:    [0.0, 0.4, 0.0, 0.4, 0.0, 0.1, 0.0, 0.0, 0.2, 1.0, 0.0, 0.0],
  night:  [0.0, 0.4, 0.0, 0.5, 0.0, 0.1, 0.0, 0.0, -0.2, 1.0, 0.0, 0.0],
  go:     [0.0, 0.2, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0],
  see:    [0.0, 0.3, 0.0, 0.0, 0.2, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  know:   [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.2, 0.0, 0.0, 0.0],
  eat:    [0.0, 0.2, 0.0, 0.0, 0.3, 0.0, 1.0, 0.0, 0.1, 0.0, 0.0, 0.0],
  drink:  [0.0, 0.3, 0.0, 0.2, 0.3, 0.0, 1.0, 0.0, 0.1, 0.0, 0.0, 0.0],
  sleep:  [0.0, 0.1, 0.0, 0.0, 0.1, 0.0, 0.5, 0.0, 0.1, 0.8, 0.0, 0.0],
  die:    [0.0, 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.5, 0.3, 0.0, 0.0],
  big:    [0.0, 0.2, 0.0, 0.0, 0.0, 0.1, 0.0, 1.0, 0.1, 0.0, 0.0, 0.2],
  small:  [0.0, 0.2, 0.0, 0.0, 0.0, 0.1, 0.0, -0.8, -0.1, 0.0, 0.0, 0.2],
  good:   [0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
  bad:    [0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0],
  hand:   [0.4, 0.9, 1.0, 0.0, 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  arm:    [0.4, 0.9, 1.0, 0.0, 0.2, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0],
  foot:   [0.4, 0.9, 1.0, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  leg:    [0.4, 0.9, 1.0, 0.0, 0.3, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0],
  mother: [1.0, 0.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.4, 0.0, 1.0, 0.0],
  father: [1.0, 0.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 0.0, 1.0, 0.0],
};

function zero(): number[] {
  return new Array(EMBEDDING_DIMS).fill(0);
}

function add(a: number[], b: number[], scale = 1): number[] {
  const out = zero();
  for (let i = 0; i < EMBEDDING_DIMS; i++) out[i] = a[i]! + b[i]! * scale;
  return out;
}

function avg(a: number[], b: number[]): number[] {
  const out = zero();
  for (let i = 0; i < EMBEDDING_DIMS; i++) out[i] = (a[i]! + b[i]!) / 2;
  return out;
}

function jitter(id: Meaning, magnitude: number): number[] {
  // Deterministic per-id perturbation: take FNV hash, expand to 12
  // pseudo-random floats in [-magnitude, +magnitude].
  const out = zero();
  let seed = fnv1a(id);
  for (let i = 0; i < EMBEDDING_DIMS; i++) {
    // xorshift32 step
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    out[i] = ((seed / 0xffffffff) * 2 - 1) * magnitude;
  }
  return out;
}

function applyPosTierModifiers(
  v: number[],
  pos: string,
  tier: number,
): number[] {
  const out = v.slice();
  // Verbs lean motion + perception.
  if (pos === "verb") {
    out[4] += 0.3;
    out[1] -= 0.2;
  }
  // Adjectives lean evaluation + size.
  if (pos === "adjective") {
    out[8] += 0.2;
    out[7] += 0.15;
    out[1] -= 0.15;
  }
  // Numerals lean numeric.
  if (pos === "numeral") {
    out[11] = 1;
    out[1] -= 0.5;
  }
  // Higher-tier concepts lean abstract (concreteness down).
  out[1] -= tier * 0.08;
  return out;
}

/**
 * One pass of colex-pair refinement. For every cross-linguistic
 * colexification pair (arm/hand, see/know, sun/day), nudge the
 * two vectors slightly closer — the average gets weighted in at
 * 30%. This pulls colex pairs together without collapsing the
 * cluster structure.
 */
function refineByColex(table: Record<Meaning, number[]>): void {
  const seen = new Set<string>();
  for (const id of CONCEPT_IDS) {
    for (const partner of colexWith(id)) {
      const k = id < partner ? `${id}|${partner}` : `${partner}|${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const a = table[id];
      const b = table[partner];
      if (!a || !b) continue;
      const m = avg(a, b);
      table[id] = add(a, m, 0.3);
      // Re-normalise the trailing influence so we don't double-count.
      // (Each concept can be in multiple colex pairs; cumulative effect
      // is intentional but capped via the 0.3 weight.)
      table[partner] = add(b, m, 0.3);
    }
  }
}

function buildBase(): Record<Meaning, number[]> {
  const out: Record<Meaning, number[]> = {};
  for (const id of CONCEPT_IDS) {
    if (ANCHOR_OVERRIDES[id]) {
      out[id] = ANCHOR_OVERRIDES[id]!.slice();
      continue;
    }
    const meta = CONCEPTS[id]!;
    const centroid = CLUSTER_CENTROIDS[meta.cluster] ?? zero();
    let v = centroid.slice();
    v = applyPosTierModifiers(v, meta.pos, meta.tier);
    v = add(v, jitter(id, 0.12));
    out[id] = v;
  }
  refineByColex(out);
  return out;
}

const BASE: Record<Meaning, number[]> = buildBase();

/**
 * Build an embedding for a meaning. Registered concepts come from
 * the precomputed BASE table. Compounds / derivations average their
 * components; affixed forms inherit from their stem with a
 * derivation kick. Unknown bare meanings get a cluster-or-zero
 * fallback.
 */
export function embed(meaning: Meaning): number[] {
  if (BASE[meaning]) return BASE[meaning]!.slice();
  if (meaning.includes("-")) {
    const parts = meaning.split("-");
    let v = zero();
    let n = 0;
    for (const p of parts) {
      if (BASE[p]) {
        v = add(v, BASE[p]!);
        n++;
      }
    }
    if (n > 0) {
      for (let i = 0; i < EMBEDDING_DIMS; i++) v[i] = v[i]! / n;
      return v;
    }
  }
  // Affixed (e.g., "water-er") — stem with derivation kick.
  const stripped = meaning.replace(/-(er|ness|ic|al|ine|intens)$/, "");
  if (stripped !== meaning && BASE[stripped]) {
    const v = BASE[stripped]!.slice();
    v[1] -= 0.2;
    return v;
  }
  // Last fallback: cluster-only with complexity bump.
  const v = zero();
  const cluster = clusterOf(meaning);
  if (cluster && CLUSTER_CENTROIDS[cluster]) {
    return add(CLUSTER_CENTROIDS[cluster]!, jitter(meaning, 0.1));
  }
  v[1] -= 0.1 * complexityFor(meaning);
  return v;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < EMBEDDING_DIMS; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Find semantic neighbors for a meaning by cosine similarity over
 * the embedding space. Filters to candidates available in
 * `candidates` and returns the top-k by similarity (descending).
 */
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

/** Re-export convenience predicate so callers don't have to chase imports. */
export { isRegisteredConcept };
