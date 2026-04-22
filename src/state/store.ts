import { create } from "zustand";
import type {
  SimulationConfig,
  SimulationState,
  Meaning,
  WordForm,
} from "../engine/types";
import { createSimulation, type Simulation } from "../engine/simulation";
import { defaultConfig } from "../engine/config";
import type { NeighborOverride } from "../engine/semantics/drift";

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
  timelineMeanings: Meaning[];
  history: HistoryByLangMeaning;
  seedFormsByMeaning: Record<Meaning, WordForm>;
  aiNeighbors: NeighborOverride;
  aiStatus: { ready: boolean; progress: number; text: string; error: string | null };
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
  updateObsolescence: (patch: Partial<SimulationConfig["obsolescence"]>) => void;
  updateMorphologyRates: (patch: Partial<SimulationConfig["morphology"]>) => void;
  setChangeEnabled: (changeId: string, enabled: boolean) => void;
  setChangeWeight: (changeId: string, weight: number) => void;
  setGenesisEnabled: (ruleId: string, enabled: boolean) => void;
  selectLanguage: (id: string | null) => void;
  selectMeaning: (m: Meaning | null) => void;
  toggleTimelineMeaning: (m: Meaning) => void;
  setSeed: (s: string) => void;
  loadConfig: (
    config: SimulationConfig,
    generationsToReplay?: number,
    stateSnapshot?: SimulationState,
  ) => void;
  enableAiNeighbors: () => Promise<void>;
  loadCachedAiNeighbors: () => Promise<void>;
  clearAiNeighbors: () => Promise<void>;
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
  timelineMeanings: ["water"],
  history: initial.history,
  seedFormsByMeaning: initial.seedForms,
  aiNeighbors: {},
  aiStatus: { ready: false, progress: 0, text: "", error: null },
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
  updateObsolescence: (patch) => {
    const { config, updateConfig } = get();
    updateConfig({ obsolescence: { ...config.obsolescence, ...patch } });
  },
  updateMorphologyRates: (patch) => {
    const { config, updateConfig } = get();
    updateConfig({ morphology: { ...config.morphology, ...patch } });
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
  selectMeaning: (m) =>
    set((s) => {
      const tm = m && !s.timelineMeanings.includes(m)
        ? [...s.timelineMeanings.slice(-2), m].slice(-3)
        : s.timelineMeanings;
      return { selectedMeaning: m, timelineMeanings: tm };
    }),
  toggleTimelineMeaning: (m) =>
    set((s) => {
      const has = s.timelineMeanings.includes(m);
      const next = has
        ? s.timelineMeanings.filter((x) => x !== m)
        : [...s.timelineMeanings, m].slice(-5);
      return { timelineMeanings: next };
    }),
  setSeed: (s) => {
    const { config, updateConfig } = get();
    updateConfig({ ...config, seed: s });
  },
  loadConfig: (config, generationsToReplay, stateSnapshot) => {
    const init = initFromConfig(config);
    const { aiNeighbors } = get();
    init.sim.setAiNeighbors(aiNeighbors);
    if (stateSnapshot) {
      init.sim.restoreState(stateSnapshot);
      set({
        config,
        sim: init.sim,
        state: init.sim.getState(),
        history: init.history,
        seedFormsByMeaning: init.seedForms,
        selectedLangId: init.sim.getState().rootId,
        playing: false,
      });
      return;
    }
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
  loadCachedAiNeighbors: async () => {
    const { config } = get();
    const { loadCachedNeighbors } = await import("../engine/semantics/llm");
    const cached = await loadCachedNeighbors(Object.keys(config.seedLexicon));
    const { sim } = get();
    sim.setAiNeighbors(cached);
    set((s) => ({
      aiNeighbors: cached,
      aiStatus: { ...s.aiStatus, ready: Object.keys(cached).length > 0 },
    }));
  },
  enableAiNeighbors: async () => {
    const { config, sim } = get();
    set({ aiStatus: { ready: false, progress: 0, text: "Loading model…", error: null } });
    try {
      const { prefillNeighbors, DEFAULT_LLM_CONFIG } = await import("../engine/semantics/llm");
      const meanings = Object.keys(config.seedLexicon);
      const neighbors = await prefillNeighbors(meanings, DEFAULT_LLM_CONFIG, (info) => {
        set({
          aiStatus: {
            ready: false,
            progress: info.progress,
            text: info.text,
            error: null,
          },
        });
      });
      sim.setAiNeighbors(neighbors);
      set({
        aiNeighbors: neighbors,
        aiStatus: {
          ready: true,
          progress: 1,
          text: `AI neighbors loaded for ${Object.keys(neighbors).length} meanings`,
          error: null,
        },
      });
    } catch (e) {
      set({
        aiStatus: {
          ready: false,
          progress: 0,
          text: "",
          error: e instanceof Error ? e.message : String(e),
        },
      });
    }
  },
  clearAiNeighbors: async () => {
    const { sim } = get();
    const { clearCache } = await import("../engine/semantics/llm");
    await clearCache();
    sim.setAiNeighbors(undefined);
    set({
      aiNeighbors: {},
      aiStatus: { ready: false, progress: 0, text: "", error: null },
    });
  },
}));
