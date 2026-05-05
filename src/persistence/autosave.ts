import type { Language, LanguageNode, LanguageTree, SimulationConfig, SimulationState } from "../engine/types";
import { LATEST_SAVE_VERSION, migrateSavedRun } from "./migrate";
import { idbGet, idbSet, idbRemove, type IdbWriteResult } from "./idb";

const AUTOSAVE_KEY = "lev.autosave.v2";
const AUTOSAVE_VERSION = LATEST_SAVE_VERSION;

const PERSIST_EVENT_CAP = 80;

function trimLanguageForPersist(lang: Language): Language {
  const events =
    lang.events.length > PERSIST_EVENT_CAP
      ? lang.events.slice(-PERSIST_EVENT_CAP)
      : lang.events;
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

export type StorageWriteResult = IdbWriteResult;

let lastSaveAt = 0;
const MIN_SAVE_INTERVAL_MS = 500;

/**
 * Phase 38+: autosave migrated from localStorage to IndexedDB. The
 * 5MB localStorage quota was the source of recurring "Storage full"
 * warnings on mature runs (Phase 38g amplified lexicon growth).
 * IDB has multi-GB quota and supports structured clone, so the
 * payload is stored as a JS object directly (no JSON round-trip).
 */
export async function saveAutosave(
  payload: {
    config: SimulationConfig;
    state: SimulationState;
    generationsRun: number;
  },
  opts: { force?: boolean } = {},
): Promise<StorageWriteResult> {
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
  return idbSet(AUTOSAVE_KEY, body);
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

export async function loadAutosave(): Promise<AutosaveLoadResult> {
  // Phase 38+ first-run migration: if IDB has nothing but the legacy
  // localStorage entry exists, copy it across before falling through.
  let raw = await idbGet(AUTOSAVE_KEY);
  if (raw === null && typeof localStorage !== "undefined") {
    try {
      const legacy = localStorage.getItem(AUTOSAVE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        await idbSet(AUTOSAVE_KEY, parsed);
        // Free up localStorage so future saves don't re-collide.
        localStorage.removeItem(AUTOSAVE_KEY);
        raw = parsed;
      }
    } catch (e) {
      console.warn(`[autosave] localStorage → IDB migration failed:`, e);
    }
  }
  if (raw === null) return { ok: false, reason: "empty" };
  const obj = (raw ?? {}) as Record<string, unknown>;
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

export async function clearAutosave(): Promise<void> {
  await idbRemove(AUTOSAVE_KEY);
  lastSaveAt = 0;
}
