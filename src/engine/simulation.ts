import type {
  Language,
  LanguageNode,
  LanguageTree,
  Lexicon,
  SimulationConfig,
  SimulationState,
  SoundChange,
} from "./types";
import { CATALOG_BY_ID } from "./phonology/catalog";
import { applyChangesToLexicon } from "./phonology/apply";
import { leafIds, splitLeaf } from "./tree/split";
import { makeRng, type Rng } from "./rng";

export interface Simulation {
  getState: () => SimulationState;
  getConfig: () => SimulationConfig;
  step: () => void;
  reset: () => void;
}

function cloneLexicon(lex: Lexicon): Lexicon {
  const out: Lexicon = {};
  for (const m of Object.keys(lex)) out[m] = lex[m]!.slice();
  return out;
}

function buildInitialState(config: SimulationConfig): SimulationState {
  const rng = makeRng(config.seed);
  const rootId = "L-0";
  const enabled = config.phonology.enabledChangeIds.slice().sort();
  const weights: Record<string, number> = {};
  for (const id of enabled) {
    weights[id] = config.phonology.changeWeights[id] ?? CATALOG_BY_ID[id]?.baseWeight ?? 1;
  }
  const rootLang: Language = {
    id: rootId,
    name: "Proto",
    lexicon: cloneLexicon(config.seedLexicon),
    enabledChangeIds: enabled,
    changeWeights: weights,
    birthGeneration: 0,
  };
  const rootNode: LanguageNode = {
    language: rootLang,
    parentId: null,
    childrenIds: [],
  };
  const tree: LanguageTree = { [rootId]: rootNode };
  return {
    generation: 0,
    tree,
    rootId,
    rngState: rng.state(),
  };
}

function changesForLang(lang: Language): SoundChange[] {
  return lang.enabledChangeIds
    .map((id) => CATALOG_BY_ID[id])
    .filter((c): c is SoundChange => !!c);
}

function stepPhonology(lang: Language, config: SimulationConfig, rng: Rng): void {
  const changes = changesForLang(lang);
  lang.lexicon = applyChangesToLexicon(lang.lexicon, changes, rng, {
    globalRate: config.phonology.globalRate,
    weights: lang.changeWeights,
  });
}

function stepTreeSplit(
  state: SimulationState,
  leafId: string,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
): void {
  const age = state.generation - lang.birthGeneration;
  const currentLeafCount = leafIds(state.tree).length;
  if (
    age >= config.tree.minGenerationsBetweenSplits &&
    currentLeafCount < config.tree.maxLeaves &&
    rng.chance(config.tree.splitProbabilityPerGeneration)
  ) {
    splitLeaf(state.tree, leafId, state.generation + 1, rng);
  }
}

export function createSimulation(config: SimulationConfig): Simulation {
  let state: SimulationState = buildInitialState(config);

  const step = (): void => {
    const rng = makeRng(state.rngState);
    const leaves = leafIds(state.tree);
    for (const leafId of leaves) {
      const lang = state.tree[leafId]!.language;
      if (config.modes.phonology) stepPhonology(lang, config, rng);
      if (config.modes.tree) stepTreeSplit(state, leafId, lang, config, rng);
    }
    state = {
      ...state,
      generation: state.generation + 1,
      rngState: rng.state(),
    };
  };

  const reset = (): void => {
    state = buildInitialState(config);
  };

  return {
    getState: () => state,
    getConfig: () => config,
    step,
    reset,
  };
}

export function replay(config: SimulationConfig, generations: number): SimulationState {
  const sim = createSimulation(config);
  for (let i = 0; i < generations; i++) sim.step();
  return sim.getState();
}

export type { Rng };
