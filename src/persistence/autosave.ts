import type { Language, LanguageNode, LanguageTree, SimulationConfig, SimulationState } from "../engine/types";
import { LATEST_SAVE_VERSION, migrateSavedRun } from "./migrate";

const AUTOSAVE_KEY = "lev.autosave.v2";
// Phase 29-2f: tracks LATEST_SAVE_VERSION instead of being a separate
// drifting constant. Pre-29-2f this was hard-coded to 5 while
// LATEST_SAVE_VERSION was 6 — autosaves written at v6 silently
// failed the future-version check on load.
const AUTOSAVE_VERSION = LATEST_SAVE_VERSION;

// Phase 29 Tranche 5l: bumped from 30 → 80 to match the runtime cap
// (engine soft-limits events to ~80 per language). The prior 30
// silently truncated 60% of recent activity on save → reload, so the
// EventsLog after a reload showed only the last few generations.
const PERSIST_EVENT_CAP = 80;

function trimLanguageForPersist(lang: Language): Language {
  const events =
    lang.events.length > PERSIST_EVENT_CAP
      ? lang.events.slice(-PERSIST_EVENT_CAP)
      : lang.events;
  // Phase 29 Tranche 5l: stop stripping `variants` and `bilingualLinks`
  // on save. Pre-fix, social-contagion variant history and contact
  // graphs were silently lost on every reload — no reload could
  // resume the in-progress diffusion of an actuating variant. Both
  // are bounded structures (variants caps at ~10/meaning, links
  // bounded by adjacent leaves), so persisting them costs little.
  return { ...lang, events };
}

function trimStateForPersist(state: SimulationState): SimulationState {
  const tree: LanguageTree = {};
  for (const id of Object.keys(state.tree)) {
    const node = state.tree[id]!;
    const trimmedNode: LanguageNode = {
      ...node,
      language: trimLanguageForPersist(node.language),
    };
    tree[id] = trimmedNode;
  }
  const trimmed: SimulationState = {
    generation: state.generation,
    tree,
    rootId: state.rootId,
    rngState: state.rngState,
    generationsOverCap: state.generationsOverCap,
  };
  return trimmed;
}

interface AutosavePayload {
  version: number;
  savedAt: number;
  config: SimulationConfig;
  generationsRun: number;
  stateSnapshot: SimulationState;
}

export type StorageWriteResult =
  | { ok: true }
  | { ok: false; reason: "quota" | "disabled" | "other" };

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch (e) {
    // Phase 29-2e: was silent. Surface autosave-read failures so the
    // user/dev can tell when localStorage is disabled (private mode,
    // browser quota), or when a chunk is malformed.
    console.warn(`[autosave] safeGet(${key}) failed:`, e);
    return null;
  }
}

function safeSet(key: string, value: string): StorageWriteResult {
  if (typeof localStorage === "undefined") {
    return { ok: false, reason: "disabled" };
  }
  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    const code = (e as { code?: number })?.code ?? -1;
    const isQuota =
      name === "QuotaExceededError" ||
      name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      code === 22 ||
      code === 1014;
    return { ok: false, reason: isQuota ? "quota" : "other" };
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`[autosave] safeRemove(${key}) failed:`, e);
  }
}

let lastSaveAt = 0;
const MIN_SAVE_INTERVAL_MS = 500;

export function saveAutosave(
  payload: {
    config: SimulationConfig;
    state: SimulationState;
    generationsRun: number;
  },
  opts: { force?: boolean } = {},
): StorageWriteResult {
  const now = Date.now();
  if (!opts.force && now - lastSaveAt < MIN_SAVE_INTERVAL_MS) {
    return { ok: true };
  }
  lastSaveAt = now;
  const body: AutosavePayload = {
    version: AUTOSAVE_VERSION,
    savedAt: now,
    config: payload.config,
    generationsRun: payload.generationsRun,
    stateSnapshot: trimStateForPersist(payload.state),
  };
  let serialized: string;
  try {
    serialized = JSON.stringify(body);
  } catch (e) {
    console.warn(`[autosave] JSON.stringify failed (likely circular ref):`, e);
    return { ok: false, reason: "other" };
  }
  return safeSet(AUTOSAVE_KEY, serialized);
}

export interface AutosaveLoaded {
  config: SimulationConfig;
  state: SimulationState;
  generationsRun: number;
  savedAt: number;
}

export type AutosaveLoadResult =
  | { ok: true; payload: AutosaveLoaded }
  | { ok: false; reason: "empty" | "corrupt" | "future-version" | "migration-failed" };

export function loadAutosave(): AutosaveLoadResult {
  const raw = safeGet(AUTOSAVE_KEY);
  if (!raw) return { ok: false, reason: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(`[autosave] saved payload is not valid JSON:`, e);
    return { ok: false, reason: "corrupt" };
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const ver = typeof obj.version === "number" ? obj.version : 1;
  if (ver > AUTOSAVE_VERSION) {
    return { ok: false, reason: "future-version" };
  }
  const migrated = migrateSavedRun({
    version: ver,
    id: "autosave",
    label: "autosave",
    createdAt: typeof obj.savedAt === "number" ? obj.savedAt : 0,
    config: obj.config,
    generationsRun: typeof obj.generationsRun === "number" ? obj.generationsRun : 0,
    stateSnapshot: obj.stateSnapshot,
  });
  if (!migrated || !migrated.stateSnapshot) {
    return { ok: false, reason: "migration-failed" };
  }
  return {
    ok: true,
    payload: {
      config: migrated.config,
      state: migrated.stateSnapshot,
      generationsRun: migrated.generationsRun,
      savedAt: typeof obj.savedAt === "number" ? obj.savedAt : 0,
    },
  };
}

export function clearAutosave(): void {
  safeRemove(AUTOSAVE_KEY);
  lastSaveAt = 0;
}
