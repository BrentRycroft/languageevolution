import type { SavedRun, SimulationConfig, SimulationState } from "../engine/types";
import { migrateSavedRun } from "./migrate";
import { fnv1a } from "../engine/rng";

const INDEX_KEY = "lev.runs.v1.index";
const RUN_KEY = (id: string) => `lev.runs.v1.${id}`;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
  }
}

export function listRuns(): SavedRun[] {
  const raw = safeGet(INDEX_KEY);
  if (!raw) return [];
  let ids: string[];
  try {
    ids = JSON.parse(raw);
  } catch {
    return [];
  }
  const runs: SavedRun[] = [];
  for (const id of ids) {
    const rawRun = safeGet(RUN_KEY(id));
    if (!rawRun) continue;
    try {
      const parsed = JSON.parse(rawRun);
      const migrated = migrateSavedRun(parsed);
      if (migrated) runs.push(migrated);
    } catch {
    }
  }
  return runs.sort((a, b) => b.createdAt - a.createdAt);
}

export function saveRun(
  label: string,
  config: SimulationConfig,
  generationsRun: number,
  stateSnapshot?: SimulationState,
): SavedRun {
  const now = Date.now();
  const hash = fnv1a(`${label}|${config.seed}|${generationsRun}|${now}`);
  const id = `run-${now.toString(36)}-${hash.toString(36).padStart(7, "0").slice(0, 7)}`;
  const run: SavedRun = {
    version: 6,
    id,
    label,
    createdAt: Date.now(),
    config,
    generationsRun,
    stateSnapshot,
  };
  safeSet(RUN_KEY(id), JSON.stringify(run));
  const existing = listRuns();
  const ids = Array.from(new Set([id, ...existing.map((r) => r.id)]));
  safeSet(INDEX_KEY, JSON.stringify(ids));
  return run;
}

export function deleteRun(id: string): void {
  safeRemove(RUN_KEY(id));
  const ids = listRuns()
    .map((r) => r.id)
    .filter((rid) => rid !== id);
  safeSet(INDEX_KEY, JSON.stringify(ids));
}

export function loadRun(id: string): SavedRun | null {
  const raw = safeGet(RUN_KEY(id));
  if (!raw) return null;
  try {
    return migrateSavedRun(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Serialize a SavedRun to a portable JSON string. Output is the run object
 * verbatim; importRun parses and runs it through migrateSavedRun so older
 * exports continue to load on newer schema versions.
 */
export function exportRun(run: SavedRun): string {
  return JSON.stringify(run, null, 2);
}

/**
 * Parse a JSON string previously produced by exportRun (or a savedRun
 * payload from another source). Returns null if the input is malformed
 * or fails migration.
 */
export function importRunJson(text: string): SavedRun | null {
  try {
    return migrateSavedRun(JSON.parse(text));
  } catch {
    return null;
  }
}

let importCounter = 0;

/**
 * Import a SavedRun + persist it under a fresh id (avoiding conflicts with
 * an existing run that shares the same id from a previous export).
 */
export function importAndSaveRun(text: string): SavedRun | null {
  const parsed = importRunJson(text);
  if (!parsed) return null;
  // Replace the id so multiple imports of the same exported file don't clash.
  // Add a per-process counter so two imports in the same millisecond still
  // get distinct ids.
  const now = Date.now();
  const seq = ++importCounter;
  const hash = fnv1a(`import|${parsed.label}|${parsed.config.seed}|${now}|${seq}`);
  const id = `run-${now.toString(36)}-${seq.toString(36)}-${hash.toString(36).padStart(7, "0").slice(0, 7)}`;
  const run: SavedRun = { ...parsed, id, createdAt: now };
  safeSet(RUN_KEY(id), JSON.stringify(run));
  const ids = Array.from(new Set([id, ...listRuns().map((r) => r.id)]));
  safeSet(INDEX_KEY, JSON.stringify(ids));
  return run;
}
