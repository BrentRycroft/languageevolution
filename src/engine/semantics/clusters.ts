import type { Meaning } from "../types";
import { neighborsOf } from "./neighbors";
import { CLUSTERS as BASIC_CLUSTERS } from "../lexicon/basic240";
import { CONCEPTS, CONCEPT_IDS } from "../lexicon/concepts";
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
    const c = CONCEPTS[id]?.cluster;
    if (!c) continue;
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

export const SEMANTIC_CLUSTERS: Readonly<Record<string, readonly Meaning[]>> =
  buildClusters();

const MEANING_TO_CLUSTER: Record<Meaning, string> = (() => {
  const out: Record<Meaning, string> = {};
  for (const [name, members] of Object.entries(SEMANTIC_CLUSTERS)) {
    for (const m of members) out[m] = name;
  }
  return out;
})();

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
  return MEANING_TO_CLUSTER[meaning];
}

export function relatedMeanings(meaning: Meaning): Meaning[] {
  const out = new Set<Meaning>();
  const cluster = clusterOf(meaning);
  if (cluster) {
    for (const m of SEMANTIC_CLUSTERS[cluster] ?? []) {
      if (m !== meaning) out.add(m);
    }
  }
  for (const n of neighborsOf(meaning)) out.add(n);
  return Array.from(out);
}
