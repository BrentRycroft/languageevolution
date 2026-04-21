import type {
  Language,
  LanguageEvent,
  LanguageNode,
  LanguageTree,
  Lexicon,
  SimulationConfig,
  SimulationState,
  SoundChange,
} from "./types";
import { CATALOG_BY_ID } from "./phonology/catalog";
import { applyChangesToLexicon } from "./phonology/apply";
import { GENESIS_BY_ID } from "./genesis/catalog";
import type { GenesisRule } from "./genesis/types";
import { tryGenesis } from "./genesis/apply";
import { driftGrammar } from "./grammar/evolve";
import { DEFAULT_GRAMMAR } from "./grammar/defaults";
import { driftOneMeaning, type NeighborOverride } from "./semantics/drift";
import { leafIds, splitLeaf } from "./tree/split";
import { makeRng, type Rng } from "./rng";

const MAX_EVENTS_PER_LANGUAGE = 80;

export interface Simulation {
  getState: () => SimulationState;
  getConfig: () => SimulationConfig;
  step: () => void;
  reset: () => void;
  setAiNeighbors: (n: import("./semantics/drift").NeighborOverride | undefined) => void;
}

function cloneLexicon(lex: Lexicon): Lexicon {
  const out: Lexicon = {};
  for (const m of Object.keys(lex)) out[m] = lex[m]!.slice();
  return out;
}

function pushEvent(lang: Language, event: LanguageEvent): void {
  lang.events.push(event);
  if (lang.events.length > MAX_EVENTS_PER_LANGUAGE) {
    lang.events.splice(0, lang.events.length - MAX_EVENTS_PER_LANGUAGE);
  }
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
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
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

function genesisRulesFor(config: SimulationConfig): GenesisRule[] {
  return config.genesis.enabledRuleIds
    .map((id) => GENESIS_BY_ID[id])
    .filter((r): r is GenesisRule => !!r);
}

function stepPhonology(lang: Language, config: SimulationConfig, rng: Rng, generation: number): void {
  const before = lang.lexicon;
  const changes = changesForLang(lang);
  lang.lexicon = applyChangesToLexicon(before, changes, rng, {
    globalRate: config.phonology.globalRate,
    weights: lang.changeWeights,
  });
  let mutated = 0;
  for (const m of Object.keys(before)) {
    const a = before[m]!.join("");
    const b = (lang.lexicon[m] ?? []).join("");
    if (a !== b) mutated++;
  }
  if (mutated > 0) {
    pushEvent(lang, {
      generation,
      kind: "sound_change",
      description: `${mutated} form${mutated === 1 ? "" : "s"} shifted`,
    });
  }
}

function stepGenesis(lang: Language, config: SimulationConfig, rng: Rng, generation: number): void {
  const rules = genesisRulesFor(config);
  const result = tryGenesis(lang, rules, config.genesis.ruleWeights, config.genesis.globalRate, rng);
  if (result) {
    pushEvent(lang, {
      generation,
      kind: "coinage",
      description: `coined ${result}`,
    });
  }
}

function stepGrammar(lang: Language, config: SimulationConfig, rng: Rng, generation: number): void {
  if (!rng.chance(config.grammar.driftProbabilityPerGeneration)) return;
  const shifts = driftGrammar(lang.grammar, rng);
  for (const s of shifts) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `${s.feature}: ${String(s.from)} → ${String(s.to)}`,
    });
  }
}

function stepSemantics(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
  override?: NeighborOverride,
): void {
  if (!rng.chance(config.semantics.driftProbabilityPerGeneration)) return;
  const drift = driftOneMeaning(lang, rng, override);
  if (drift) {
    pushEvent(lang, {
      generation,
      kind: "semantic_drift",
      description: `${drift.from} → ${drift.to}`,
    });
  }
}

function stepTreeSplit(
  state: SimulationState,
  leafId: string,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
): void {
  const age = state.generation - lang.birthGeneration;
  const aliveLeaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
  if (
    age >= config.tree.minGenerationsBetweenSplits &&
    aliveLeaves.length < config.tree.maxLeaves &&
    rng.chance(config.tree.splitProbabilityPerGeneration)
  ) {
    splitLeaf(state.tree, leafId, state.generation + 1, rng);
  }
}

function stepDeath(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
): void {
  const aliveLeaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
  if (aliveLeaves.length <= 1) return;
  const age = state.generation - lang.birthGeneration;
  if (age < config.tree.minGenerationsBeforeDeath) return;
  // Scale death probability up as population grows to keep the tree in equilibrium.
  const pressure = aliveLeaves.length / Math.max(1, config.tree.maxLeaves);
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
      if (config.modes.genesis) stepGenesis(lang, config, rng, nextGen);
      if (config.modes.grammar) stepGrammar(lang, config, rng, nextGen);
      if (config.modes.semantics) stepSemantics(lang, config, rng, nextGen, aiNeighbors);
      if (config.modes.tree) stepTreeSplit(state, leafId, lang, config, rng);
      if (config.modes.death) stepDeath(state, lang, config, rng);
    }
    state = {
      ...state,
      generation: nextGen,
      rngState: rng.state(),
    };
  };

  const setAiNeighbors = (n: NeighborOverride | undefined): void => {
    aiNeighbors = n;
  };

  const reset = (): void => {
    state = buildInitialState(config);
  };

  return {
    getState: () => state,
    getConfig: () => config,
    step,
    reset,
    setAiNeighbors,
  };
}

export function replay(config: SimulationConfig, generations: number): SimulationState {
  const sim = createSimulation(config);
  for (let i = 0; i < generations; i++) sim.step();
  return sim.getState();
}

export type { Rng };
