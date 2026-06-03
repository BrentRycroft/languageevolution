import type { SimulationConfig } from "./types";
import { CATALOG } from "./phonology/catalog";
import { GENESIS_CATALOG } from "./genesis/catalog";
import { DEFAULT_LEXICON } from "./lexicon/defaults";
import { DEFAULT_FREQUENCY_HINTS } from "./lexicon/frequency";
import { DEFAULT_MORPHOLOGY } from "./morphology/defaults";
import { YEARS_PER_GENERATION } from "./constants";

/**
 * config.ts
 *
 * default SimulationConfig — rate calibration knobs (Phase 60+). Key exports: defaultConfig.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

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
      contact: true,
      volatility: true,
      areal: true,
      creolization: true,
      learner: true,
      obsolescence: true,
      taboo: true,
      copula: true,
      swadeshProtection: true,
      tonogenesis: false,
    },
    // Phase 60: rebalanced rates. User reported sound changes were
    // dominating event logs while coinages, grammar drift, semantic
    // shifts, etc. were too sparse. Phonology was rolled per-word per
    // gen at 0.22 — hundreds of dice per gen — while every other
    // event family was at single-digit-percent per-gen-per-language.
    // New rates: phonology slightly down, every other family 2.5–3×
    // up. Coinage gets the largest bump (3× globalRate + 2× target
    // base in steps/genesis.ts).
    phonology: {
      globalRate: 0.05,
      enabledChangeIds: enabled,
      changeWeights: weights,
    },
    tree: {
      splitProbabilityPerGeneration: 0.012,
      maxLeaves: 12,
      unlimitedLeaves: false,
      minGenerationsBetweenSplits: 12,
      deathProbabilityPerGeneration: 0.0035,
      minGenerationsBeforeDeath: 20,
    },
    genesis: {
      globalRate: 1.0,
      enabledRuleIds: genesisEnabled,
      ruleWeights: genesisWeights,
    },
    grammar: {
      driftProbabilityPerGeneration: 0.12,
    },
    semantics: {
      driftProbabilityPerGeneration: 0.10,
      recarveProbabilityPerGeneration: 0.015,
    },
    obsolescence: {
      probabilityPerPairPerGeneration: 0.07,
      maxDistanceForRivalry: 1,
      copulaLossProbability: 0.012,
      copulaGenesisProbability: 0.008,
      lowFreqProbability: 0.04,
    },
    morphology: {
      grammaticalizationProbability: 0.04,
      paradigmMergeProbability: 0.025,
      paradigmLossProbability: 0.06,
      analogyProbability: 0.035,
      cliticizationProbability: 0.035,
      suppletionProbability: 0.015,
    },
    contact: {
      borrowProbabilityPerGeneration: 0.10,
    },
    phonology_lawful: {
      regularChangeProbability: 0.04,
    },
    taboo: {
      replacementProbability: 0.02,
    },
    evolutionSpeed: "standard",
    seedLexicon: DEFAULT_LEXICON,
    seedFrequencyHints: DEFAULT_FREQUENCY_HINTS,
    seedMorphology: DEFAULT_MORPHOLOGY,
    // Phase 31 Tranche 31d: default preset is non-tonal. Presets that
    // override (e.g., bantu) declare their own seedToneRegime.
    seedToneRegime: "non-tonal",
  };
}
