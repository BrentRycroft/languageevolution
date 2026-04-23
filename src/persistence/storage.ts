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
    // quota or unavailable; silently skip
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
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
      // skip corrupt
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
  // Deterministic-ish ID: timestamp + hash of label/seed/generation. Avoids
  // a dependency on Math.random() for non-deterministic build environments.
  const now = Date.now();
  const hash = fnv1a(`${label}|${config.seed}|${generationsRun}|${now}`);
  const id = `run-${now.toString(36)}-${hash.toString(36).padStart(7, "0").slice(0, 7)}`;
  const run: SavedRun = {
    version: 5,
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
