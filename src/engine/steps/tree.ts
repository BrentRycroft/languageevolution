import type { Language, SimulationConfig, SimulationState } from "../types";
import { leafIds, splitLeaf } from "../tree/split";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

export function stepTreeSplit(
  state: SimulationState,
  leafId: string,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
): void {
  const age = state.generation - lang.birthGeneration;
  const aliveLeaves = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );
  // unlimitedLeaves bypasses the cap entirely. Otherwise we still
  // require slack under the configured maxLeaves before a split fires.
  const underCap =
    config.tree.unlimitedLeaves || aliveLeaves.length < config.tree.maxLeaves;
  if (
    age >= config.tree.minGenerationsBetweenSplits &&
    underCap &&
    rng.chance(config.tree.splitProbabilityPerGeneration)
  ) {
    splitLeaf(state.tree, leafId, state.generation + 1, rng);
  }
}

export function stepDeath(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
): void {
  const aliveLeaves = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );
  if (aliveLeaves.length <= 1) return;
  const age = state.generation - lang.birthGeneration;
  if (age < config.tree.minGenerationsBeforeDeath) return;
  // Death pressure scales with how full the tree is. With unlimited
  // leaves we cap pressure at 1.0 (no extra dying-out from "fullness").
  const cap = Math.max(1, config.tree.maxLeaves);
  const pressure = config.tree.unlimitedLeaves
    ? 1
    : aliveLeaves.length / cap;
  const p = config.tree.deathProbabilityPerGeneration * pressure;
  if (rng.chance(p)) {
    lang.extinct = true;
    lang.deathGeneration = state.generation + 1;
    pushEvent(lang, {
      generation: state.generation + 1,
      kind: "sound_change",
      description: "language went extinct",
    });
  }
}
