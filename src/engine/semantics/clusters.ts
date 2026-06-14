import type { Meaning } from "../types";
import { neighborsOf } from "./neighbors";
import { CLUSTERS as BASIC_CLUSTERS } from "../lexicon/basic240";
import { CONCEPT_IDS } from "../lexicon/conceptRegistry";
import { clusterRegionOf } from "./anchorQueries";
import { hasEmbedding } from "./embeddings";
import { lexPoint } from "./meaningPoint";

/**
 * clusters.ts
 *
 * Semantic drift, recarving (split / merge), bleaching, colexification, neighbour relations. Key exports: SEMANTIC_CLUSTERS, clusterOf, relatedMeanings.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function buildClusters(): Readonly<Record<string, readonly Meaning[]>> {
  const out: Record<string, Meaning[]> = {};
  const seen: Record<string, Set<Meaning>> = {};
  for (const [name, members] of Object.entries(BASIC_CLUSTERS)) {
    out[name] = [...members];
    seen[name] = new Set(members);
  }
  for (const id of CONCEPT_IDS) {
    const c = clusterRegionOf(lexPoint(id)); // geometric membership (all CONCEPT_IDS are embedded)
    if (!out[c]) {
      out[c] = [];
      seen[c] = new Set();
    }
    if (!seen[c]!.has(id)) {
      out[c]!.push(id);
      seen[c]!.add(id);
    }
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(out).map(([k, v]) => [k, Object.freeze(v)]),
    ),
  );
}

let _semanticClusters: Readonly<Record<string, readonly Meaning[]>> | null = null;
/**
 * The geometry-native cluster → members grouping. LAZY: the per-concept membership is read
 * off `clusterRegionOf`, which lives in the anchor-frame import cycle
 * (anchorQueries → anchorLabeled → taboo → clusters → anchorQueries); building eagerly at
 * module load would fire that geometric lookup before the centroids exist. First access
 * (always after module init) builds and memoizes it.
 */
export function semanticClusters(): Readonly<Record<string, readonly Meaning[]>> {
  return (_semanticClusters ??= buildClusters());
}

let _meaningToCluster: Record<Meaning, string> | null = null;
function meaningToCluster(): Record<Meaning, string> {
  if (_meaningToCluster) return _meaningToCluster;
  const out: Record<Meaning, string> = {};
  for (const [name, members] of Object.entries(semanticClusters())) {
    for (const m of members) out[m] = name;
  }
  return (_meaningToCluster = out);
}

/**
 * The semantic cluster (field) of a meaning — VECTOR-NATIVE (flip Wave 2a, full switch). For a
 * grounded meaning (`hasEmbedding`: a GloVe anchor or anchor-coverage extra) the field is read off the
 * geometry — the nearest cluster centroid (`clusterRegionOf`) — so the typological field is the
 * region the word actually occupies rather than a hand-curated assignment. Ungrounded meanings fall
 * back to the curated `MEANING_TO_CLUSTER` table (which also remains the reversible canonical source
 * for `SEMANTIC_CLUSTERS`). User-authorized full switch: the geometry disagrees with the curated table
 * (~59% parity) and scatters some coherent fields (e.g. body parts) — accepted, reversible noise.
 */
export function clusterOf(meaning: Meaning): string | undefined {
  if (hasEmbedding(meaning)) return clusterRegionOf(lexPoint(meaning));
  return meaningToCluster()[meaning];
}

export function relatedMeanings(meaning: Meaning): Meaning[] {
  const out = new Set<Meaning>();
  const cluster = clusterOf(meaning);
  if (cluster) {
    for (const m of semanticClusters()[cluster] ?? []) {
      if (m !== meaning) out.add(m);
    }
  }
  for (const n of neighborsOf(meaning)) out.add(n);
  return Array.from(out);
}
