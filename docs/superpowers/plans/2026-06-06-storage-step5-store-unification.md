# Lexeme Store Unification (Storage Step 5 · Sub-project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split-brain lexeme storage (`lang.lexicon: Record<LexemeId, WordForm>` + `lang.keylessLexemes`) with one canonical point-native record store `lang.lexemes: Record<LexemeId, { form; point; gloss? }>`, and make keyless words first-class for the sound-change sweep + emergent gloss.

**Architecture:** `lang.lexemes` is the single store. The accessor seam (`access.ts`) keeps its gloss-in/form-out API so the ~381 call sites don't move. The sound-change ENGINE (`phonology/apply.ts`, stratal) stays form-only: the phonology STEP projects a `Record<LexemeId, WordForm>` form-view out of `lang.lexemes`, runs sound change, and merges the new forms back into the records. Keyless words (records without a `gloss`) are appended after the gloss-sorted seeded words in the RNG order contract, so they evolve; their gloss is resolved emergently (`glossOf(point)`) where the engine needs one.

**Tech Stack:** TypeScript, Vitest. Determinism is sacred: no `Math.random` in `src/engine`; the seeded `Rng`; the per-word content-addressed sub-rng in `apply.ts` is keyed by `LexemeId`. Test tiers: FAST `npx vitest run --dir src`; heavy trajectory tests gated by `RUN_SLOW=1` (`meaning_layer_baseline`, `keyless_coinage_loop`). ALWAYS scope with `--dir src` (the repo has sibling worktrees under `.claude/worktrees/*` that vitest will otherwise collect).

**Spec:** `docs/superpowers/specs/2026-06-06-storage-step5-store-unification-design.md`.

---

## File Structure

**New:**
- `src/engine/lexicon/store.ts` — the `lang.lexemes` record primitives + form-view/merge helpers. One responsibility: low-level record store access (no gloss logic beyond what callers pass).
- `src/engine/__tests__/lexeme_store.test.ts` — unit tests for the store primitives + form-view + order contract.

**Modified:**
- `src/engine/primitives.ts` — add `LexemeRecord`; (keep `Lexicon = Record<Meaning, WordForm>` as the form-view type name).
- `src/engine/types.ts` — `Language.lexemes`; remove `Language.lexicon` and `Language.keylessLexemes`.
- `src/engine/domains.ts` — `LexiconState` Pick: `lexicon` → `lexemes`.
- `src/engine/lexicon/access.ts` — seam over `lang.lexemes`.
- `src/engine/lexicon/lexemeIdentity.ts` — `rekeyLexiconToLexemeIds` builds records (materialized points); `orderedLexemeIds`/`orderedLexiconKeys`/`buildLexemeIdToGloss` handle keyless; `coinKeylessLexeme` writes a record.
- `src/engine/genesis/semanticGap.ts` — `findSemanticGap`/`coinKeylessForGap` read keyless from `lang.lexemes`.
- `src/engine/steps/phonology.ts` — project form-view / merge back instead of mutating `lang.lexicon`.
- `src/engine/phonology/stratal.ts` — UR snapshot from the form-view.
- `src/engine/utils/clone.ts` — clone `lang.lexemes`; drop `keylessLexemes` branch.
- `src/engine/steps/init.ts` — birth path (rekey already called at line 241).
- `src/engine/__tests__/meaning_layer_baseline.test.ts` — re-bake GENN in Task 4.
- `src/engine/__tests__/keyless_coinage_loop.test.ts` — extend in Task 5 (keyless forms evolve).
- ~12 test files with direct `lang.lexicon[...]` references — mechanical updates in Task 2 (exact list in Task 2).

---

## Task 1: `LexemeRecord` type + store primitives (additive, green)

Introduce the record type and a focused store module with primitives + the form-view/merge bridge. NOT yet wired as canonical — `lang.lexemes` is unused until Task 2, so this is purely additive and byte-identical.

**Files:**
- Modify: `src/engine/primitives.ts`
- Create: `src/engine/lexicon/store.ts`
- Create: `src/engine/__tests__/lexeme_store.test.ts`

- [ ] **Step 1: Add the record type to `primitives.ts`**

After the existing `export type Lexicon = Record<Meaning, WordForm>;` (line 12), add:

```ts
/**
 * A point-native lexeme record (store unification, step 5 S1). One entry per lexeme:
 *   - form:  current surface form.
 *   - point: meaning position (fixed-point ints as number[], clone/JSON friendly).
 *   - gloss: present for seeded/concept-coined lexemes; ABSENT for keyless lexemes
 *            (coined into an empty region — meaning is the point, label is emergent).
 */
export interface LexemeRecord {
  form: WordForm;
  point: number[];
  gloss?: Meaning;
}

/** The canonical lexeme store: LexemeId -> record. Replaces the form-only Lexicon + keylessLexemes. */
export type LexemeStore = Record<string, LexemeRecord>;
```

(Confirm `Meaning` and `WordForm` are already imported/defined in `primitives.ts`; they are — `Lexicon` uses both.)

- [ ] **Step 2: Write the failing test for the store primitives**

Create `src/engine/__tests__/lexeme_store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  recordForm, setRecordForm, formViewOf, seededFormViewOf, mergeFormsIntoStore,
} from "../lexicon/store";
import type { LexemeStore } from "../primitives";

describe("lexeme store primitives", () => {
  it("reads a record's form", () => {
    const store: LexemeStore = { "id-1": { form: ["a", "b"], point: [1, 2], gloss: "water" } };
    expect(recordForm(store, "id-1")).toEqual(["a", "b"]);
    expect(recordForm(store, "missing")).toBeUndefined();
  });

  it("setRecordForm updates form in place, preserving point + gloss", () => {
    const store: LexemeStore = { "id-1": { form: ["a"], point: [1], gloss: "water" } };
    setRecordForm(store, "id-1", ["x", "y"]);
    expect(store["id-1"]).toEqual({ form: ["x", "y"], point: [1], gloss: "water" });
  });

  it("formViewOf projects ALL records' forms; seededFormViewOf excludes keyless (no gloss)", () => {
    const store: LexemeStore = {
      "id-1": { form: ["a"], point: [1], gloss: "water" },
      "id-2": { form: ["b"], point: [2] }, // keyless
    };
    expect(formViewOf(store)).toEqual({ "id-1": ["a"], "id-2": ["b"] });
    expect(seededFormViewOf(store)).toEqual({ "id-1": ["a"] }); // keyless excluded
  });

  it("mergeFormsIntoStore reconciles ONLY the swept set: updates forms, drops merged-away, leaves the rest", () => {
    const store: LexemeStore = {
      "id-1": { form: ["a"], point: [1], gloss: "water" },
      "id-2": { form: ["b"], point: [2], gloss: "fire" },
      "id-3": { form: ["c"], point: [3] }, // keyless — NOT in the swept view, must survive untouched
    };
    const before = { "id-1": ["a"], "id-2": ["b"] }; // the swept view
    mergeFormsIntoStore(store, before, { "id-1": ["a", "a"] }); // id-2 merged away during sound change
    expect(store["id-1"]).toEqual({ form: ["a", "a"], point: [1], gloss: "water" });
    expect(store["id-2"]).toBeUndefined();
    expect(store["id-3"]).toEqual({ form: ["c"], point: [3] });
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `npx vitest run --dir src src/engine/__tests__/lexeme_store.test.ts`
Expected: FAIL — `store.ts` / its exports don't exist.

- [ ] **Step 4: Implement `store.ts`**

Create `src/engine/lexicon/store.ts`:

```ts
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
```

- [ ] **Step 5: Run the test, confirm it passes**

Run: `npx vitest run --dir src src/engine/__tests__/lexeme_store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```
git add src/engine/primitives.ts src/engine/lexicon/store.ts src/engine/__tests__/lexeme_store.test.ts
git commit -m "feat(storage): LexemeRecord type + lexeme-store primitives (S1 task 1, additive)"
```
(End every commit message with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.)

---

## Task 2: Cut seeded words over to `lang.lexemes` (remove `lang.lexicon`)

> **CORRECTIONS discovered during execution (2026-06-06):**
> 1. **Task 2 must KEEP `lang.keylessLexemes`.** Removing it here (original Step 3) breaks `coinKeylessLexeme` / `findSemanticGap` / the keyless tests at the type level — those are migrated in Task 3. So Task 2 removes ONLY `lang.lexicon`; Task 3 removes `keylessLexemes`.
> 2. **Blast radius is ~70 files, not ~12.** `grep -c` shows **64 test files + presets** author `lexicon: { gloss: form }` literals (each via a local `makeLang`/`testLang` that casts the object `as unknown as Language` / `as Language` and then calls `rekeyLexiconToLexemeIds`). The rename is therefore tsc-driven: change the field in `types.ts`/`domains.ts`, run `npx tsc --noEmit`, and fix every reported site. Authoring rule: rename the literal key `lexicon:` → `lexemes:`; if tsc rejects the gloss→form map as not a `LexemeStore` (helpers using `as Language` / `Partial<Language>`), cast it `as unknown as LexemeStore` (the following `rekeyLexiconToLexemeIds` converts it to real records at runtime). This is a big, single-session atomic commit; budget accordingly (two task-runner subagents exhausted their budget just READING the affected files — do it with the tsc error list as the worklist).

The structural heart. ONE atomic commit (a type change can't be half-applied). Build records at birth with materialized points; route the seam + the few direct form-store sites through `lang.lexemes`; keep keyless OUT of sweeps for now. Target: tsc green, FAST green, **byte-identical** (GEN0 and GENN unchanged — seeded behaviour is preserved; keyless still don't evolve).

**Files:** `types.ts`, `domains.ts`, `lexicon/access.ts`, `lexicon/lexemeIdentity.ts`, `steps/phonology.ts`, `phonology/stratal.ts`, `utils/clone.ts`, plus the direct-reference test files listed in Step 9.

- [ ] **Step 1: Write the failing parity test**

Add to `src/engine/__tests__/lexeme_store.test.ts` (new describe block):

```ts
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { lexGet, lexKeys, lexHas } from "../lexicon/access";
import { lexPoint } from "../semantics/meaningPoint";

describe("lang.lexemes is the store after birth (seeded words)", () => {
  const root = () => {
    const s = createSimulation(presetEnglish()).getState();
    return s.tree[s.rootId]!.language;
  };
  it("every seeded gloss resolves to a record with form + materialized point + gloss", () => {
    const lang = root();
    for (const m of lexKeys(lang)) {
      const id = lang.lexemeIds![m]!;
      const rec = lang.lexemes[id]!;
      expect(rec).toBeDefined();
      expect(rec.form).toEqual(lexGet(lang, m));
      expect(rec.gloss).toBe(m);
      expect(rec.point).toEqual(Array.from(lexPoint(m))); // materialized = today's derived point
    }
  });
  it("the legacy field is gone", () => {
    expect((root() as unknown as { lexicon?: unknown }).lexicon).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run --dir src src/engine/__tests__/lexeme_store.test.ts`
Expected: FAIL — `lang.lexemes` doesn't exist yet / `lang.lexicon` still present.

- [ ] **Step 3: Swap the field in `types.ts`**

In `src/engine/types.ts` `interface Language`, replace the `lexicon: Lexicon;` line (215) and remove the `keylessLexemes?: …` block (216–224) with:

```ts
  /**
   * The canonical point-native lexeme store (store unification, step 5 S1). One LexemeRecord per
   * lexeme, keyed by LexemeId. Seeded/concept-coined records carry a `gloss`; keyless records
   * (coined into an empty region) have none — their label is the emergent nearest-anchor gloss.
   * Replaces the form-only `lexicon` and the separate `keylessLexemes`.
   */
  lexemes: LexemeStore;
```

Add `LexemeStore` (and keep `Lexicon`) to the `primitives` import at the top of `types.ts`.

- [ ] **Step 4: Update `domains.ts` `LexiconState`**

In `src/engine/domains.ts`, change the `LexiconState` Pick member `| "lexicon"` (line 97) to `| "lexemes"`. (Leave the rest; `keylessLexemes` was not in the Pick.)

- [ ] **Step 5: Rewrite the seam (`lexicon/access.ts`) over `lang.lexemes`**

Replace the bodies (keep signatures + the order-contract docstring). New bodies:

```ts
import type { Meaning, WordForm } from "../types";
import type { LexiconState } from "../domains";
import { lexemeIdFor, buildLexemeIdToGloss, type LexemeId } from "./lexemeIdentity";
import { lexPoint } from "../semantics/meaningPoint";

/** Form for a meaning, or undefined. */
export function lexGet(lang: LexiconState, m: Meaning): WordForm | undefined {
  const cid = lang.lexemeIds?.[m] as LexemeId | undefined;
  return cid === undefined ? undefined : lang.lexemes[cid]?.form;
}

/** Whether the lexicon has a form for this meaning. */
export function lexHas(lang: LexiconState, m: Meaning): boolean {
  const cid = lang.lexemeIds?.[m] as LexemeId | undefined;
  return cid !== undefined && lang.lexemes[cid] !== undefined;
}

/** Set/replace the form for a meaning. Mints a LexemeId + record (materialized point + gloss)
 *  for a new meaning, in call order; an existing meaning updates its record's form in place. */
export function lexSet(lang: LexiconState, m: Meaning, form: WordForm): void {
  const id = lexemeIdFor(lang, m);
  const rec = lang.lexemes[id];
  if (rec) rec.form = form;
  else lang.lexemes[id] = { form, point: Array.from(lexPoint(m)), gloss: m };
}

/** Remove a meaning's record. (`lang.lexemeIds` is purged separately by deleteMeaning.) */
export function lexDelete(lang: LexiconState, m: Meaning): void {
  const cid = lang.lexemeIds?.[m] as LexemeId | undefined;
  if (cid !== undefined) delete lang.lexemes[cid];
}

/** Meanings (glosses) in INSERTION order — gloss-bearing records only (keyless excluded). NOT sorted. */
export function lexKeys(lang: LexiconState): Meaning[] {
  const g = buildLexemeIdToGloss(lang);
  const out: Meaning[] = [];
  for (const cid of Object.keys(lang.lexemes)) {
    const m = g.get(cid);
    if (m !== undefined) out.push(m);
  }
  return out;
}

/** Forms in insertion order — gloss-bearing records only. */
export function lexValues(lang: LexiconState): WordForm[] {
  const g = buildLexemeIdToGloss(lang);
  const out: WordForm[] = [];
  for (const cid of Object.keys(lang.lexemes)) if (g.has(cid)) out.push(lang.lexemes[cid]!.form);
  return out;
}

/** [meaning, form] pairs in insertion order — gloss-bearing records only. */
export function lexEntries(lang: LexiconState): [Meaning, WordForm][] {
  const g = buildLexemeIdToGloss(lang);
  const out: [Meaning, WordForm][] = [];
  for (const cid of Object.keys(lang.lexemes)) {
    const m = g.get(cid);
    if (m !== undefined) out.push([m, lang.lexemes[cid]!.form]);
  }
  return out;
}

/** Number of gloss-bearing entries. */
export function lexSize(lang: LexiconState): number {
  return lexKeys(lang).length;
}
```

> NOTE: `buildLexemeIdToGloss` (Task 2 Step 6) returns ONLY seeded (gloss-bearing) ids, so `lexKeys`/`lexValues`/`lexEntries` naturally exclude keyless records — preserving today's behaviour. The previous `lexKeys` used `g.get(cid) ?? (cid as Meaning)`; dropping the fallback is the deliberate change that hides keyless from gloss iteration.

- [ ] **Step 6: `lexemeIdentity.ts` — records at birth, keyless-aware gloss map, ordered keys**

(a) `rekeyLexiconToLexemeIds(lang)` — build records with materialized points. Replace its body:

```ts
export function rekeyLexiconToLexemeIds(lang: LexiconState): void {
  if (!lang.lexemeIds) lang.lexemeIds = {};
  // At birth the preset author leaves a GLOSS-keyed form map on lang.lexemes-to-be; it arrives here
  // as a Record<gloss, WordForm> (the literal preset shape). Mint ids in insertion order and build
  // the canonical record store with a materialized point per gloss.
  const glossStore = lang.lexemes as unknown as Record<string, WordForm>;
  const recStore: LexemeStore = {};
  for (const gloss of Object.keys(glossStore)) {
    let cid = lang.lexemeIds[gloss] as LexemeId | undefined;
    if (!cid) { cid = mintLexemeId(lang); lang.lexemeIds[gloss] = cid; }
    recStore[cid] = { form: glossStore[gloss]!, point: Array.from(lexPoint(gloss)), gloss };
  }
  lang.lexemes = recStore;
}
```
Add imports: `import type { LexemeStore } from "../primitives";` and `import { lexPoint } from "../semantics/meaningPoint";`.

> The preset literal currently assigns `lexicon: { gloss: form, ... }`. After Step 3 the field is `lexemes`, so presets must assign `lexemes: { gloss: form }` as a transitional gloss-keyed shape that `rekeyLexiconToLexemeIds` immediately converts. Update each preset's field name (Step 8).

(b) `buildLexemeIdToGloss(lang)` — unchanged body (it inverts `lang.lexemeIds`, i.e. seeded only). Keep as-is. This is what makes the seam exclude keyless.

(c) `orderedLexemeIds(store, lang)` and `orderedLexiconKeys(lang)` — append keyless by id. Replace `orderedLexemeIds`:

```ts
// Param is any id-keyed map (the engine passes its form-view Record<LexemeId, WordForm>; callers may
// also pass the record store). Only the KEYS are read, so it is typed loosely.
export function orderedLexemeIds(lexicon: Record<string, unknown>, lang: LexiconState): LexemeId[] {
  const g = buildLexemeIdToGloss(lang);
  const seeded: [string, LexemeId][] = [];
  const keyless: LexemeId[] = [];
  for (const cid of Object.keys(lexicon) as LexemeId[]) {
    const gloss = g.get(cid);
    if (gloss === undefined) keyless.push(cid);
    else seeded.push([gloss, cid]);
  }
  seeded.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  keyless.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [...seeded.map((p) => p[1]), ...keyless];
}
```
> NOTE: in Task 2 keyless records are NOT in the swept store yet (still excluded — see Task 3/4), so `keyless` is empty here and the order is byte-identical to today. The append logic is in place for Task 4.

`orderedLexiconKeys(lang)` returns seeded glosses sorted (unchanged behaviour): keep returning `Object.keys`-resolved sorted GLOSSES, but source ids from `lang.lexemes`:

```ts
export function orderedLexiconKeys(lang: LexiconState): Meaning[] {
  const g = buildLexemeIdToGloss(lang);
  const out: Meaning[] = [];
  for (const cid of Object.keys(lang.lexemes)) { const m = g.get(cid); if (m !== undefined) out.push(m); }
  return out.sort();
}
```

(d) Change the `orderedLexemeIds` parameter type and any internal `Lexicon` references in this file to `LexemeStore`; import it.

- [ ] **Step 7: Phonology step — project form-view, merge back (`steps/phonology.ts`)**

The sound-change application block (lines ~309–384) mutates `lang.lexicon`. Rewrite to operate on a form-view and merge back. Replace `const before = lang.lexicon;` (the snapshot near line 309 — confirm exact name) and the apply/assign lines:

```ts
import { seededFormViewOf, mergeFormsIntoStore } from "../lexicon/store";
// ...
const before = seededFormViewOf(lang.lexemes); // Record<LexemeId, WordForm> — SEEDED only (keyless not swept until task 4)
let after: Record<string, WordForm>;
if (lang.lexiconUR !== undefined) {
  after = stratalApplyChangesToLexicon(before, changes, rng, opts, lang, conceptSeedBase);
  const policy = lang.lexiconURRefreshPolicy ?? "each-gen";
  if (policy === "each-gen") { lang.lexiconUR = { ...after }; }
} else {
  after = applyChangesToLexicon(before, changes, rng, opts, lang, conceptSeedBase);
}
// inventory-pressure revert loop now operates on `after` (form view), not lang.lexicon:
//   for (const cid of Object.keys(after)) { const newForm = after[cid]!; const oldForm = before[cid]; ... after[cid] = oldForm; }
// correspondences: recordCorrespondences(lang, before, after, generation);
// satellite cleanup: for (const cid of Object.keys(before)) if (after[cid] === undefined) { ...delete satellite[gloss]... }
mergeFormsIntoStore(lang.lexemes, before, after);
```
Update the three loops in that block (inventory-pressure revert at ~358–375, the `recordCorrespondences` call at ~346, the satellite-cleanup at ~377–384) to read `after`/`before` form-views instead of `lang.lexicon`. `applyChangesToLexicon` and `stratalApplyChangesToLexicon` signatures are unchanged (they already take a form map + `lang`).

- [ ] **Step 8: `stratal.ts`, `clone.ts`, presets, `lexicon/word.ts` (word↔lexicon resync)**

- `phonology/stratal.ts`: `enableStratalMode`/`enableStratalModeManual`/`refreshUR` snapshot `lang.lexiconUR` from the form-view: replace the `for (const cid of Object.keys(lang.lexicon)) lang.lexiconUR[cid] = lang.lexicon[cid].slice()` loops with `lang.lexiconUR = formViewOf(lang.lexemes)` (import `formViewOf`). `getUR` reads `lexGet` fallback (already does).
- `utils/clone.ts`: replace the `lexicon: cloneLexicon(lang.lexicon)` line and the `keylessLexemes: …` block with:
  ```ts
  lexemes: Object.fromEntries(
    Object.entries(lang.lexemes).map(([id, r]) => [id, { form: r.form.slice(), point: r.point.slice(), gloss: r.gloss }]),
  ),
  ```
  Remove `cloneLexicon` if now unused (check; `cloneLexicon` may be used elsewhere — if so leave it).
- Presets (`src/engine/presets/*.ts`): rename the `lexicon:` field in each preset's returned config/seed object to the shape `rekeyLexiconToLexemeIds` expects. CHECK where presets feed the store: they populate `config.seedLexicon` (gloss→form) which `steps/init.ts` copies into `rootLang.lexemes` before `rekeyLexiconToLexemeIds`. Update `init.ts` (around line where `lexicon:` is set on `rootLang`, ~line 215-ish of the literal) to assign `lexemes:` from the gloss-keyed seed. (Find with: `grep -n "lexicon:" src/engine/steps/init.ts`.)
- `lexicon/word.ts` (`syncLexiconFromWords`/`syncWordsFromLexicon` / `rebuildFormKeyIndex`): any direct `lang.lexicon` access → `lexGet`/`lexSet`/`lang.lexemes`. (Find with `grep -n "lexicon" src/engine/lexicon/word.ts`.)

- [ ] **Step 9: Update direct-reference sites (production + tests)**

Run `grep -rn "\.lexicon\b" src/engine --include=*.ts` and resolve EACH non-comment hit:
- Production reads of `lang.lexicon[cid]` → `lang.lexemes[cid]?.form`.
- Production whole-store refs → `lang.lexemes` (records) or `formViewOf(lang.lexemes)` where a form map is needed.
- Test files that read `lang.lexicon[gloss]` (already undefined post-R2) → replace with `lexGet(lang, gloss)` or delete the dead assertion; test files that WRITE `lang.lexicon[m] = form` → `lexSet(lang, m, form)`. Known test files to fix: `inventory_pressure_proposal.test.ts:64`, `narrative_discourse.test.ts:51,185`, `checkpoint.test.ts:22`, `closed_class_protection.test.ts:107`, `graceful_fallback.test.ts:29,83`, `lexicogenesis_e2e.test.ts:26,30`, `morph_structure.test.ts:85`, `keyless_lexeme.test.ts:29` (`lang.lexicon[id]` → `lang.lexemes[id]`), and any others the grep surfaces.

- [ ] **Step 10: Typecheck + parity test + full FAST**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx vitest run --dir src src/engine/__tests__/lexeme_store.test.ts` → PASS.
Run: `npx vitest run --dir src` → all green. Investigate ANY failure: a behavioural diff here means the cutover wasn't byte-identical (most likely a points-materialization or order-contract slip) — fix until green WITHOUT re-baking (Task 2 must stay byte-identical).

- [ ] **Step 11: Confirm GEN0 + GENN byte-identical (RUN_SLOW)**

Run: `$env:RUN_SLOW='1'; npx vitest run --dir src meaning_layer_baseline`
Expected: ALL 12 pass (GEN0 + GENN unchanged). If GENN shifted, the cutover perturbed seeded behaviour — diagnose (do NOT re-bake in Task 2).

- [ ] **Step 12: Commit**

```
git add -A
git commit -m "refactor(storage): unify seeded words into lang.lexemes record store; remove lang.lexicon (S1 task 2)"
```

---

## Task 3: Fold keyless lexemes into `lang.lexemes` (remove `keylessLexemes`)

Keyless coinage writes a `lang.lexemes` record (no gloss); the detector reads from there. Keyless stay EXCLUDED from sweeps (the seam + `buildLexemeIdToGloss` ignore gloss-less records), so this is byte-identical.

**Files:** `lexicon/lexemeIdentity.ts`, `genesis/semanticGap.ts`, `utils/clone.ts` (already records), `types.ts` (field already removed in Task 2), tests.

- [ ] **Step 1: Update keyless tests to the new store**

In `src/engine/__tests__/keyless_lexeme.test.ts` and `keyless_gap_coinage.test.ts`, replace `lang.keylessLexemes![id]` reads with `lang.lexemes[id]` and assert the record has NO gloss (`expect(lang.lexemes[id]!.gloss).toBeUndefined()`), and that it's excluded from `lexKeys`. Run them to confirm they FAIL (still reading the removed field / old coinKeylessLexeme).

- [ ] **Step 2: `coinKeylessLexeme` writes a record**

In `lexemeIdentity.ts` replace the body:

```ts
export function coinKeylessLexeme(lang: Language, point: Vec, form: WordForm): LexemeId {
  const id = mintLexemeId(lang);
  lang.lexemes[id] = { form: form.slice(), point: Array.from(point) }; // no gloss => keyless
  return id;
}
```
`keylessGloss` stays (reads `record.point`).

- [ ] **Step 3: `findSemanticGap` / `coinKeylessForGap` read records**

In `genesis/semanticGap.ts`, the existing-points gather already iterates `lexKeys` (seeded). Add keyless points from `lang.lexemes` records WITHOUT a gloss:

```ts
for (const id of Object.keys(lang.lexemes)) {
  const rec = lang.lexemes[id]!;
  if (rec.gloss === undefined) existingPoints.push(Int32Array.from(rec.point));
}
```
(Replace the old `lang.keylessLexemes` loop.)

- [ ] **Step 4: Run keyless tests + FAST**

Run: `npx vitest run --dir src src/engine/__tests__/keyless_lexeme.test.ts src/engine/__tests__/keyless_gap_coinage.test.ts` → PASS.
Run: `npx vitest run --dir src` → green.
Run: `$env:RUN_SLOW='1'; npx vitest run --dir src meaning_layer_baseline` → all 12 pass (still byte-identical: keyless aren't swept yet).

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "refactor(storage): keyless lexemes live in lang.lexemes (no gloss); remove keylessLexemes (S1 task 3)"
```

---

## Task 4: Make keyless words first-class in the sweep (behaviour change → re-bake)

Include keyless records in the sound-change form-view and the order contract; resolve their gloss emergently for sensitivity/legality. Keyless words now evolve phonologically. Deliberate GENN re-bake.

**Files:** `lexicon/lexemeIdentity.ts` (`buildLexemeIdToGloss` keyless-aware for the ENGINE resolver only), `phonology/apply.ts` (emergent gloss), `steps/phonology.ts` (form-view already includes all records), `meaning_layer_baseline.test.ts` (re-bake).

- [ ] **Step 1: Decide the resolver seam (design note, no code)**

The seam's `buildLexemeIdToGloss` MUST stay seeded-only (so `lexKeys` keeps excluding keyless). The sound-change engine needs a SEPARATE resolver that ALSO maps keyless ids → emergent gloss. Add a new export `glossResolverForSweep(lang)` in `lexemeIdentity.ts` rather than changing `buildLexemeIdToGloss`.

- [ ] **Step 2: Write the failing test (keyless evolves)**

Add to `keyless_coinage_loop.test.ts` (RUN_SLOW): after a 30-gen English run, assert at least one keyless record's `form` differs from any form `coinKeylessForGap` would freshly produce — simplest robust check: capture the keyless record forms at the gen they were coined vs gen 30 is hard; instead assert keyless records exist AND the run's GENN baseline shifted (covered by Task 4 Step 5). Concretely add a determinism re-assert: two 30-gen runs produce identical keyless forms (already covered) AND `formViewOf` includes keyless ids in `orderedLexemeIds`. Unit-test the ordering directly in `lexeme_store.test.ts`:

```ts
it("orderedLexemeIds appends keyless ids (sorted by id) after seeded glosses", () => {
  const lang = root();
  const before = orderedLexemeIds(lang.lexemes, lang).length;
  coinKeylessLexeme(lang, fromFloats(embed("fire")), ["z","z"]);
  const ids = orderedLexemeIds(lang.lexemes, lang);
  expect(ids.length).toBe(before + 1);
  // the keyless id is LAST (appended after all seeded glosses)
  expect(lang.lexemes[ids[ids.length - 1]!]!.gloss).toBeUndefined();
});
```
Run → FAIL (keyless currently excluded from orderedLexemeIds because it's not in the store sweep / resolver).

- [ ] **Step 3: Implement keyless-aware sweep**

(a) `lexemeIdentity.ts` add:
```ts
import { glossOf } from "../semantics/anchors";
/** Engine-side resolver: seeded ids -> stored gloss; keyless ids -> EMERGENT gloss (glossOf(point)).
 *  Used ONLY by the sound-change sweep (sensitivity/legality). The seam's buildLexemeIdToGloss stays
 *  seeded-only so gloss iteration keeps excluding keyless. */
export function glossResolverForSweep(lang: LexiconState & { lexemes: LexemeStore }): Map<string, Meaning> {
  const g = buildLexemeIdToGloss(lang);
  for (const id of Object.keys(lang.lexemes)) {
    if (!g.has(id)) g.set(id, glossOf(Int32Array.from(lang.lexemes[id]!.point)));
  }
  return g;
}
```
`orderedLexemeIds` already appends keyless (Task 2 Step 6) — now they ARE in the store form-view, so they appear.

(b) `phonology/apply.ts` `applyChangesToLexicon`: build `glossByCid` from `glossResolverForSweep(lang)` instead of `buildLexemeIdToGloss(lang)` (so a keyless key resolves to its emergent gloss for `soundChangeSensitivity`/`isFormLegal`). One-line import + call swap.

(c) Flip the phonology step's projection from `seededFormViewOf(lang.lexemes)` to `formViewOf(lang.lexemes)` (the single sweep gate) so keyless records enter `before`/`after` and are swept + merged back. `orderedLexemeIds` then appends them (it sees them in the form-view). Confirm the satellite-cleanup loop (Task 2 Step 7) tolerates a keyless id whose gloss-resolution via `buildLexemeIdToGloss` returns undefined — it already `continue`s on undefined gloss, so keyless words are correctly skipped for satellite cleanup (they have no satellite entries). Also confirm `recordCorrespondences` tolerates keyless ids (skip on undefined gloss) — add a guard if it throws.

- [ ] **Step 4: Run unit + FAST**

Run: `npx vitest run --dir src src/engine/__tests__/lexeme_store.test.ts` → PASS.
Run: `npx vitest run --dir src` → expect SOME failures only in `meaning_layer_baseline` GENN (trajectory shifted) and possibly event/count tests that keyless coinage perturbs. Fix non-baseline fallout the way inc-4 step 3 did (accept legitimate behavioural shifts).

- [ ] **Step 5: Re-bake `meaning_layer_baseline` GENN**

Run twice: `$env:RUN_SLOW='1'; npx vitest run --dir src meaning_layer_baseline` — capture the 6 new GENN hashes, CONFIRM identical across the two runs (reproducibility). GEN0 must still pass. Update the `GENN` table + add a dated re-bake comment explaining: keyless words are now swept by sound change (and consume shared-rng draws), shifting every preset's gen-30 trajectory; GEN0 unchanged; reproducibility confirmed; byte-identity-vs-old waived.

- [ ] **Step 6: Full RUN_SLOW + FAST green**

Run: `$env:RUN_SLOW='1'; npx vitest run --dir src meaning_layer_baseline keyless_coinage_loop` → green.
Run: `npx vitest run --dir src` → green.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat(storage): keyless words are first-class in the sound-change sweep (S1 task 4, re-bake)"
```

---

## Task 5: Persistence back-compat + clone finalize + loop assertion

Migrate old saves and lock that keyless forms actually evolve.

**Files:** `utils/clone.ts` (done in Task 2), a load-migration shim (locate the state-load path), `keyless_coinage_loop.test.ts`.

- [ ] **Step 1: Locate the load/migration path**

Run `grep -rn "rehydrate\|loadState\|fromJSON\|migrate" src/engine/simulation.ts`. The old-save shim lives where a loaded `Language` is normalized (the Set-rehydration at simulation.ts ~line 493 is the anchor). If there is no formal load-migration module, add the shim as a small exported `migrateLexemeStore(lang)` in `lexicon/store.ts`.

- [ ] **Step 2: Write the failing migration test**

Add to `lexeme_store.test.ts`:

```ts
import { migrateLexemeStore } from "../lexicon/store";
it("migrates an old-shape language (lexicon + keylessLexemes) into lang.lexemes", () => {
  const old = {
    lexemeIds: { water: "id-w" },
    lexicon: { "id-w": ["w", "a"] },
    keylessLexemes: { "id-k": { form: ["z"], point: [1, 2] } },
  } as any;
  migrateLexemeStore(old);
  expect(old.lexemes["id-w"]).toEqual({ form: ["w", "a"], point: expect.any(Array), gloss: "water" });
  expect(old.lexemes["id-k"]).toEqual({ form: ["z"], point: [1, 2] });
  expect(old.lexicon).toBeUndefined();
  expect(old.keylessLexemes).toBeUndefined();
});
```
Run → FAIL.

- [ ] **Step 3: Implement `migrateLexemeStore`**

In `lexicon/store.ts`:
```ts
import { lexPoint } from "../semantics/meaningPoint";
/** Convert an old-shape language (form-only `lexicon` + separate `keylessLexemes`) to `lexemes`. */
export function migrateLexemeStore(lang: any): void {
  if (lang.lexemes) return;
  const store: LexemeStore = {};
  const idToGloss = new Map<string, string>();
  for (const gloss of Object.keys(lang.lexemeIds ?? {})) idToGloss.set(lang.lexemeIds[gloss], gloss);
  for (const id of Object.keys(lang.lexicon ?? {})) {
    const gloss = idToGloss.get(id);
    store[id] = { form: lang.lexicon[id], point: Array.from(lexPoint(gloss ?? id)), gloss };
  }
  for (const id of Object.keys(lang.keylessLexemes ?? {})) {
    store[id] = { form: lang.keylessLexemes[id].form, point: lang.keylessLexemes[id].point };
  }
  lang.lexemes = store;
  delete lang.lexicon; delete lang.keylessLexemes;
}
```
Wire it into the load path found in Step 1 (call per language on hydrate).

- [ ] **Step 4: Strengthen the loop test (keyless evolves)**

In `keyless_coinage_loop.test.ts`, add (RUN_SLOW): coin a keyless lexeme at a known point on a fresh root, record its form, step the sim 30 gens, and assert that SOME keyless record's form length or content changed from a freshly-coined identical one (proves sound change touched keyless). If a deterministic single-word probe is fragile, assert: across the 30-gen run, the set of keyless forms is not equal to the set of forms a no-evolution coinage would produce for the same points (compare against `coinKeylessForGap` outputs on the gen-0 lexicon). Run → PASS.

- [ ] **Step 5: tsc + FAST + RUN_SLOW green; commit**

Run: `npx tsc --noEmit` → 0. `npx vitest run --dir src` → green. `$env:RUN_SLOW='1'; npx vitest run --dir src meaning_layer_baseline keyless_coinage_loop` → green.
```
git add -A
git commit -m "feat(storage): old-save migration + lock keyless words evolve (S1 task 5)"
```

---

## Final verification (after all tasks)

- `npx tsc --noEmit` → 0.
- `npx vitest run --dir src` → all green.
- `$env:RUN_SLOW='1'; npx vitest run --dir src` → all green (baseline GENN re-baked, reproducible).
- Update `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md`: mark step-5 sub-project 1 (store unification) DONE; sub-projects 2-6 remain.
- Update memory `vector-native-lexicon-flip-active.md` with the new store shape + branch state.
