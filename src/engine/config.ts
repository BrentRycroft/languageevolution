import type { SimulationConfig } from "./types";
import { CATALOG } from "./phonology/catalog";
import { GENESIS_CATALOG } from "./genesis/catalog";
import { DEFAULT_LEXICON } from "./lexicon/defaults";
import { DEFAULT_FREQUENCY_HINTS } from "./lexicon/frequency";
import { DEFAULT_MORPHOLOGY } from "./morphology/defaults";
import { YEARS_PER_GENERATION } from "./constants";

export function defaultConfig(): SimulationConfig {
  const enabled = CATALOG.filter((c) => c.enabledByDefault).map((c) => c.id);
  const weights: Record<string, number> = {};
  for (const c of CATALOG) weights[c.id] = c.baseWeight;
  const genesisEnabled = GENESIS_CATALOG.filter((g) => g.enabledByDefault).map((g) => g.id);
  const genesisWeights: Record<string, number> = {};
  for (const g of GENESIS_CATALOG) genesisWeights[g.id] = g.baseWeight;
  return {
    seed: "hello",
    yearsPerGeneration: YEARS_PER_GENERATION,
    modes: {
      phonology: true,
      tree: true,
      genesis: true,
      death: true,
      grammar: true,
      semantics: true,
    },
    phonology: {
      // Empirical audit (200-gen / 5ky PIE run) found the previous
      // rate of 1.0 fired ~36 sound-change events per ky per
      // language. Attested rates are 1-3 *regular* sound changes per
      // ky per lineage (Hock 1991, Lass 1997). Lowered to 0.3 so the
      // surface count lands roughly an order of magnitude closer to
      // attested timing. Also stops the deletion-heavy ruleset from
      // eroding word length monotonically (the previous rate dropped
      // mean word length 4.0 → 2.9 over 5 ky — Spanish vs PIE in 5ky
      // moves only ~5 → ~5).
      globalRate: 0.3,
      enabledChangeIds: enabled,
      changeWeights: weights,
    },
    tree: {
      // Lowered from 0.05 → 0.015 now that each split can produce up
      // to 9 daughters rather than strictly two. With an unchanged
      // rate the tree was fanning out far faster than real language
      // families; at 0.015 an average leaf splits every ~60 gens,
      // which matches the pacing of attested proto-language
      // subgroupings.
      splitProbabilityPerGeneration: 0.015,
      // Soft-cap target only — death pressure rises near `maxLeaves`,
      // never blocks. Default `unlimitedLeaves: true` removes the
      // hard cap entirely so the tree can grow as long as the
      // simulation runs.
      maxLeaves: 12,
      unlimitedLeaves: true,
      minGenerationsBetweenSplits: 12,
      deathProbabilityPerGeneration: 0.01,
      minGenerationsBeforeDeath: 20,
    },
    genesis: {
      // Empirical audit found the previous 0.08 produced ~1.8
      // coinages per ky per lang — way below attested ~50-200 new
      // content words per ky per lineage (Bybee 2015 turnover rates
      // estimate). Bumped to 0.4 so a typical lang coins ~10/ky,
      // partially counteracting the deletion / obsolescence churn
      // and keeping word-length distributions stable rather than
      // monotonically decaying.
      globalRate: 0.4,
      enabledRuleIds: genesisEnabled,
      ruleWeights: genesisWeights,
    },
    grammar: {
      driftProbabilityPerGeneration: 0.03,
    },
    semantics: {
      driftProbabilityPerGeneration: 0.02,
      recarveProbabilityPerGeneration: 0.003,
    },
    obsolescence: {
      probabilityPerPairPerGeneration: 0.04,
      maxDistanceForRivalry: 1,
      // ~0.5% per gen — at 25 yr/gen that's an expected copula
      // loss in ~5000 years on average, in the right ballpark for
      // attested Slavic copula erosion (Old Church Slavonic kept
      // present-tense `jestь` to ~9th century, modern Russian
      // dropped it in equational sentences by ~16th century).
      copulaLossProbability: 0.005,
      // Genesis is rarer than loss but still attested: Mandarin 是
      // ← Old Chinese demonstrative, Hebrew הוא ← pronoun, Spanish
      // estar ← Latin stare. Half the loss rate by default.
      copulaGenesisProbability: 0.0025,
    },
    morphology: {
      grammaticalizationProbability: 0.025,
      paradigmMergeProbability: 0.01,
      analogyProbability: 0.015,
      cliticizationProbability: 0.02,
      suppletionProbability: 0.008,
    },
    contact: {
      borrowProbabilityPerGeneration: 0.02,
    },
    phonology_lawful: {
      regularChangeProbability: 0.03,
    },
    taboo: {
      replacementProbability: 0.004,
    },
    evolutionSpeed: "standard",
    seedLexicon: DEFAULT_LEXICON,
    seedFrequencyHints: DEFAULT_FREQUENCY_HINTS,
    seedMorphology: DEFAULT_MORPHOLOGY,
  };
}
