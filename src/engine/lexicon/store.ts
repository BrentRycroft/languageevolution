import type { LexemeRecord, LexemeStore } from "../primitives";
import type { WordForm } from "../types";
import { lexPoint } from "../semantics/meaningPoint";

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
 *  the emergent nearest-anchor gloss). Excluded from the seam (`lexKeys` et al.). */
export function keylessRecords(store: LexemeStore): LexemeRecord[] {
  return Object.keys(store).filter((id) => store[id]!.gloss === undefined).map((id) => store[id]!);
}

/**
 * Back-compat load shim (store unification S1 task 5). Converts an OLD-shape language — a form-only
 * `lexicon: Record<LexemeId, WordForm>` (+ gloss→id `lexemeIds`) and a separate
 * `keylessLexemes: Record<id, {form, point}>` — into the canonical `lang.lexemes` record store, then
 * drops the legacy fields. No-op for new-shape saves (`lang.lexemes` already present). Seeded records
 * materialize their point from `lexPoint(gloss)` (the same value `rekeyLexiconToLexemeIds` bakes at
 * birth); keyless records carry over their stored point and stay gloss-less.
 */
export function migrateLexemeStore(lang: {
  lexemes?: LexemeStore;
  lexemeIds?: Record<string, string>;
  lexicon?: Record<string, WordForm>;
  keylessLexemes?: Record<string, { form: WordForm; point: number[] }>;
}): void {
  if (lang.lexemes) return;
  const store: LexemeStore = {};
  const idToGloss = new Map<string, string>();
  for (const gloss of Object.keys(lang.lexemeIds ?? {})) idToGloss.set(lang.lexemeIds![gloss]!, gloss);
  for (const id of Object.keys(lang.lexicon ?? {})) {
    const gloss = idToGloss.get(id);
    store[id] = { form: lang.lexicon![id]!, point: Array.from(lexPoint(gloss ?? id)), gloss };
  }
  for (const id of Object.keys(lang.keylessLexemes ?? {})) {
    store[id] = { form: lang.keylessLexemes![id]!.form, point: lang.keylessLexemes![id]!.point };
  }
  lang.lexemes = store;
  delete lang.lexicon;
  delete lang.keylessLexemes;
}

/** The satellite fields re-keyed gloss→LexemeId in storage step 5 (S2a: 14 maps; S4 adds meaningPoints). */
const SATELLITE_FIELDS = [
  "wordFrequencyHints", "lastChangeGeneration", "wordOrigin", "localNeighbors",
  "registerOf", "variants", "wordOriginChain", "colexifiedAs", "inflectionClass",
  "nounDeclensionClass", "ablautClassAssignment", "grammaticalizationStage",
  "suppletion", "etymology", "meaningPoints",
] as const;

/**
 * Back-compat (S2a): re-key OLD-shape gloss-keyed satellite maps to LexemeId. A key already present
 * in `lang.lexemes` (a record id) is left as-is, so this is a no-op for new saves and idempotent.
 * MINT-FREE — only a gloss that already has a minted id (in `lang.lexemeIds`) is moved; the value is
 * carried over verbatim (only the OUTER key changes — value arrays of glosses stay gloss-valued).
 * Deterministic: glosses processed in sorted order. Also used by test fixture builders that author
 * satellite data by gloss before id minting.
 */
export function migrateSatelliteMaps(lang: {
  lexemes?: Record<string, unknown>;
  lexemeIds?: Record<string, string>;
}): void {
  const rec = lang as unknown as Record<string, unknown>;
  for (const field of SATELLITE_FIELDS) {
    const map = rec[field] as Record<string, unknown> | undefined;
    if (!map) continue;
    const glossKeys = Object.keys(map)
      .filter((k) => !(lang.lexemes && k in lang.lexemes))
      .sort();
    for (const gloss of glossKeys) {
      const id = lang.lexemeIds?.[gloss];
      if (id && id !== gloss) {
        map[id] = map[gloss];
        delete map[gloss];
      }
    }
  }
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
