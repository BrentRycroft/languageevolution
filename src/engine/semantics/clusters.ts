import type { Meaning } from "../types";
import { neighborsOf } from "./neighbors";
import { CLUSTERS as BASIC_CLUSTERS } from "../lexicon/basic240";
import { CONCEPTS, CONCEPT_IDS } from "../lexicon/concepts";

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

export function clusterOf(meaning: Meaning): string | undefined {
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
