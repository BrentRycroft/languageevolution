import type { SimulationConfig, SimulationState } from "../engine/types";
import { migrateSavedRun } from "./migrate";

/**
 * Autosave stores *only one* state — the most recent in-progress
 * simulation — under a fixed key, so a page reload (accidental or from
 * a chunk-load failure) doesn't wipe the user's progress. It's separate
 * from the user-triggered "Saved Runs" index in `storage.ts`: those
 * have labels, appear in the UI list, and are retained indefinitely.
 * The autosave is invisible and overwritten on every step.
 */
const AUTOSAVE_KEY = "lev.autosave.v1";
const AUTOSAVE_VERSION = 4;

interface AutosavePayload {
  version: number;
  savedAt: number;
  config: SimulationConfig;
  generationsRun: number;
  stateSnapshot: SimulationState;
}

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    // quota or unavailable; silently skip so the running sim isn't
    // disturbed by storage pressure.
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

let lastSaveAt = 0;
const MIN_SAVE_INTERVAL_MS = 500;

/**
 * Persist the running sim. Throttled to at most one write per
 * `MIN_SAVE_INTERVAL_MS`; the throttle only drops writes, so the very
 * next call after the interval will succeed. This keeps the fast path
 * off the render frame during Playback mode without losing more than
 * half a second of progress on reload.
 *
 * Pass `{ force: true }` from explicit actions (reset, preset switch,
 * manual save) to bypass the throttle.
 */
export function saveAutosave(
  payload: {
    config: SimulationConfig;
    state: SimulationState;
    generationsRun: number;
  },
  opts: { force?: boolean } = {},
): void {
  const now = Date.now();
  if (!opts.force && now - lastSaveAt < MIN_SAVE_INTERVAL_MS) return;
  lastSaveAt = now;
  const body: AutosavePayload = {
    version: AUTOSAVE_VERSION,
    savedAt: now,
    config: payload.config,
    generationsRun: payload.generationsRun,
    stateSnapshot: payload.state,
  };
  try {
    safeSet(AUTOSAVE_KEY, JSON.stringify(body));
  } catch {
    // Stringify can fail on exotic cycles; autosave is best-effort so
    // swallow.
  }
}

export interface AutosaveLoaded {
  config: SimulationConfig;
  state: SimulationState;
  generationsRun: number;
  savedAt: number;
}

/**
 * Read the autosave from localStorage, running the `migrateSavedRun`
 * upgrade path so older saves still work. Returns null if nothing is
 * stored, the payload is corrupt, or the migration drops the snapshot.
 */
export function loadAutosave(): AutosaveLoaded | null {
  const raw = safeGet(AUTOSAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Wrap into the SavedRun shape so migrateSavedRun applies its
    // existing per-version upgrades. Autosave uses the same schema as
    // the Saved Runs list.
    const migrated = migrateSavedRun({
      version: parsed.version ?? 1,
      id: "autosave",
      label: "autosave",
      createdAt: parsed.savedAt ?? 0,
      config: parsed.config,
      generationsRun: parsed.generationsRun ?? 0,
      stateSnapshot: parsed.stateSnapshot,
    });
    if (!migrated || !migrated.stateSnapshot) return null;
    return {
      config: migrated.config,
      state: migrated.stateSnapshot,
      generationsRun: migrated.generationsRun,
      savedAt: parsed.savedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  safeRemove(AUTOSAVE_KEY);
  lastSaveAt = 0;
}
