import type { LexemeRecord, LexemeStore } from "../primitives";
import type { WordForm } from "../types";

/**
 * store.ts — low-level primitives for the canonical lexeme record store (`lang.lexemes`).
 *
 * The sound-change ENGINE (phonology/apply.ts, stratal) stays form-only: callers project a
 * `Record<LexemeId, WordForm>` form-view out of the store, run sound change, then merge the
 * resulting forms back into the records (preserving each record's point + gloss). These helpers
 * are deliberately gloss-agnostic — gloss resolution lives in lexemeIdentity.ts / the seam.
 */

/** The current form for a store key, or undefined. */
export function recordForm(store: LexemeStore, id: string): WordForm | undefined {
  return store[id]?.form;
}

/** Replace a record's form in place, preserving its point + gloss. No-op if the id is absent. */
export function setRecordForm(store: LexemeStore, id: string, form: WordForm): void {
  const rec = store[id];
  if (rec) rec.form = form;
}

/** Project a forms-only view (LexemeId -> form) of ALL records, for the sound-change engine. */
export function formViewOf(store: LexemeStore): Record<string, WordForm> {
  const out: Record<string, WordForm> = {};
  for (const id of Object.keys(store)) out[id] = store[id]!.form;
  return out;
}

/**
 * Like formViewOf but SEEDED-only (records carrying a `gloss`); keyless (gloss-less) records are
 * excluded. This is the projection the phonology step uses while keyless words are NOT yet swept
 * (S1 tasks 2-3); task 4 switches the step to `formViewOf` to make keyless first-class. The
 * project→sweep→merge cycle only ever touches the records present in the view it was given, so the
 * choice of view is the single gate for "do keyless words evolve".
 */
export function seededFormViewOf(store: LexemeStore): Record<string, WordForm> {
  const out: Record<string, WordForm> = {};
  for (const id of Object.keys(store)) if (store[id]!.gloss !== undefined) out[id] = store[id]!.form;
  return out;
}

/** The KEYLESS records of the store — point-native lexemes with no concept/gloss key (their label is
 *  the emergent nearest-anchor gloss). Excluded from the seam (`lexKeys` et al.) and, until task 4,
 *  from the sound-change sweep. */
export function keylessRecords(store: LexemeStore): LexemeRecord[] {
  return Object.keys(store).filter((id) => store[id]!.gloss === undefined).map((id) => store[id]!);
}

/**
 * Reconcile the SWEPT set back into the store after sound change. `before` is the form-view that was
 * handed to the engine (the swept records); `after` is what the engine returned. The swept records
 * are rebuilt in `after`'s KEY ORDER (updating each form, preserving its point + gloss; records that
 * merged away — absent from `after` — are dropped); records NOT in `before` (e.g. keyless words while
 * they are not yet swept) keep their forms and are re-appended after the swept set.
 *
 * Rebuilding in `after`'s order (rather than updating in place) is required for byte-identity with the
 * legacy whole-store replacement `lang.lexicon = applyChangesToLexicon(...)`: apply.ts returns its
 * store in `orderedLexemeIds` (gloss-sorted) order, and several `lexKeys`-by-index RNG sites depend on
 * that order. An in-place update would leave the store in birth-insertion order and perturb the
 * trajectory from the first phonology step on.
 */
export function mergeFormsIntoStore(
  store: LexemeStore,
  before: Record<string, WordForm>,
  after: Record<string, WordForm>,
): void {
  // Snapshot each swept record's identity (point + gloss) and the untouched (non-swept) records.
  const sweptMeta = new Map<string, LexemeRecord>();
  for (const id of Object.keys(before)) {
    const r = store[id];
    if (r) sweptMeta.set(id, r);
  }
  const untouched: Array<[string, LexemeRecord]> = [];
  for (const id of Object.keys(store)) {
    if (!(id in before)) untouched.push([id, store[id]!]);
  }
  // Rebuild: swept records in `after`'s key order, then the untouched records.
  for (const id of Object.keys(store)) delete store[id];
  for (const id of Object.keys(after)) {
    const r = sweptMeta.get(id);
    store[id] = r ? { form: after[id]!, point: r.point, gloss: r.gloss } : { form: after[id]!, point: [] };
  }
  for (const [id, rec] of untouched) store[id] = rec;
}
