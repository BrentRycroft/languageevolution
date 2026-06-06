import type { LexemeStore } from "../primitives";
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

/**
 * Reconcile the SWEPT set back into the store after sound change. `before` is the form-view that was
 * handed to the engine (the swept records); `after` is what the engine returned. For each id in
 * `before`: update its record's form from `after`, or DROP the record if it merged away (absent from
 * `after`). Records NOT in `before` (e.g. keyless words while they are not yet swept) are left
 * untouched. Records keep their point + gloss.
 */
export function mergeFormsIntoStore(
  store: LexemeStore,
  before: Record<string, WordForm>,
  after: Record<string, WordForm>,
): void {
  for (const id of Object.keys(before)) {
    if (id in after) store[id]!.form = after[id]!;
    else delete store[id];
  }
}
