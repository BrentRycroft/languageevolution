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

/**
 * Persistence-layer notice rendered by the toast UI. Each `kind`
 * corresponds to a discrete failure or warning the user should know
 * about — autosave couldn't write because storage is full, an old
 * snapshot was rejected because it was authored by a future build,
 * etc. The store exposes `setPersistenceNotice` /
 * `dismissPersistenceNotice` for UI surfacing.
 */
export interface PersistenceNotice {
  kind: "quota" | "future-version" | "corrupt" | "migration-failed" | "save-error";
  message: string;
  /** Generation timestamp (in ms) so consecutive identical notices
   *  don't suppress; the toast component keys on this. */
  shownAt: number;
}

/**
 * Pending confirm-dialog request. Stored as a single record on the
 * store rather than per-component so any caller in any component can
 * trigger the global dialog without threading a hook through the
 * tree. The Promise resolver is captured here so the resolver in
 * the caller's `await showConfirm(...)` fires when the user clicks
 * Confirm or Cancel.
 */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** When true, the confirm button styles as `danger` (destructive
   *  action — delete, reset, etc.). Default `false`. */
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * Tiny FNV-1a hash for mixing a language id into a numeric RNG seed.
 * Used by applyRuleBiasToLanguage so every language gets a deterministic
 * but distinct sub-seed when proposing an immediate post-bias rule.
 */
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
    // best-effort persistence
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
  /** Lexicon visibility filter: "alive" (default), "all", "starred", "compare". */
  lexiconFilter: "alive" | "all" | "starred" | "compare";
  /** Set of language ids the user has bookmarked. */
  starredLangIds: string[];
  /** Language ids checked in the "compare" filter mode. */
  compareLangIds: string[];
  /** Substring search over meanings in the lexicon view. */
  lexiconSearch: string;
  /** Lexicon row sort key. */
  lexiconSort: "alpha" | "cluster" | "frequency" | "last-changed";
  /** When true, rows are grouped by cluster with a header row per cluster. */
  lexiconGroupByCluster: boolean;
  /** Script mode for the Lexicon view: phonemic (IPA) / orthographic / both. */
  displayScript: "ipa" | "roman" | "both";
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
  /** Ids of procedural-engine achievements unlocked across this session. */
  unlockedAchievements: string[];
  /** Most recently unlocked achievement id, for the toast. null = dismissed. */
  lastAchievement: string | null;
  /** Most recent persistence-layer notice (autosave quota / migration
   *  failure / corrupt save / future-version). The PersistenceToast
   *  component renders this; `dismissPersistenceNotice` clears it.
   *  Distinct from the achievement toast so a single user action
   *  doesn't accidentally clear the other. */
  persistenceNotice: PersistenceNotice | null;
  /** Pending confirm-dialog request, or null when no dialog is open.
   *  See `ConfirmRequest`. The single `<ConfirmDialog />` in App.tsx
   *  reads this; resolved via `resolveConfirm`. */
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
  /** Open a confirm dialog. Resolves to `true` on confirm,
   *  `false` on cancel / Escape / backdrop click. */
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

/**
 * Boot-time state: if an autosave exists, rehydrate it so the user's
 * progress survives reloads (including reloads caused by a WebLLM chunk
 * failure or SW misroute). Otherwise start fresh from defaultConfig.
 */
function bootState(): {
  config: SimulationConfig;
  sim: Simulation;
  state: SimulationState;
  history: HistoryByLangMeaning;
  seedForms: Record<Meaning, WordForm>;
  resumed: boolean;
  /** When boot fell back to defaults despite an autosave existing,
   *  carries the load-failure reason so the UI can surface a toast. */
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
      // Restoration failed AFTER a successful migrate — the snapshot
      // shape parsed but the engine couldn't rehydrate it. Surface as
      // a corrupt notice and fall through to fresh boot.
      loadFailure = {
        kind: "corrupt",
        message: "Couldn't restore your last autosave; starting fresh.",
        shownAt: Date.now(),
      };
    }
  } else if (loaded.reason !== "empty") {
    // Distinct messages per failure mode so the user understands
    // exactly what happened — silent loss is the bug we're fixing.
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

/**
 * Throttle quota-exceeded warnings so we don't spam a toast on every
 * step once `localStorage` fills up. One warning per minute is plenty
 * to signal to the user; the autosave best-effort path keeps trying
 * (and may succeed if the user clears space).
 */
let lastQuotaWarnAt = 0;
const QUOTA_WARN_INTERVAL_MS = 60_000;

/**
 * Wraps `saveAutosave` so a quota or stringify failure surfaces a
 * persistence notice in the store instead of silently dropping the
 * write. Throttled per `QUOTA_WARN_INTERVAL_MS` so a full localStorage
 * doesn't spam one toast per step.
 *
 * On modern browsers, autosave may also be deferred to the next idle
 * callback to avoid serializing the entire SimulationState on the
 * step path. The save itself stays synchronous when `requestIdleCallback`
 * isn't available (Safari < 16, JSDOM, …).
 */
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
    // `disabled` is silent — the user has localStorage off; spamming
    // them about it isn't useful.
  };
  // Defer off the step path when available so a 200-leaf state's
  // ~MB of JSON.stringify doesn't land on the render frame.
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
    // Throttled autosave so the running simulation survives an
    // accidental reload (or a WebLLM chunk-load failure). Saved every
    // MIN_SAVE_INTERVAL_MS at most — no-op during fast playback.
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
    // PR C: every reset rolls a fresh seed by default — most users
    // expect "reset" to mean "give me a new run", not "redo the same
    // run". Hold the same seed by editing it manually before reset.
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
    // Overwrite autosave with the fresh state so a page reload after a
    // reset doesn't resurrect the old simulation.
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
    // Bias lives on the language and is read by the procedural proposer
    // each generation. We mutate the engine's state directly (the engine
    // treats its state as owned-mutable inside step()), then hand React a
    // fresh top-level wrapper so selectors re-run.
    //
    // We also fire a one-off rule proposal right away so the user sees
    // an immediate effect. Previously this was async (dynamic import +
    // separately-seeded Rng) which (a) raced with concurrent set() calls
    // and (b) broke export/import determinism. Now we use the engine's
    // current rngState directly so the proposal sits on the deterministic
    // RNG stream — the same proposal would have fired had the user
    // exported, then re-imported and stepped to the same generation.
    const { sim } = get();
    const state = sim.getState();
    const node = state.tree[langId];
    if (!node) return;
    node.language.ruleBias = { ...(node.language.ruleBias ?? {}), ...bias };
    try {
      // makeRng accepts a number; consume one tick from the live state so
      // the proposal advances rngState predictably from the user's seed.
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
      // non-fatal — bias still takes effect for the next cadence.
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
      // Loading an explicit save/run replaces the autosave slot so a
      // subsequent reload resumes where the user just landed.
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
  /**
   * Hard-reset: drop the autosave entirely so the next mount starts
   * from defaultConfig. Exposed for the "Start over" UI affordance we
   * may add later; not called by any normal reset path.
   */
  clearAutosave: () => {
    clearAutosave();
  },
}));
