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
      globalRate: 0.3,
      enabledChangeIds: enabled,
      changeWeights: weights,
    },
    tree: {
      splitProbabilityPerGeneration: 0.015,
      maxLeaves: 12,
      unlimitedLeaves: true,
      minGenerationsBetweenSplits: 12,
      deathProbabilityPerGeneration: 0.01,
      minGenerationsBeforeDeath: 20,
    },
    genesis: {
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
      copulaLossProbability: 0.005,
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
