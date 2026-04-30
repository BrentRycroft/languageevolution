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
// Bumping the key forces every client to discard their old autosave on
// first load after a schema change. The "v2" suffix reflects PR 4's IPA
// rewrite of the presets: autosaves from the old PIE/Germanic/Bantu
// notation (ḱ ǵ m̥ þ ō ē á etc.) would otherwise rehydrate on top of
// the new engine and hide the updated lexicon. Increment when the
// seed/serialization semantics change in a user-visible way.
const AUTOSAVE_KEY = "lev.autosave.v2";
const AUTOSAVE_VERSION = 5;

interface AutosavePayload {
  version: number;
  savedAt: number;
  config: SimulationConfig;
  generationsRun: number;
  stateSnapshot: SimulationState;
}

/**
 * Discriminated result for autosave persistence operations. Lets the
 * caller distinguish a successful save from quota-exceeded / browser-
 * disabled storage so the UI can surface a notice instead of silently
 * dropping the user's progress.
 */
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
    // QuotaExceededError name varies across browsers (Safari, FF, Chrome
    // each used to differ); detect by name + code.
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
): StorageWriteResult {
  const now = Date.now();
  if (!opts.force && now - lastSaveAt < MIN_SAVE_INTERVAL_MS) {
    // Throttled — not a failure.
    return { ok: true };
  }
  lastSaveAt = now;
  const body: AutosavePayload = {
    version: AUTOSAVE_VERSION,
    savedAt: now,
    config: payload.config,
    generationsRun: payload.generationsRun,
    stateSnapshot: payload.state,
  };
  let serialized: string;
  try {
    serialized = JSON.stringify(body);
  } catch {
    // Stringify can fail on exotic cycles. Autosave is best-effort —
    // surface as a generic failure so the caller can decide whether
    // to warn the user.
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

/**
 * Discriminated load result. Lets the caller distinguish "nothing saved
 * yet" (empty) from "save was found but couldn't be loaded" (corrupt /
 * future-version / migration-failed). The UI surfaces non-empty
 * failures as a toast so the user knows their progress was lost
 * instead of silently re-booting from defaults.
 *
 * - `empty`            no autosave key in localStorage; clean boot.
 * - `corrupt`          payload didn't parse as JSON.
 * - `future-version`   payload's `version > AUTOSAVE_VERSION`. The
 *                      user's current build is older than the build
 *                      that wrote the save; we can't safely consume.
 * - `migration-failed` `migrateSavedRun` returned null or dropped the
 *                      stateSnapshot (e.g. unrecognised config shape).
 */
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
  // Wrap into the SavedRun shape so migrateSavedRun applies its
  // existing per-version upgrades. Autosave uses the same schema as
  // the Saved Runs list.
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
