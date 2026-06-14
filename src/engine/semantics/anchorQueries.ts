/**
 * anchorQueries.ts — geometric readout queries over Vec points (Vector-Native Lexicon Flip, Wave 0c).
 *
 * Two pure-geometry queries:
 *   posOfPoint    — reads the labeled POS dims [50..53] (baked in Wave 0b) and returns the
 *                   4-way POS class by argmax.
 *   clusterRegionOf — nearest semantic-cluster centroid by squared distance over lexical dims
 *                   [0..49] only, so labeled dims never perturb cluster geometry.
 *
 * Determinism invariants:
 *   - No Math.random(). Pure functions of the cluster taxonomy + baked tables.
 *   - All ranking by integer-exact arithmetic; tie-breaks by name ascending.
 *   - Centroids: sum Int32, then Math.round(sum / count). Built once at module load.
 */

import type { POS } from "../lexicon/pos";
import { LEXICAL_DIMS, type Vec } from "./vec";
import { L_POS_NOUN, L_POS_VERB, L_POS_ADJ, L_POS_CLOSED } from "./anchorLabeled";
import { CLUSTERS } from "../lexicon/basic240";
import { fromFloats } from "./vec";
import { embed } from "./embeddings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PosClass = "noun" | "verb" | "adjective" | "closed";

// ---------------------------------------------------------------------------
// collapsePos
// ---------------------------------------------------------------------------

/**
 * Collapse the full 18-way POS to the 4-way labeled class.
 * noun→"noun", verb→"verb", adjective→"adjective", everything else→"closed".
 */
export function collapsePos(pos: POS): PosClass {
  if (pos === "noun") return "noun";
  if (pos === "verb") return "verb";
  if (pos === "adjective") return "adjective";
  return "closed";
}

// ---------------------------------------------------------------------------
// posOfPoint
// ---------------------------------------------------------------------------

/** Offsets within the grammatical region for the 4-way one-hot POS dims. */
const POS_OFFSETS: readonly [number, PosClass][] = [
  [L_POS_NOUN, "noun"],
  [L_POS_VERB, "verb"],
  [L_POS_ADJ, "adjective"],
  [L_POS_CLOSED, "closed"],
];

/**
 * The POS class of a point, by argmax over its labeled POS dims [50..53].
 * Tie / all-zero (a point with no baked POS dims): defaults to "closed" deterministically.
 *
 * The one-hot bake uses VEC_SCALE (4096) for the active dim; unset dims are 0.
 * Only a strictly positive dim value is treated as a candidate — so a point with all
 * zeros (e.g. a raw lexical-only Vec with no baked POS) defaults to "closed".
 */
export function posOfPoint(point: Vec): PosClass {
  let bestVal = 0; // threshold: must be strictly positive to win
  let bestClass: PosClass = "closed"; // all-zero (or all non-positive) default
  for (const [offset, cls] of POS_OFFSETS) {
    const val = point[LEXICAL_DIMS + offset]!;
    if (val > bestVal) {
      bestVal = val;
      bestClass = cls;
    }
    // Tie-break: POS_OFFSETS order is fixed; first encountered wins (stable by position).
  }
  return bestClass;
}

// ---------------------------------------------------------------------------
// clusterRegionOf — centroids built once at module load
// ---------------------------------------------------------------------------

/** Squared distance over lexical dims [0..49] only. */
function lexicalDistSq(a: Vec, b: Int32Array): number {
  let s = 0;
  for (let i = 0; i < LEXICAL_DIMS; i++) {
    const diff = a[i]! - b[i]!;
    s += diff * diff;
  }
  return s;
}

/** Per-cluster centroid: componentwise rounded mean over lexical dims [0..49]. */
interface ClusterCentroid {
  name: string;
  point: Int32Array; // length LEXICAL_DIMS
}

function buildCentroids(): readonly ClusterCentroid[] {
  // Seed one centroid per cluster from the hand cluster TAXONOMY (basic240 CLUSTERS):
  // a small typological vocabulary of cluster names + seed members (body / kinship /
  // plants / …). Each centroid is the rounded mean of its seed members' lexical points.
  // Every concept is then assigned to its NEAREST centroid (clusterRegionOf) — geometric
  // MEMBERSHIP over a hand-defined taxonomy (true label-free clustering would need k-means).
  // Independent of CONCEPTS, so the concept façade can derive its cluster field from this
  // without a cycle.
  const centroids: ClusterCentroid[] = [];
  for (const [name, members] of Object.entries(CLUSTERS)) {
    const acc = new Array<number>(LEXICAL_DIMS).fill(0);
    let count = 0;
    for (const m of members) {
      const lexical = fromFloats(embed(m)); // full Vec; we only use [0..49]
      for (let i = 0; i < LEXICAL_DIMS; i++) acc[i]! += lexical[i]!;
      count++;
    }
    if (count === 0) continue;
    const point = new Int32Array(LEXICAL_DIMS);
    for (let i = 0; i < LEXICAL_DIMS; i++) point[i] = Math.round(acc[i]! / count);
    centroids.push({ name, point });
  }

  // Sort by name for deterministic iteration order.
  centroids.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return Object.freeze(centroids);
}

/** Frozen cluster centroid table, keyed-by-name-ascending order. Built once. */
const CLUSTER_CENTROIDS: readonly ClusterCentroid[] = buildCentroids();

/**
 * The nearest semantic-cluster region, by lexical-subspace geometry.
 * Computes argmin over per-cluster centroids of squared distance over lexical dims [0..49] only
 * (labeled dims are ignored so they don't perturb cluster geometry).
 * Tie-break by cluster name ascending.
 */
export function clusterRegionOf(point: Vec): string {
  let bestName = CLUSTER_CENTROIDS[0]!.name;
  let bestD = lexicalDistSq(point, CLUSTER_CENTROIDS[0]!.point);
  for (let i = 1; i < CLUSTER_CENTROIDS.length; i++) {
    const c = CLUSTER_CENTROIDS[i]!;
    const d = lexicalDistSq(point, c.point);
    if (d < bestD || (d === bestD && c.name < bestName)) {
      bestD = d;
      bestName = c.name;
    }
  }
  return bestName;
}

/** The set of cluster names in the taxonomy (for validation). */
export const CLUSTER_NAMES: ReadonlySet<string> = new Set(Object.keys(CLUSTERS));
