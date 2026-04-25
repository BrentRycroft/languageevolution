import type { Language, LanguageTree, Meaning } from "../types";
import { SEMANTIC_CLUSTERS, clusterOf } from "../semantics/clusters";
import { BASIC_240 } from "../lexicon/basic240";
import { CONCEPT_IDS, CONCEPTS, tierOf, type Tier } from "../lexicon/concepts";
import { leafIds } from "../tree/split";

/**
 * Per-meaning lexical-need score, used to bias which meaning a language
 * next tries to coin a word for. Higher = more pressure.
 *
 * Contributors:
 * - Cluster underpopulation: if the "animals" cluster has 4 out of 35
 *   expected members, every missing member gets a boost.
 * - Sister-language pressure: for every living sister that has word for
 *   meaning M that we lack, M gets +0.4.
 * - Topic pressure: meanings referenced in the language's recent events
 *   get a small bump; people talk about what's on their mind.
 * - Register asymmetry: if high-register slots are 3× more empty than
 *   low-register ones, high-register meanings get a mild boost.
 *
 * Meanings we already have get 0 pressure (never surface). Unknown
 * meanings (not in BASIC_240) also get 0 — we only coin for tracked
 * vocabulary slots.
 *
 * Conservatism damps the whole vector (timid languages coin less).
 */
export function lexicalNeed(
  lang: Language,
  tree: LanguageTree,
): Record<Meaning, number> {
  const out: Record<Meaning, number> = {};
  const lex = lang.lexicon;

  // Build cluster coverage map: how many BASIC_240 meanings per cluster
  // does this language currently have?
  const clusterCounts: Record<string, { have: number; total: number }> = {};
  for (const [name, members] of Object.entries(SEMANTIC_CLUSTERS)) {
    let have = 0;
    for (const m of members) if (lex[m]) have++;
    clusterCounts[name] = { have, total: members.length };
  }

  // Sister languages: the living alive leaves excluding `lang`.
  const sisters = leafIds(tree)
    .filter((id) => id !== lang.id && !tree[id]!.language.extinct)
    .map((id) => tree[id]!.language);

  // Topic pressure from recent events (last 10 gens).
  const recentTopics = new Set<string>();
  const events = lang.events ?? [];
  for (const e of events.slice(-20)) {
    for (const token of e.description.toLowerCase().split(/[\s":,;()]+/)) {
      if (token.length > 1) recentTopics.add(token);
    }
  }

  const tier = (lang.culturalTier ?? 0) as Tier;
  // Need vector now spans the whole concept registry, not just
  // BASIC_240 — so tier-2/3 vocabulary becomes coinable for
  // languages that have advanced. The tier gate below filters
  // out concepts above the language's current tier.
  const basicSet = BASIC_240 as readonly Meaning[];
  const basicSetLookup = new Set(basicSet);
  for (const m of CONCEPT_IDS) {
    if (lex[m]) {
      out[m] = 0;
      continue;
    }
    // Tier gate: a concept above this language's cultural tier isn't
    // a candidate for coinage yet (a palaeolithic language can't
    // invent a word for "iron" or "plow"). Tier diffuses in via
    // contact or age in `lexicon/tier.ts::computeTierCandidate`.
    if (tierOf(m) > tier) {
      out[m] = 0;
      continue;
    }
    let score = 0;
    // Cluster underpopulation. Only consults the cluster-coverage
    // map for BASIC_240 members; expansion-only concepts get a flat
    // baseline (the cluster math is calibrated against BASIC_240
    // sizes so we'd over-coin if every expansion concept counted
    // toward the same denominator).
    const cl = clusterOf(m) ?? CONCEPTS[m]?.cluster;
    if (cl && basicSetLookup.has(m)) {
      const info = clusterCounts[cl];
      if (info && info.total > 0) {
        const coverage = info.have / info.total;
        score += Math.max(0, 1 - coverage) * 0.6;
      }
    } else if (!basicSetLookup.has(m)) {
      // Expansion-only concept — give it a small baseline so it can
      // surface, but lower than the BASIC_240 coverage-driven score
      // so the basic vocabulary still fills first.
      score += 0.15;
    }
    // Sister pressure
    let sistersWithIt = 0;
    for (const s of sisters) {
      if (s.lexicon[m]) sistersWithIt++;
    }
    if (sisters.length > 0) {
      score += (sistersWithIt / sisters.length) * 0.4;
    }
    // Topic pressure
    if (recentTopics.has(m)) score += 0.2;

    out[m] = score * (lang.conservatism ?? 1);
  }

  return out;
}

/**
 * Weighted random meaning pick given a need vector. Returns null if the
 * whole vector is zero (nothing needed).
 */
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
