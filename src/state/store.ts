import { create } from "zustand";
import type { SimulationConfig, SimulationState, Meaning, WordForm } from "../engine/types";
import { createSimulation, type Simulation } from "../engine/simulation";
import { defaultConfig } from "../engine/config";

const MAX_HISTORY = 500;

interface TimelineEntry {
  generation: number;
  form: WordForm;
  formKey: string;
}

interface HistoryByLangMeaning {
  [langId: string]: {
    [meaning: string]: TimelineEntry[];
  };
}

interface SimStore {
  sim: Simulation;
  config: SimulationConfig;
  state: SimulationState;
  playing: boolean;
  speed: number;
  selectedLangId: string | null;
  selectedMeaning: Meaning | null;
  history: HistoryByLangMeaning;
  seedFormsByMeaning: Record<Meaning, WordForm>;
  step: () => void;
  stepN: (n: number) => void;
  togglePlay: () => void;
  setSpeed: (s: number) => void;
  reset: () => void;
  updateConfig: (patch: Partial<SimulationConfig>) => void;
  updateModes: (patch: Partial<SimulationConfig["modes"]>) => void;
  updatePhonology: (patch: Partial<SimulationConfig["phonology"]>) => void;
  updateTree: (patch: Partial<SimulationConfig["tree"]>) => void;
  updateGenesis: (patch: Partial<SimulationConfig["genesis"]>) => void;
  updateGrammar: (patch: Partial<SimulationConfig["grammar"]>) => void;
  updateSemantics: (patch: Partial<SimulationConfig["semantics"]>) => void;
  setChangeEnabled: (changeId: string, enabled: boolean) => void;
  setChangeWeight: (changeId: string, weight: number) => void;
  setGenesisEnabled: (ruleId: string, enabled: boolean) => void;
  selectLanguage: (id: string | null) => void;
  selectMeaning: (m: Meaning | null) => void;
  setSeed: (s: string) => void;
  loadConfig: (config: SimulationConfig, generationsToReplay?: number) => void;
}

function recordHistory(
  history: HistoryByLangMeaning,
  state: SimulationState,
): HistoryByLangMeaning {
  const next: HistoryByLangMeaning = { ...history };
  for (const id of Object.keys(state.tree)) {
    const node = state.tree[id]!;
    if (node.childrenIds.length > 0) continue;
    const lex = node.language.lexicon;
    if (!next[id]) next[id] = {};
    const byMeaning = (next[id] = { ...next[id] });
    for (const m of Object.keys(lex)) {
      const form = lex[m]!;
      const key = form.join("");
      const arr = byMeaning[m] ?? [];
      const last = arr[arr.length - 1];
      if (!last || last.formKey !== key) {
        const nextArr = arr.concat({ generation: state.generation, form: form.slice(), formKey: key });
        byMeaning[m] = nextArr.length > MAX_HISTORY ? nextArr.slice(nextArr.length - MAX_HISTORY) : nextArr;
      }
    }
  }
  return next;
}

function initFromConfig(config: SimulationConfig) {
  const sim = createSimulation(config);
  const state = sim.getState();
  const seedForms: Record<Meaning, WordForm> = {};
  for (const m of Object.keys(config.seedLexicon)) seedForms[m] = config.seedLexicon[m]!.slice();
  const history = recordHistory({}, state);
  return { sim, state, seedForms, history };
}

const initialConfig = defaultConfig();
const initial = initFromConfig(initialConfig);

export const useSimStore = create<SimStore>((set, get) => ({
  sim: initial.sim,
  config: initialConfig,
  state: initial.state,
  playing: false,
  speed: 4,
  selectedLangId: initial.state.rootId,
  selectedMeaning: "water",
  history: initial.history,
  seedFormsByMeaning: initial.seedForms,
  step: () => {
    const { sim, history } = get();
    sim.step();
    const state = sim.getState();
    const newHistory = recordHistory(history, state);
    set({ state: { ...state }, history: newHistory });
  },
  stepN: (n) => {
    const s = get();
    for (let i = 0; i < n; i++) s.step();
  },
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (s) => set({ speed: s }),
  reset: () => {
    const { config } = get();
    const init = initFromConfig(config);
    set({
      sim: init.sim,
      state: init.state,
      history: init.history,
      seedFormsByMeaning: init.seedForms,
      selectedLangId: init.state.rootId,
      playing: false,
    });
  },
  updateConfig: (patch) => {
    const { config } = get();
    const next = { ...config, ...patch };
    const init = initFromConfig(next);
    set({
      config: next,
      sim: init.sim,
      state: init.state,
      history: init.history,
      seedFormsByMeaning: init.seedForms,
      selectedLangId: init.state.rootId,
      playing: false,
    });
  },
  updateModes: (patch) => {
    const { config, updateConfig } = get();
    updateConfig({ modes: { ...config.modes, ...patch } });
  },
  updatePhonology: (patch) => {
    const { config, updateConfig } = get();
    updateConfig({ phonology: { ...config.phonology, ...patch } });
  },
  updateTree: (patch) => {
    const { config, updateConfig } = get();
    updateConfig({ tree: { ...config.tree, ...patch } });
  },
  updateGenesis: (patch) => {
    const { config, updateConfig } = get();
    updateConfig({ genesis: { ...config.genesis, ...patch } });
  },
  updateGrammar: (patch) => {
    const { config, updateConfig } = get();
    updateConfig({ grammar: { ...config.grammar, ...patch } });
  },
  updateSemantics: (patch) => {
    const { config, updateConfig } = get();
    updateConfig({ semantics: { ...config.semantics, ...patch } });
  },
  setGenesisEnabled: (ruleId, enabled) => {
    const { config, updateConfig } = get();
    const ids = new Set(config.genesis.enabledRuleIds);
    if (enabled) ids.add(ruleId);
    else ids.delete(ruleId);
    updateConfig({
      genesis: { ...config.genesis, enabledRuleIds: Array.from(ids).sort() },
    });
  },
  setChangeEnabled: (changeId, enabled) => {
    const { config, updateConfig } = get();
    const ids = new Set(config.phonology.enabledChangeIds);
    if (enabled) ids.add(changeId);
    else ids.delete(changeId);
    updateConfig({
      phonology: {
        ...config.phonology,
        enabledChangeIds: Array.from(ids).sort(),
      },
    });
  },
  setChangeWeight: (changeId, weight) => {
    const { config, updateConfig } = get();
    updateConfig({
      phonology: {
        ...config.phonology,
        changeWeights: { ...config.phonology.changeWeights, [changeId]: weight },
      },
    });
  },
  selectLanguage: (id) => set({ selectedLangId: id }),
  selectMeaning: (m) => set({ selectedMeaning: m }),
  setSeed: (s) => {
    const { config, updateConfig } = get();
    updateConfig({ ...config, seed: s });
  },
  loadConfig: (config, generationsToReplay) => {
    const init = initFromConfig(config);
    set({
      config,
      sim: init.sim,
      state: init.state,
      history: init.history,
      seedFormsByMeaning: init.seedForms,
      selectedLangId: init.state.rootId,
      playing: false,
    });
    if (generationsToReplay && generationsToReplay > 0) {
      const s = get();
      for (let i = 0; i < generationsToReplay; i++) s.step();
    }
  },
}));
