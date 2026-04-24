import type { SimulationConfig, SimulationState } from "./types";
import type { NeighborOverride } from "./semantics/drift";
import { leafIds, pickFirstSplitChildCount, splitLeaf } from "./tree/split";
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
    const nextGen = state.generation + 1;

    // Proto preservation: on the very first step (gen 0 → gen 1),
    // automatically split the root into two daughters. The proto itself
    // becomes a non-leaf node — its lexicon is frozen at the seed state
    // and never receives further evolution — so it stays preserved as a
    // reference. Subsequent generations evolve the two daughters.
    // We do this regardless of minGenerationsBetweenSplits / maxLeaves
    // because it's the canonical "start" of the tree, not an ordinary
    // speciation. When tree mode is off we skip this so a single-language
    // run stays single.
    if (state.generation === 0 && config.modes.tree) {
      // Bootstrap split draws from a wider distribution than later
      // speciations — 2–4 daughters is normal, 5–7 rare, 8 exceedingly
      // rare. Proto-communities historically fragment into more than
      // two lineages at the first dispersal (Proto-Bantu → 3-4,
      // Proto-Austronesian → many more). See `pickFirstSplitChildCount`.
      const childCount = pickFirstSplitChildCount(rng);
      splitLeaf(state.tree, state.rootId, nextGen, rng, { childCount });
    }

    const leaves = leafIds(state.tree);
    for (const leafId of leaves) {
      const lang = state.tree[leafId]!.language;
      if (lang.extinct) continue;
      if (config.modes.phonology) stepPhonology(lang, config, rng, nextGen);
      // Obsolescence runs BEFORE genesis so freshly-coined words are never
      // retired in the same step they were born in.
      stepObsolescence(lang, config, rng, nextGen);
      stepTaboo(lang, config, rng, nextGen);
      if (config.modes.genesis) {
        stepGenesis(lang, config, state, rng, nextGen);
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
