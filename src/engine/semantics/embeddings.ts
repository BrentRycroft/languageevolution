import type { Meaning } from "../types";
import { clusterOf } from "./clusters";
import { complexityFor } from "../lexicon/complexity";

/**
 * Lightweight hand-engineered semantic embeddings for the Swadesh-ish
 * meaning space. Each meaning is a 12-dimensional feature vector with
 * linguistically-motivated components. Similarity = cosine.
 *
 * Dimensions:
 *   0. animacy  (animals / kin / people = +, objects = −)
 *   1. concreteness (physical = +, abstract = −)
 *   2. body-part-ness
 *   3. environment / nature
 *   4. motion / action
 *   5. perception / cognition
 *   6. metabolism / consumption
 *   7. size / magnitude
 *   8. evaluation (good/bad polarity)
 *   9. temporal / rhythmic (day/night/sleep/die)
 *  10. kinship
 *  11. numeric / quantity
 */
export const EMBEDDING_DIMS = 12;

const BASE: Record<Meaning, number[]> = {
  // Body parts — high body, high concrete, mid animacy.
  hand: [0.4, 0.9, 1, 0, 0.2, 0, 0, 0, 0, 0, 0, 0],
  foot: [0.4, 0.9, 1, 0, 0.3, 0, 0, 0, 0, 0, 0, 0],
  heart: [0.3, 0.85, 1, 0, 0, 0.1, 0, 0, 0.2, 0, 0, 0],
  head: [0.4, 0.9, 1, 0, 0, 0.2, 0, 0.2, 0, 0, 0, 0],
  eye: [0.3, 0.85, 1, 0, 0, 0.8, 0, 0, 0, 0, 0, 0],
  ear: [0.3, 0.85, 1, 0, 0, 0.7, 0, 0, 0, 0, 0, 0],
  mouth: [0.3, 0.85, 1, 0, 0.1, 0.1, 0.3, 0, 0, 0, 0, 0],
  tooth: [0.3, 0.85, 1, 0, 0, 0, 0.2, 0, 0, 0, 0, 0],
  bone: [0.1, 0.9, 0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  blood: [0.3, 0.85, 0.9, 0, 0, 0, 0.2, 0, 0.1, 0, 0, 0],
  hair: [0.2, 0.8, 0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // Kinship — high kin, mid animacy, some evaluation.
  mother: [1, 0.9, 0, 0, 0, 0, 0, 0, 0.4, 0, 1, 0],
  father: [1, 0.9, 0, 0, 0, 0, 0, 0, 0.3, 0, 1, 0],
  // Environment.
  water: [0, 0.9, 0, 1, 0.2, 0, 0.3, 0.4, 0, 0, 0, 0],
  fire: [0, 0.9, 0, 1, 0.3, 0, 0.2, 0.3, 0.1, 0, 0, 0],
  stone: [-0.1, 1, 0, 1, 0, 0, 0, 0.6, 0, 0, 0, 0],
  tree: [0, 0.9, 0, 1, 0, 0, 0, 0.5, 0.2, 0, 0, 0],
  sun: [0, 0.9, 0, 1, 0, 0.1, 0, 0.7, 0.3, 0.7, 0, 0],
  moon: [0, 0.9, 0, 1, 0, 0.1, 0, 0.5, 0.1, 0.8, 0, 0],
  star: [0, 0.8, 0, 1, 0, 0.1, 0, 0.2, 0, 0.6, 0, 0],
  night: [0, 0.4, 0, 0.5, 0, 0.1, 0, 0, -0.2, 1, 0, 0],
  // Animals.
  dog: [1, 0.9, 0, 0.6, 0.3, 0, 0, 0.3, 0.3, 0, 0.1, 0],
  wolf: [1, 0.9, 0, 0.7, 0.4, 0, 0.2, 0.5, -0.2, 0, 0, 0],
  horse: [1, 0.9, 0, 0.5, 0.5, 0, 0, 0.7, 0.2, 0, 0, 0],
  cow: [1, 0.9, 0, 0.5, 0.1, 0, 0.1, 0.7, 0.3, 0, 0, 0],
  fish: [1, 0.9, 0, 0.7, 0.2, 0, 0.3, 0.3, 0, 0, 0, 0],
  bird: [1, 0.9, 0, 0.7, 0.6, 0, 0, 0.2, 0.3, 0, 0, 0],
  snake: [1, 0.9, 0, 0.6, 0.3, 0, 0.2, 0.2, -0.3, 0, 0, 0],
  // Motion / action.
  go: [0, 0.2, 0, 0, 1, 0, 0, 0, 0, 0.1, 0, 0],
  come: [0, 0.2, 0, 0, 1, 0, 0, 0, 0, 0.1, 0, 0],
  // Perception / cognition.
  see: [0, 0.3, 0, 0, 0.2, 1, 0, 0, 0, 0, 0, 0],
  know: [0, 0, 0, 0, 0, 1, 0, 0, 0.2, 0, 0, 0],
  // Metabolism.
  eat: [0, 0.2, 0, 0, 0.3, 0, 1, 0, 0.1, 0, 0, 0],
  drink: [0, 0.3, 0, 0.2, 0.3, 0, 1, 0, 0.1, 0, 0, 0],
  sleep: [0, 0.1, 0, 0, 0.1, 0, 0.5, 0, 0.1, 0.8, 0, 0],
  die: [0, 0.2, 0, 0, 0, 0, 0, 0, -0.5, 0.3, 0, 0],
  // Numbers / quantity.
  one: [0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0, 1],
  two: [0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0, 1],
  three: [0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0, 1],
  // Evaluation.
  big: [0, 0.2, 0, 0, 0, 0.1, 0, 1, 0.1, 0, 0, 0.2],
  small: [0, 0.2, 0, 0, 0, 0.1, 0, -0.8, -0.1, 0, 0, 0.2],
  new: [0, 0.1, 0, 0, 0, 0.1, 0, 0, 0.3, 0.2, 0, 0],
  old: [0, 0.1, 0, 0, 0, 0.1, 0, 0, -0.1, 0.3, 0, 0],
  good: [0, 0, 0, 0, 0, 0.1, 0, 0, 1, 0, 0, 0],
  bad: [0, 0, 0, 0, 0, 0.1, 0, 0, -1, 0, 0, 0],
};

function zero(): number[] {
  return new Array(EMBEDDING_DIMS).fill(0);
}

function add(a: number[], b: number[], scale = 1): number[] {
  const out = zero();
  for (let i = 0; i < EMBEDDING_DIMS; i++) out[i] = a[i]! + b[i]! * scale;
  return out;
}

/**
 * Build an embedding for a meaning. Seed entries use the hand-crafted table.
 * Compounds / derivations average their components' vectors, with the cluster
 * bias nudging toward the host cluster. Unknown bare meanings get a zero
 * vector with a small complexity kick.
 */
export function embed(meaning: Meaning): number[] {
  const direct = BASE[meaning];
  if (direct) return direct.slice();
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
  // Affixed (e.g., "water-er") — base meaning with a derivation kick.
  const stripped = meaning.replace(/-(er|ness|ic|al|ine|intens)$/, "");
  if (stripped !== meaning && BASE[stripped]) {
    const v = BASE[stripped]!.slice();
    // "-er" and "-ness" nudge toward abstraction.
    v[1] -= 0.2;
    return v;
  }
  // Fallback: cluster-only vector with complexity bump.
  const v = zero();
  const cluster = clusterOf(meaning);
  if (cluster) {
    const CLUSTER_DIMS: Record<string, number> = {
      body: 2,
      kinship: 10,
      environment: 3,
      animals: 0,
      motion: 4,
      perception: 5,
      metabolism: 6,
      numbers: 11,
      evaluation: 8,
    };
    const idx = CLUSTER_DIMS[cluster];
    if (idx !== undefined) v[idx] = 0.8;
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
 * Find semantic neighbors for a meaning by cosine similarity over the
 * hand-engineered vector space. Filters to candidates available in
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
