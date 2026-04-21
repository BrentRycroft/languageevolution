import type { SimulationConfig } from "./types";
import { CATALOG } from "./phonology/catalog";
import { DEFAULT_LEXICON } from "./lexicon/defaults";

export function defaultConfig(): SimulationConfig {
  const enabled = CATALOG.filter((c) => c.enabledByDefault).map((c) => c.id);
  const weights: Record<string, number> = {};
  for (const c of CATALOG) weights[c.id] = c.baseWeight;
  return {
    seed: "hello",
    modes: { phonology: true, agents: true, tree: true },
    phonology: {
      globalRate: 1,
      enabledChangeIds: enabled,
      changeWeights: weights,
    },
    agents: {
      populationSize: 24,
      gridWidth: 6,
      interactionsPerStep: 50,
      adoptionProbability: 0.35,
      innovationProbability: 0.03,
    },
    tree: {
      splitProbabilityPerGeneration: 0.05,
      maxLeaves: 6,
      minGenerationsBetweenSplits: 12,
    },
    seedLexicon: DEFAULT_LEXICON,
  };
}
