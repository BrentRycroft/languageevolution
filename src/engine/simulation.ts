import type { SimulationConfig, SimulationState } from "./types";
import type { NeighborOverride } from "./semantics/drift";
import { leafIds } from "./tree/split";
import { makeRng, type Rng } from "./rng";
import { buildInitialState } from "./steps/init";
import { stepPhonology } from "./steps/phonology";
import { stepGenesis, bootstrapNeologismNeighbors } from "./steps/genesis";
import { stepGrammar, stepMorphology } from "./steps/grammar";
import { stepSemantics } from "./steps/semantics";
import { stepObsolescence } from "./steps/obsolescence";
import { stepContact } from "./steps/contact";
import { stepTreeSplit, stepDeath } from "./steps/tree";
import { stepTaboo } from "./steps/taboo";

export interface Simulation {
  getState: () => SimulationState;
  getConfig: () => SimulationConfig;
  step: () => void;
  reset: () => void;
  setAiNeighbors: (n: NeighborOverride | undefined) => void;
  restoreState: (snapshot: SimulationState) => void;
}

export interface SimulationOptions {
  aiNeighbors?: NeighborOverride;
}

export function createSimulation(
  config: SimulationConfig,
  options: SimulationOptions = {},
): Simulation {
  let state: SimulationState = buildInitialState(config);
  let aiNeighbors = options.aiNeighbors;

  const step = (): void => {
    const rng = makeRng(state.rngState);
    const leaves = leafIds(state.tree);
    const nextGen = state.generation + 1;
    for (const leafId of leaves) {
      const lang = state.tree[leafId]!.language;
      if (lang.extinct) continue;
      if (config.modes.phonology) stepPhonology(lang, config, rng, nextGen);
      // Obsolescence runs BEFORE genesis so freshly-coined words are never
      // retired in the same step they were born in.
      stepObsolescence(lang, config, rng, nextGen);
      stepTaboo(lang, config, rng, nextGen);
      if (config.modes.genesis) {
        stepGenesis(lang, config, rng, nextGen);
        bootstrapNeologismNeighbors(lang);
      }
      if (config.modes.grammar) {
        stepGrammar(lang, config, rng, nextGen);
        stepMorphology(lang, config, rng, nextGen);
      }
      if (config.modes.semantics) stepSemantics(lang, config, rng, nextGen, aiNeighbors);
      stepContact(state, lang, config, rng, nextGen);
      if (config.modes.tree) stepTreeSplit(state, leafId, lang, config, rng);
      if (config.modes.death) stepDeath(state, lang, config, rng);
    }
    state = {
      ...state,
      generation: nextGen,
      rngState: rng.state(),
    };
  };

  return {
    getState: () => state,
    getConfig: () => config,
    step,
    reset: () => {
      state = buildInitialState(config);
    },
    setAiNeighbors: (n) => {
      aiNeighbors = n;
    },
    restoreState: (snapshot) => {
      state = {
        generation: snapshot.generation,
        rootId: snapshot.rootId,
        rngState: snapshot.rngState,
        tree: JSON.parse(JSON.stringify(snapshot.tree)),
      };
    },
  };
}

export function replay(config: SimulationConfig, generations: number): SimulationState {
  const sim = createSimulation(config);
  for (let i = 0; i < generations; i++) sim.step();
  return sim.getState();
}

export type { Rng };
