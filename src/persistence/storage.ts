import type { SavedRun, SimulationConfig, SimulationState } from "../engine/types";
import { migrateSavedRun } from "./migrate";
import { fnv1a } from "../engine/rng";
import { idbGet, idbKeys, idbRemove, idbSet } from "./idb";

const INDEX_KEY = "lev.runs.v1.index";
const RUN_KEY = (id: string) => `lev.runs.v1.${id}`;

/**
 * Phase 38+: saved-run storage migrated from localStorage to
 * IndexedDB. Each run can be 1-5MB on a mature 200-gen simulation;
 * three or four such runs blew past the localStorage quota and
 * triggered "Storage full" warnings on every save attempt.
 *
 * IDB stores values as structured-clone JS objects (not stringified),
 * so the JSON round-trip cost is also gone. A first-run migration in
 * `listRuns` copies legacy localStorage entries across.
 */

let migrationDone = false;

async function migrateLegacyRuns(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;
  if (typeof localStorage === "undefined") return;
  try {
    const rawIndex = localStorage.getItem(INDEX_KEY);
    if (!rawIndex) return;
    const ids: string[] = JSON.parse(rawIndex);
    for (const id of ids) {
      const rawRun = localStorage.getItem(RUN_KEY(id));
      if (!rawRun) continue;
      try {
        const parsed = JSON.parse(rawRun);
        await idbSet(RUN_KEY(id), parsed);
        localStorage.removeItem(RUN_KEY(id));
      } catch (e) {
        console.warn(`[persistence] failed to migrate run "${id}":`, e);
      }
    }
    await idbSet(INDEX_KEY, ids);
    localStorage.removeItem(INDEX_KEY);
  } catch (e) {
    console.warn(`[persistence] legacy run migration failed:`, e);
  }
}

async function readIndex(): Promise<string[]> {
  await migrateLegacyRuns();
  const raw = await idbGet(INDEX_KEY);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  return [];
}

async function writeIndex(ids: string[]): Promise<void> {
  await idbSet(INDEX_KEY, ids);
}

export async function listRuns(): Promise<SavedRun[]> {
  const ids = await readIndex();
  const runs: SavedRun[] = [];
  for (const id of ids) {
    const raw = await idbGet(RUN_KEY(id));
    if (!raw) continue;
    try {
      const migrated = migrateSavedRun(raw);
      if (migrated) runs.push(migrated);
    } catch (e) {
      console.warn(`[persistence] saved run "${id}" is corrupt:`, e);
    }
  }
  return runs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveRun(
  label: string,
  config: SimulationConfig,
  generationsRun: number,
  stateSnapshot?: SimulationState,
): Promise<SavedRun> {
  const now = Date.now();
  const hash = fnv1a(`${label}|${config.seed}|${generationsRun}|${now}`);
  const id = `run-${now.toString(36)}-${hash.toString(36).padStart(7, "0").slice(0, 7)}`;
  const run: SavedRun = {
    version: 8,
    id,
    label,
    createdAt: Date.now(),
    config,
    generationsRun,
    stateSnapshot,
  };
  await idbSet(RUN_KEY(id), run);
  const existing = await readIndex();
  const ids = Array.from(new Set([id, ...existing]));
  await writeIndex(ids);
  return run;
}

export async function deleteRun(id: string): Promise<void> {
  await idbRemove(RUN_KEY(id));
  const ids = (await readIndex()).filter((rid) => rid !== id);
  await writeIndex(ids);
}

export async function loadRun(id: string): Promise<SavedRun | null> {
  await migrateLegacyRuns();
  const raw = await idbGet(RUN_KEY(id));
  if (!raw) return null;
  try {
    return migrateSavedRun(raw);
  } catch (e) {
    console.warn(`[persistence] failed to load run "${id}":`, e);
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
  } catch (e) {
    console.warn(`[persistence] importRunJson failed to parse input:`, e);
    return null;
  }
}

let importCounter = 0;

export async function importAndSaveRun(text: string): Promise<SavedRun | null> {
  const parsed = importRunJson(text);
  if (!parsed) return null;
  const now = Date.now();
  const seq = ++importCounter;
  const hash = fnv1a(`import|${parsed.label}|${parsed.config.seed}|${now}|${seq}`);
  const id = `run-${now.toString(36)}-${seq.toString(36)}-${hash.toString(36).padStart(7, "0").slice(0, 7)}`;
  const run: SavedRun = { ...parsed, id, createdAt: now };
  await idbSet(RUN_KEY(id), run);
  const ids = Array.from(new Set([id, ...(await readIndex())]));
  await writeIndex(ids);
  return run;
}

/**
 * Test helper to reset the migration latch. Production code never
 * calls this — the migration is intended to run once per browser
 * session.
 */
export function _resetLegacyMigrationFlag(): void {
  migrationDone = false;
}

void idbKeys;
