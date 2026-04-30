import type { Language, LanguageTree, Meaning } from "../types";
import { SEMANTIC_CLUSTERS, clusterOf } from "../semantics/clusters";
import { BASIC_240 } from "../lexicon/basic240";
import { CONCEPT_IDS, CONCEPTS, tierOf, type Tier } from "../lexicon/concepts";
import { EXPANSION_NEED_BASELINE } from "../constants";
import { leafIds } from "../tree/split";

export function lexicalNeed(
  lang: Language,
  tree: LanguageTree,
): Record<Meaning, number> {
  const out: Record<Meaning, number> = {};
  const lex = lang.lexicon;

  const clusterCounts: Record<string, { have: number; total: number }> = {};
  for (const [name, members] of Object.entries(SEMANTIC_CLUSTERS)) {
    let have = 0;
    for (const m of members) if (lex[m]) have++;
    clusterCounts[name] = { have, total: members.length };
  }

  const sisters = leafIds(tree)
    .filter((id) => id !== lang.id && !tree[id]!.language.extinct)
    .map((id) => tree[id]!.language);

  const recentTopics = new Set<string>();
  const events = lang.events ?? [];
  for (const e of events.slice(-20)) {
    for (const token of e.description.toLowerCase().split(/[\s":,;()]+/)) {
      if (token.length > 1) recentTopics.add(token);
    }
  }

  const tier = (lang.culturalTier ?? 0) as Tier;
  const basicSet = BASIC_240 as readonly Meaning[];
  const basicSetLookup = new Set(basicSet);
  for (const m of CONCEPT_IDS) {
    if (lex[m]) {
      out[m] = 0;
      continue;
    }
    if (tierOf(m) > tier) {
      out[m] = 0;
      continue;
    }
    let score = 0;
    const cl = clusterOf(m) ?? CONCEPTS[m]?.cluster;
    if (cl && basicSetLookup.has(m)) {
      const info = clusterCounts[cl];
      if (info && info.total > 0) {
        const coverage = info.have / info.total;
        score += Math.max(0, 1 - coverage) * 0.6;
      }
    } else if (!basicSetLookup.has(m)) {
      score += EXPANSION_NEED_BASELINE;
    }
    let sistersWithIt = 0;
    for (const s of sisters) {
      if (s.lexicon[m]) sistersWithIt++;
    }
    if (sisters.length > 0) {
      score += (sistersWithIt / sisters.length) * 0.4;
    }
    if (recentTopics.has(m)) score += 0.2;

    out[m] = score * (lang.conservatism ?? 1);
  }

  return out;
}

export function sampleNeededMeaning(
  need: Record<Meaning, number>,
  rng: import("../rng").Rng,
): Meaning | null {
  let total = 0;
  for (const v of Object.values(need)) total += Math.max(0, v);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const [m, v] of Object.entries(need)) {
    r -= Math.max(0, v);
    if (r <= 0) return m;
  }
  return null;
}
