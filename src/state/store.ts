import { create } from "zustand";
import type {
  SimulationConfig,
  SimulationState,
  Meaning,
  WordForm,
} from "../engine/types";
import { createSimulation, type Simulation } from "../engine/simulation";
import { defaultConfig } from "../engine/config";
import {
  recordHistory,
  recordActivity,
  countRuleBirthsAt,
  type HistoryByLangMeaning,
  type ActivityPoint,
} from "./history";
import { detectNewAchievements } from "../engine/achievements/detect";
import { makeRng } from "../engine/rng";
import { proposeOneRule } from "../engine/phonology/propose";
import {
  loadAutosave,
  saveAutosave,
  clearAutosave,
} from "../persistence/autosave";

export interface PersistenceNotice {
  kind: "quota" | "future-version" | "corrupt" | "migration-failed" | "save-error";
  message: string;
  shownAt: number;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

function fnv1aTinyHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

const ACHIEVEMENTS_KEY = "lev-achievements-v1";

function loadPersistedAchievements(): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function persistAchievements(ids: string[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(ids));
  } catch {
  }
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
  lexiconFilter: "alive" | "all" | "starred" | "compare";
  starredLangIds: string[];
  compareLangIds: string[];
  lexiconSearch: string;
  lexiconSort: "alpha" | "cluster" | "frequency" | "last-changed";
  lexiconGroupByCluster: boolean;
  displayScript: "ipa" | "roman" | "both";
  theme: "dark" | "light" | "system";
  timelineMode: "meanings" | "cognates" | "rules";
  timelineScrubGeneration: number | null;
  activityHistory: ActivityPoint[];
  history: HistoryByLangMeaning;
  seedFormsByMeaning: Record<Meaning, WordForm>;
  unlockedAchievements: string[];
  lastAchievement: string | null;
  persistenceNotice: PersistenceNotice | null;
  confirmDialog: ConfirmRequest | null;
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
  setLexiconSort: (sort: "alpha" | "cluster" | "frequency" | "last-changed") => void;
  setLexiconGroupByCluster: (group: boolean) => void;
  setDisplayScript: (s: "ipa" | "roman" | "both") => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  setTimelineMode: (mode: "meanings" | "cognates" | "rules") => void;
  setTimelineScrubGeneration: (g: number | null) => void;
  setSeed: (s: string) => void;
  randomiseSeed: () => void;
  applyRuleBiasToLanguage: (langId: string, bias: Record<string, number>) => void;
  dismissAchievementToast: () => void;
  dismissPersistenceNotice: () => void;
  setPersistenceNotice: (notice: PersistenceNotice) => void;
  showConfirm: (req: Omit<ConfirmRequest, "resolve">) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;
  clearAchievements: () => void;
  clearAutosave: () => void;
  loadConfig: (
    config: SimulationConfig,
    generationsToReplay?: number,
    stateSnapshot?: SimulationState,
  ) => void;
}

function initFromConfig(config: SimulationConfig) {
  const sim = createSimulation(config);
  const state = sim.getState();
  const seedForms: Record<Meaning, WordForm> = {};
  for (const m of Object.keys(config.seedLexicon)) seedForms[m] = config.seedLexicon[m]!.slice();
  const { next: history } = recordHistory({}, state);
  return { sim, state, seedForms, history };
}

function makeRandomSeed(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function bootState(): {
  config: SimulationConfig;
  sim: Simulation;
  state: SimulationState;
  history: HistoryByLangMeaning;
  seedForms: Record<Meaning, WordForm>;
  resumed: boolean;
  loadFailure?: PersistenceNotice;
} {
  const loaded = loadAutosave();
  let loadFailure: PersistenceNotice | undefined;
  if (loaded.ok) {
    const { sim, seedForms } = initFromConfig(loaded.payload.config);
    try {
      sim.restoreState(loaded.payload.state);
      const restored = sim.getState();
      const { next: rehydrated } = recordHistory({}, restored);
      return {
        config: loaded.payload.config,
        sim,
        state: restored,
        history: rehydrated,
        seedForms,
        resumed: true,
      };
    } catch {
      loadFailure = {
        kind: "corrupt",
        message: "Couldn't restore your last autosave; starting fresh.",
        shownAt: Date.now(),
      };
    }
  } else if (loaded.reason !== "empty") {
    const msg: Record<"corrupt" | "future-version" | "migration-failed", string> = {
      corrupt: "Your last autosave was corrupt; starting fresh.",
      "future-version":
        "Your last autosave was written by a newer build; starting fresh.",
      "migration-failed":
        "Your last autosave couldn't be migrated to the current schema; starting fresh.",
    };
    loadFailure = {
      kind: loaded.reason,
      message: msg[loaded.reason],
      shownAt: Date.now(),
    };
  }
  const cfg = defaultConfig();
  const fresh = initFromConfig(cfg);
  return {
    config: cfg,
    sim: fresh.sim,
    state: fresh.state,
    history: fresh.history,
    seedForms: fresh.seedForms,
    resumed: false,
    loadFailure,
  };
}

const booted = bootState();
const initialConfig = booted.config;
const initial = booted;

let lastQuotaWarnAt = 0;
const QUOTA_WARN_INTERVAL_MS = 60_000;

function tryAutosave(args: Parameters<typeof saveAutosave>): void {
  const run = () => {
    const result = saveAutosave(args[0], args[1]);
    if (result.ok) return;
    const now = Date.now();
    if (result.reason === "quota") {
      if (now - lastQuotaWarnAt < QUOTA_WARN_INTERVAL_MS) return;
      lastQuotaWarnAt = now;
      useSimStore.setState({
        persistenceNotice: {
          kind: "quota",
          message:
            "Storage is full — autosave can't write your latest progress. Free space in your browser or export a snapshot.",
          shownAt: now,
        },
      });
    } else if (result.reason === "other") {
      useSimStore.setState({
        persistenceNotice: {
          kind: "save-error",
          message: "Couldn't write the autosave — your latest progress isn't persisted.",
          shownAt: now,
        },
      });
    }
  };
  const ric = (globalThis as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === "function") {
    ric(run, { timeout: 1500 });
  } else {
    run();
  }
}

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
  lexiconSort: "alpha",
  lexiconGroupByCluster: false,
  displayScript: "ipa",
  theme: "dark",
  timelineMode: "meanings",
  timelineScrubGeneration: null,
  activityHistory: [],
  history: initial.history,
  seedFormsByMeaning: initial.seedForms,
  unlockedAchievements: loadPersistedAchievements(),
  lastAchievement: null,
  persistenceNotice: initial.loadFailure ?? null,
  confirmDialog: null,
  step: () => {
    const { sim, history, activityHistory, unlockedAchievements, config } = get();
    sim.step();
    const state = sim.getState();
    const { next: newHistory, changeCount } = recordHistory(history, state);
    const fresh = detectNewAchievements(new Set(unlockedAchievements), state);
    const nextUnlocked = fresh.length > 0
      ? [...unlockedAchievements, ...fresh]
      : unlockedAchievements;
    if (fresh.length > 0) persistAchievements(nextUnlocked);
    set({
      state: { ...state },
      history: newHistory,
      activityHistory: recordActivity(
        activityHistory,
        state.generation,
        changeCount,
        countRuleBirthsAt(state, state.generation),
      ),
      unlockedAchievements: nextUnlocked,
      lastAchievement: fresh[0] ?? get().lastAchievement,
    });
    tryAutosave([{ config, state, generationsRun: state.generation }]);
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
      const { unlockedAchievements } = get();
      const fresh = detectNewAchievements(new Set(unlockedAchievements), nextState);
      const nextUnlocked = fresh.length > 0
        ? [...unlockedAchievements, ...fresh]
        : unlockedAchievements;
      if (fresh.length > 0) persistAchievements(nextUnlocked);
      set({
        state: { ...nextState },
        history: newHistory,
        activityHistory: recordActivity(
          activityHistory,
          nextState.generation,
          changeCount,
          countRuleBirthsAt(nextState, nextState.generation),
        ),
        unlockedAchievements: nextUnlocked,
        lastAchievement: fresh[0] ?? get().lastAchievement,
      });
    } catch {
      get().stepN(n);
    }
  },
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (s) => set({ speed: s }),
  reset: () => {
    const { config } = get();
    const nextConfig = { ...config, seed: makeRandomSeed() };
    const init = initFromConfig(nextConfig);
    set({
      config: nextConfig,
      sim: init.sim,
      state: init.state,
      history: init.history,
      activityHistory: [],
      seedFormsByMeaning: init.seedForms,
      selectedLangId: init.state.rootId,
      timelineScrubGeneration: null,
      playing: false,
    });
    tryAutosave([
      { config: nextConfig, state: init.state, generationsRun: init.state.generation },
      { force: true },
    ]);
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
    tryAutosave([
      { config: next, state: init.state, generationsRun: init.state.generation },
      { force: true },
    ]);
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
  setLexiconSort: (lexiconSort) => set({ lexiconSort }),
  setLexiconGroupByCluster: (lexiconGroupByCluster) => set({ lexiconGroupByCluster }),
  setDisplayScript: (s) => set({ displayScript: s }),
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
    const { sim } = get();
    const state = sim.getState();
    const node = state.tree[langId];
    if (!node) return;
    node.language.ruleBias = { ...(node.language.ruleBias ?? {}), ...bias };
    try {
      const rng = makeRng(state.rngState ^ fnv1aTinyHash(langId));
      const rule = proposeOneRule(node.language, rng, state.generation);
      if (rule) {
        node.language.activeRules = node.language.activeRules ?? [];
        node.language.activeRules.push(rule);
        node.language.events.push({
          generation: state.generation,
          kind: "sound_change",
          description: `new sound law (bias): ${rule.description}`,
        });
      }
    } catch {
    }
    set({ state: { ...state, tree: { ...state.tree } } });
  },
  dismissAchievementToast: () => set({ lastAchievement: null }),
  dismissPersistenceNotice: () => set({ persistenceNotice: null }),
  setPersistenceNotice: (notice) => set({ persistenceNotice: notice }),
  showConfirm: (req) =>
    new Promise<boolean>((resolve) => {
      set({ confirmDialog: { ...req, resolve } });
    }),
  resolveConfirm: (ok) => {
    const { confirmDialog } = get();
    if (confirmDialog) {
      confirmDialog.resolve(ok);
      set({ confirmDialog: null });
    }
  },
  clearAchievements: () => {
    persistAchievements([]);
    set({ unlockedAchievements: [], lastAchievement: null });
  },
  loadConfig: (config, generationsToReplay, stateSnapshot) => {
    const init = initFromConfig(config);
    if (stateSnapshot) {
      init.sim.restoreState(stateSnapshot);
      const restored = init.sim.getState();
      set({
        config,
        sim: init.sim,
        state: restored,
        history: init.history,
        seedFormsByMeaning: init.seedForms,
        selectedLangId: restored.rootId,
        timelineScrubGeneration: null,
        playing: false,
      });
      tryAutosave([
        { config, state: restored, generationsRun: restored.generation },
        { force: true },
      ]);
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
    } else {
      tryAutosave([
        {
          config,
          state: init.state,
          generationsRun: init.state.generation,
        },
        { force: true },
      ]);
    }
  },
  clearAutosave: () => {
    clearAutosave();
  },
}));
