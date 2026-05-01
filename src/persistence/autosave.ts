import type { Language, LanguageNode, LanguageTree, SimulationConfig, SimulationState } from "../engine/types";
import { migrateSavedRun } from "./migrate";

const AUTOSAVE_KEY = "lev.autosave.v2";
const AUTOSAVE_VERSION = 5;

const PERSIST_EVENT_CAP = 30;

function trimLanguageForPersist(lang: Language): Language {
  const events =
    lang.events.length > PERSIST_EVENT_CAP
      ? lang.events.slice(-PERSIST_EVENT_CAP)
      : lang.events;
  const out: Language = { ...lang, events };
  delete (out as Partial<Language>).variants;
  delete (out as Partial<Language>).bilingualLinks;
  return out;
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
