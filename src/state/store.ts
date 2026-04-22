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
import {
  recordHistory,
  recordActivity,
  countRuleBirthsAt,
  type HistoryByLangMeaning,
  type ActivityPoint,
} from "./history";

interface SimStore {
  sim: Simulation;
  config: SimulationConfig;
  state: SimulationState;
  playing: boolean;
  speed: number;
  selectedLangId: string | null;
  selectedMeaning: Meaning | null;
  timelineMeanings: Meaning[];
  /** Lexicon visibility filter: "alive" (default), "all", "starred", "compare". */
  lexiconFilter: "alive" | "all" | "starred" | "compare";
  /** Set of language ids the user has bookmarked. */
  starredLangIds: string[];
  /** Language ids checked in the "compare" filter mode. */
  compareLangIds: string[];
  /** Substring search over meanings in the lexicon view. */
  lexiconSearch: string;
  /** Script mode for the Lexicon view: phonemic (IPA) / orthographic / both. */
  lexiconScript: "ipa" | "roman" | "both";
  /** Theme selection. "system" follows prefers-color-scheme. */
  theme: "dark" | "light" | "system";
  /** Timeline display mode. "meanings" = one language, many meanings.
   *  "cognates" = one meaning, many languages. */
  timelineMode: "meanings" | "cognates" | "rules";
  /** Scrubber-selected generation for the timeline. null = follow live. */
  timelineScrubGeneration: number | null;
  /** Ring buffer of per-generation activity counts, capped at 200. */
  activityHistory: ActivityPoint[];
  history: HistoryByLangMeaning;
  seedFormsByMeaning: Record<Meaning, WordForm>;
  aiNeighbors: NeighborOverride;
  aiStatus: { ready: boolean; progress: number; text: string; error: string | null };
  step: () => void;
  stepN: (n: number) => void;
  stepNAsync: (n: number) => Promise<void>;
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
  patchConfigKey: <K extends keyof SimulationConfig>(
    key: K,
    patch: Partial<SimulationConfig[K]>,
  ) => void;
  setGenesisEnabled: (ruleId: string, enabled: boolean) => void;
  selectLanguage: (id: string | null) => void;
  selectMeaning: (m: Meaning | null) => void;
  toggleTimelineMeaning: (m: Meaning) => void;
  setLexiconFilter: (filter: "alive" | "all" | "starred" | "compare") => void;
  toggleStarredLang: (id: string) => void;
  toggleCompareLang: (id: string) => void;
  clearCompareLangs: () => void;
  setLexiconSearch: (q: string) => void;
  setLexiconScript: (s: "ipa" | "roman" | "both") => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  setTimelineMode: (mode: "meanings" | "cognates" | "rules") => void;
  setTimelineScrubGeneration: (g: number | null) => void;
  setSeed: (s: string) => void;
  randomiseSeed: () => void;
  applyRuleBiasToLanguage: (langId: string, bias: Record<string, number>) => void;
  loadConfig: (
    config: SimulationConfig,
    generationsToReplay?: number,
    stateSnapshot?: SimulationState,
  ) => void;
  enableAiNeighbors: () => Promise<void>;
  loadCachedAiNeighbors: () => Promise<void>;
  clearAiNeighbors: () => Promise<void>;
}

function initFromConfig(config: SimulationConfig) {
  const sim = createSimulation(config);
  const state = sim.getState();
  const seedForms: Record<Meaning, WordForm> = {};
  for (const m of Object.keys(config.seedLexicon)) seedForms[m] = config.seedLexicon[m]!.slice();
  const { next: history } = recordHistory({}, state);
  return { sim, state, seedForms, history };
}

// A short, pronounceable random seed like "l7jq2" — friendlier than a
// UUID and easy to share verbally.
function makeRandomSeed(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
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
  lexiconFilter: "alive",
  starredLangIds: [],
  compareLangIds: [],
  lexiconSearch: "",
  lexiconScript: "ipa",
  theme: "dark",
  timelineMode: "meanings",
  timelineScrubGeneration: null,
  activityHistory: [],
  history: initial.history,
  seedFormsByMeaning: initial.seedForms,
  aiNeighbors: {},
  aiStatus: { ready: false, progress: 0, text: "", error: null },
  step: () => {
    const { sim, history, activityHistory } = get();
    sim.step();
    const state = sim.getState();
    const { next: newHistory, changeCount } = recordHistory(history, state);
    set({
      state: { ...state },
      history: newHistory,
      activityHistory: recordActivity(
        activityHistory,
        state.generation,
        changeCount,
        countRuleBirthsAt(state, state.generation),
      ),
    });
  },
  stepN: (n) => {
    const s = get();
    for (let i = 0; i < n; i++) s.step();
  },
  stepNAsync: async (n) => {
    const { config, sim, history, activityHistory } = get();
    if (!config.useWorker) {
      get().stepN(n);
      return;
    }
    try {
      const { createEngineWorker } = await import("../engine/workerClient");
      const client = await createEngineWorker(config);
      if (!client) {
        get().stepN(n);
        return;
      }
      await client.restore(sim.getState());
      const nextState = await client.stepN(n);
      client.terminate();
      sim.restoreState(nextState);
      const { next: newHistory, changeCount } = recordHistory(history, nextState);
      set({
        state: { ...nextState },
        history: newHistory,
        activityHistory: recordActivity(
          activityHistory,
          nextState.generation,
          changeCount,
          countRuleBirthsAt(nextState, nextState.generation),
        ),
      });
    } catch {
      get().stepN(n);
    }
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
      activityHistory: [],
      seedFormsByMeaning: init.seedForms,
      selectedLangId: init.state.rootId,
      timelineScrubGeneration: null,
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
      activityHistory: [],
      seedFormsByMeaning: init.seedForms,
      selectedLangId: init.state.rootId,
      timelineScrubGeneration: null,
      playing: false,
    });
  },
  updateModes: (patch) => get().patchConfigKey("modes", patch),
  updatePhonology: (patch) => get().patchConfigKey("phonology", patch),
  updateTree: (patch) => get().patchConfigKey("tree", patch),
  updateGenesis: (patch) => get().patchConfigKey("genesis", patch),
  updateGrammar: (patch) => get().patchConfigKey("grammar", patch),
  updateSemantics: (patch) => get().patchConfigKey("semantics", patch),
  updateObsolescence: (patch) => get().patchConfigKey("obsolescence", patch),
  updateMorphologyRates: (patch) => get().patchConfigKey("morphology", patch),
  patchConfigKey: (key, patch) => {
    const { config, updateConfig } = get();
    const current = config[key];
    if (current && typeof current === "object") {
      updateConfig({ [key]: { ...(current as object), ...(patch as object) } } as Partial<SimulationConfig>);
    }
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
  setLexiconFilter: (filter) => set({ lexiconFilter: filter }),
  toggleStarredLang: (id) =>
    set((s) => {
      const has = s.starredLangIds.includes(id);
      return {
        starredLangIds: has
          ? s.starredLangIds.filter((x) => x !== id)
          : [...s.starredLangIds, id],
      };
    }),
  toggleCompareLang: (id) =>
    set((s) => {
      const has = s.compareLangIds.includes(id);
      return {
        compareLangIds: has
          ? s.compareLangIds.filter((x) => x !== id)
          : [...s.compareLangIds, id],
      };
    }),
  clearCompareLangs: () => set({ compareLangIds: [] }),
  setLexiconSearch: (q) => set({ lexiconSearch: q }),
  setLexiconScript: (s) => set({ lexiconScript: s }),
  setTheme: (theme) => set({ theme }),
  setTimelineMode: (timelineMode) => set({ timelineMode }),
  setTimelineScrubGeneration: (g) => set({ timelineScrubGeneration: g }),
  setSeed: (s) => {
    const { config, updateConfig } = get();
    updateConfig({ ...config, seed: s });
  },
  randomiseSeed: () => {
    const { config, updateConfig } = get();
    updateConfig({ ...config, seed: makeRandomSeed() });
  },
  applyRuleBiasToLanguage: (langId, bias) => {
    // Mutate the live sim state directly: ruleBias influences future
    // proposals but doesn't require a replay — the next step picks it up.
    const { sim } = get();
    const state = sim.getState();
    const node = state.tree[langId];
    if (!node) return;
    node.language.ruleBias = { ...(node.language.ruleBias ?? {}), ...bias };
    set({ state: { ...state } });
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
        timelineScrubGeneration: null,
        playing: false,
      });
      return;
    }
    set({
      config,
      sim: init.sim,
      state: init.state,
      history: init.history,
      activityHistory: [],
      seedFormsByMeaning: init.seedForms,
      selectedLangId: init.state.rootId,
      timelineScrubGeneration: null,
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
