import type { SimulationConfig } from "./types";

/**
 * Validates a SimulationConfig and returns a list of human-readable issues.
 * An empty list means the config is well-formed. Issues are not fatal — the
 * simulator still runs — but they signal undefined or unexpected behavior.
 *
 * Categories:
 *  - Range: probability values must be in [0, 1].
 *  - Positive: counts and limits must be > 0.
 *  - Coherence: e.g. ruleWeights keys must be in enabledChangeIds.
 */
export function validateConfig(config: SimulationConfig): string[] {
  const issues: string[] = [];

  const probField = (path: string, value: number | undefined) => {
    if (value === undefined) return;
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      issues.push(`${path}=${value} is out of range [0,1]`);
    }
  };
  const positiveField = (path: string, value: number | undefined) => {
    if (value === undefined) return;
    if (!Number.isFinite(value) || value <= 0) {
      issues.push(`${path}=${value} must be > 0`);
    }
  };

  // Top-level
  if (!config.seed || typeof config.seed !== "string") {
    issues.push("seed must be a non-empty string");
  }
  positiveField("yearsPerGeneration", config.yearsPerGeneration);

  // Phonology
  probField("phonology.globalRate", config.phonology?.globalRate);
  if (config.phonology?.changeWeights) {
    for (const [id, w] of Object.entries(config.phonology.changeWeights)) {
      if (!Number.isFinite(w) || w < 0) {
        issues.push(`phonology.changeWeights["${id}"]=${w} must be >= 0`);
      }
    }
  }
  if (
    config.phonology?.enabledChangeIds &&
    config.phonology?.changeWeights
  ) {
    for (const id of config.phonology.enabledChangeIds) {
      if (!(id in config.phonology.changeWeights)) {
        issues.push(`phonology.enabledChangeIds["${id}"] has no weight defined`);
      }
    }
  }

  // Tree
  if (config.tree) {
    probField("tree.splitProbabilityPerGeneration", config.tree.splitProbabilityPerGeneration);
    probField("tree.deathProbabilityPerGeneration", config.tree.deathProbabilityPerGeneration);
    positiveField("tree.maxLeaves", config.tree.maxLeaves);
    positiveField("tree.minGenerationsBetweenSplits", config.tree.minGenerationsBetweenSplits);
    if (
      config.tree.minGenerationsBeforeDeath !== undefined &&
      config.tree.minGenerationsBeforeDeath < 0
    ) {
      issues.push(`tree.minGenerationsBeforeDeath=${config.tree.minGenerationsBeforeDeath} must be >= 0`);
    }
  }

  // Genesis
  probField("genesis.globalRate", config.genesis?.globalRate);
  if (config.genesis?.ruleWeights) {
    for (const [id, w] of Object.entries(config.genesis.ruleWeights)) {
      if (!Number.isFinite(w) || w < 0) {
        issues.push(`genesis.ruleWeights["${id}"]=${w} must be >= 0`);
      }
    }
  }

  // Grammar
  probField("grammar.driftProbabilityPerGeneration", config.grammar?.driftProbabilityPerGeneration);

  // Semantics
  probField("semantics.driftProbabilityPerGeneration", config.semantics?.driftProbabilityPerGeneration);
  probField("semantics.recarveProbabilityPerGeneration", config.semantics?.recarveProbabilityPerGeneration);

  // Obsolescence
  if (config.obsolescence) {
    probField("obsolescence.probabilityPerPairPerGeneration", config.obsolescence.probabilityPerPairPerGeneration);
    probField("obsolescence.copulaLossProbability", config.obsolescence.copulaLossProbability);
    probField("obsolescence.copulaGenesisProbability", config.obsolescence.copulaGenesisProbability);
    if (
      config.obsolescence.maxDistanceForRivalry !== undefined &&
      config.obsolescence.maxDistanceForRivalry < 0
    ) {
      issues.push(
        `obsolescence.maxDistanceForRivalry=${config.obsolescence.maxDistanceForRivalry} must be >= 0`,
      );
    }
  }

  // Morphology
  if (config.morphology) {
    probField("morphology.grammaticalizationProbability", config.morphology.grammaticalizationProbability);
    probField("morphology.paradigmMergeProbability", config.morphology.paradigmMergeProbability);
    probField("morphology.analogyProbability", config.morphology.analogyProbability);
    probField("morphology.cliticizationProbability", config.morphology.cliticizationProbability);
    probField("morphology.suppletionProbability", config.morphology.suppletionProbability);
  }

  // Contact
  probField("contact.borrowProbabilityPerGeneration", config.contact?.borrowProbabilityPerGeneration);

  // Phonology lawful
  probField("phonology_lawful.regularChangeProbability", config.phonology_lawful?.regularChangeProbability);

  // Taboo
  probField("taboo.replacementProbability", config.taboo?.replacementProbability);

  // Cultural tier seed
  if (config.seedCulturalTier !== undefined) {
    if (![0, 1, 2, 3].includes(config.seedCulturalTier as number)) {
      issues.push(`seedCulturalTier=${config.seedCulturalTier} must be 0, 1, 2, or 3`);
    }
  }

  return issues;
}

/**
 * Returns a one-line, human-friendly summary of validation issues, or null
 * if there are none.
 */
export function summarizeValidation(issues: readonly string[]): string | null {
  if (issues.length === 0) return null;
  return `Config validation: ${issues.length} issue${issues.length === 1 ? "" : "s"}: ${issues.join("; ")}`;
}
