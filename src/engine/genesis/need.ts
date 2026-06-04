import type { Language, LanguageTree, Meaning } from "../types";
import { SEMANTIC_CLUSTERS, clusterOf } from "../semantics/clusters";
import { BASIC_240 } from "../lexicon/basic240";
import { CONCEPT_IDS, CONCEPTS, conceptsAtOrBelow, tierOf, type Tier } from "../lexicon/concepts";
import { EXPANSION_NEED_BASELINE, REGISTRY_FILL_CAP } from "../constants";
import { leafIds } from "../tree/split";
import { isClosedClass, posOf } from "../lexicon/pos";
import { lexGet, lexHas } from "../lexicon/access";

/**
 * need.ts
 *
 * Word-coinage mechanisms (compound, derivation, conversion, clipping, ideophone, calque, blending, reduplication). Key exports: LexicalNeedOptions, lexicalNeed, sampleNeededMeaning.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export interface LexicalNeedOptions {
  /**
   * Phase 24: per-meaning seed length. When provided, lexicalNeed adds
   * a "shrinkage" component to the need score for already-existing
   * meanings whose form has eroded below ~70% of seed length AND whose
   * frequency is high (i.e., still actively used). This drives genesis
   * to propose lexical replacement for over-eroded content words —
   * Latin *caput* → Romance *testa* once *caput* lost discriminability.
   */
  seedLengths?: Record<Meaning, number>;
}

export function lexicalNeed(
  lang: Language,
  tree: LanguageTree,
  opts: LexicalNeedOptions = {},
): Record<Meaning, number> {
  const out: Record<Meaning, number> = {};

  const clusterCounts: Record<string, { have: number; total: number }> = {};
  for (const [name, members] of Object.entries(SEMANTIC_CLUSTERS)) {
    let have = 0;
    for (const m of members) if (lexHas(lang, m)) have++;
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
  const seedLengths = opts.seedLengths;

  // Lane B: per-language registry-fill cap. A language only fills a fraction
  // (REGISTRY_FILL_CAP[tier]) of the concepts at or below its cultural tier; once
  // that ceiling is reached the faint EXPANSION_NEED_BASELINE "this slot exists"
  // pull is switched OFF, so further growth must come from genuine communicative
  // need (recent topics, sister presence, cluster coverage). This replaces the old
  // "fill the whole CONCEPT_IDS registry → ~1800 words" exogenous target with an
  // emergent, tier-scaled ceiling: a minimalist / early-tier culture stays small.
  const accessible = conceptsAtOrBelow(tier).length;
  const fillCap = Math.round(REGISTRY_FILL_CAP[tier] * accessible);
  let lexCount = 0;
  for (const m of CONCEPT_IDS) if (lexHas(lang, m)) lexCount++;
  const belowFillCap = lexCount < fillCap;
  for (const m of CONCEPT_IDS) {
    if (lexHas(lang, m)) {
      // Phase 24: existing meanings get a shrinkage-based replacement
      // need when the current form is below 70% of seed length AND the
      // word is still high-frequency. This closes the loop: erosion →
      // genesis replenishment, instead of letting eroded high-freq
      // words sit at minimum length forever.
      let shrinkage = 0;
      // Phase 26c: closed-class words (DET, AUX, PREP, CONJ, PRON, NEG)
      // are NOT lexically replaced when eroded — function-word
      // reduction is a real linguistic process (English "going to" →
      // "gonna" is a feature, not a bug). Skip the shrinkage signal.
      if (seedLengths && !isClosedClass(posOf(m))) {
        const seedLen = seedLengths[m];
        const cur = lexGet(lang, m);
        if (seedLen && cur && cur.length < Math.ceil(seedLen * 0.7)) {
          const freq = lang.wordFrequencyHints?.[m] ?? 0.5;
          if (freq > 0.4) {
            shrinkage = 0.5 * (1 - cur.length / seedLen);
          }
        }
      }
      out[m] = shrinkage;
      continue;
    }
    if (tierOf(m) > tier) {
      out[m] = 0;
      continue;
    }
    let score = 0;
    const cl = clusterOf(m) ?? CONCEPTS[m]?.cluster;
    if (cl && basicSetLookup.has(m)) {
      // Basic-vocabulary gaps: pressure to round out an under-covered core
      // semantic cluster (this is real communicative need — a language that has
      // "dog" but not "wolf" feels the gap). Unchanged.
      const info = clusterCounts[cl];
      if (info && info.total > 0) {
        const coverage = info.have / info.total;
        score += Math.max(0, 1 - coverage) * 0.6;
      }
    } else if (!basicSetLookup.has(m) && belowFillCap) {
      // Lane B: the faint "this registry slot exists" expansion pull ONLY applies
      // while the language is below its tier-scaled registry-fill cap. At/above the
      // cap this term is zero — non-basic growth must then come entirely from the
      // communicative-need signals below (topics, sisters), so the lexicon settles
      // at an emergent ceiling instead of marching toward the whole registry.
      score += EXPANSION_NEED_BASELINE;
    }
    // Communicative need: sister-language presence. A concept many living sisters
    // already lexicalise is one this speech community is likely to need too
    // (shared cultural/areal pressure). This is NOT gated by the fill cap — a
    // sister actually using a word is real pressure regardless of registry fill.
    let sistersWithIt = 0;
    for (const s of sisters) {
      if (lexHas(s, m)) sistersWithIt++;
    }
    if (sisters.length > 0) {
      score += (sistersWithIt / sisters.length) * 0.4;
    }
    // Communicative need: a concept appearing in recent topics/events is under
    // active discourse pressure. Ungated (real usage trumps the cap).
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
