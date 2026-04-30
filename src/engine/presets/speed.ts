import type { SimulationConfig } from "../types";

export interface EvolutionSpeedProfile {
  id: string;
  label: string;
  description: string;
  apply: (cfg: SimulationConfig) => SimulationConfig;
}

function scale(cfg: SimulationConfig, factor: number, splitFactor = factor): SimulationConfig {
  return {
    ...cfg,
    phonology: {
      ...cfg.phonology,
      globalRate: cfg.phonology.globalRate * factor,
    },
    tree: {
      ...cfg.tree,
      splitProbabilityPerGeneration: cfg.tree.splitProbabilityPerGeneration * splitFactor,
      deathProbabilityPerGeneration: cfg.tree.deathProbabilityPerGeneration * splitFactor,
      minGenerationsBetweenSplits: Math.max(
        1,
        Math.round(cfg.tree.minGenerationsBetweenSplits / splitFactor),
      ),
      minGenerationsBeforeDeath: Math.max(
        5,
        Math.round(cfg.tree.minGenerationsBeforeDeath / splitFactor),
      ),
    },
    genesis: {
      ...cfg.genesis,
      globalRate: Math.min(0.4, cfg.genesis.globalRate * factor),
    },
    grammar: {
      ...cfg.grammar,
      driftProbabilityPerGeneration: Math.min(
        0.3,
        cfg.grammar.driftProbabilityPerGeneration * factor,
      ),
    },
    semantics: {
      ...cfg.semantics,
      driftProbabilityPerGeneration: Math.min(
        0.2,
        cfg.semantics.driftProbabilityPerGeneration * factor,
      ),
    },
    obsolescence: {
      ...cfg.obsolescence,
      probabilityPerPairPerGeneration: Math.min(
        0.2,
        cfg.obsolescence.probabilityPerPairPerGeneration * factor,
      ),
    },
    morphology: {
      ...cfg.morphology,
      grammaticalizationProbability: Math.min(
        0.08,
        cfg.morphology.grammaticalizationProbability * factor,
      ),
      paradigmMergeProbability: Math.min(
        0.08,
        cfg.morphology.paradigmMergeProbability * factor,
      ),
    },
  };
}

export const EVOLUTION_SPEEDS: readonly EvolutionSpeedProfile[] = [
  {
    id: "conservative",
    label: "Conservative",
    description:
      "~0.3× speed. Sound change is glacial, lexicons stable, splits rare. Best for slow-burn simulations.",
    apply: (cfg) => scale(cfg, 0.3, 0.5),
  },
  {
    id: "standard",
    label: "Standard (default)",
    description:
      "Calibrated to produce Romance-from-Latin-scale divergence in ~150 generations. The recommended starting point.",
    apply: (cfg) => cfg,
  },
  {
    id: "rapid",
    label: "Rapid",
    description:
      "2× speed. Good for demos and classroom use — divergence visible within ~60 generations.",
    apply: (cfg) => scale(cfg, 2, 1.6),
  },
  {
    id: "extreme",
    label: "Extreme",
    description:
      "5× speed, chaos-mode. Languages shift rapidly, tree splits frequently, obsolescence churns the lexicon every few generations.",
    apply: (cfg) => scale(cfg, 5, 3),
  },
];

export function findEvolutionSpeed(id: string | undefined): EvolutionSpeedProfile | undefined {
  return EVOLUTION_SPEEDS.find((p) => p.id === id);
}
