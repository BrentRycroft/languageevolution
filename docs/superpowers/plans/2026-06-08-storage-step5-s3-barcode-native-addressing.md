# Storage Step 5 — S3 Barcode-Native Addressing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `LexemeId` the primary in-engine address for every lexeme — convert all ~545 production seam call sites (and the tests exercising them) to identify words by `LexemeId` instead of gloss, retiring the gloss-in `access.ts` API while keeping behavior byte-identical.

**Architecture:** Additive barcode-native seam + adapter-bridged batch migration (Strategy A). B0 adds id-native accessors alongside the existing gloss-in functions (now thin adapters); B1–B9 convert one subsystem at a time, each byte-identical-gated; B10 removes the adapters and the gloss-in API. Iteration order stays gloss-sorted (the deliberate order flip is S5), so the entire change is byte-for-byte identical with **no `meaning_layer_baseline` re-bake**.

**Tech Stack:** TypeScript (strict), Vitest. Engine determinism via a seeded `Rng`; the byte-identity oracle is `src/engine/__tests__/meaning_layer_baseline.test.ts` (FAST = GEN0 all 6 presets; `RUN_SLOW=1` = full 30-step GENN all 6 presets).

**Spec:** `docs/superpowers/specs/2026-06-08-storage-step5-s3-barcode-native-addressing-design.md`

---

## Orientation — read before starting

- **Canonical store:** `lang.lexemes: Record<LexemeId, {form; point; gloss?}>`. Seeded records carry a
  `gloss`; keyless (point-native) records do not.
- **Gloss↔id bridge** (`src/engine/lexicon/lexemeIdentity.ts`): `lang.lexemeIds: Record<gloss, LexemeId>`
  is the gloss→id map. `meaningForLexemeId(lang, id)` is the O(1) cached **id→seed-gloss** resolver
  (this IS the spec's `glossFor`; do **not** add a new `glossFor`). `lexemeIdFor(lang, gloss)` mints.
  `orderedLexemeIds(lexicon, lang)` returns store ids **sorted by gloss** (the canonical RNG order, keyless appended).
- **Current seam** (`src/engine/lexicon/access.ts`): `lexGet`/`lexHas`/`lexSet`/`lexDelete` (gloss-in) +
  `lexKeys`/`lexValues`/`lexEntries`/`lexSize` (gloss iteration, insertion order, seeded-only).
- **Satellite seam** (`src/engine/lexicon/satellites.ts`): `satGet/Set/Has/Delete(lang, FIELD, key)`
  already accepts **gloss OR id** (non-minting) — so satellite calls need no change when a call site
  switches from passing a gloss to passing an id.
- **Determinism rule:** no new RNG draws, no reordering. `lexIds` preserves insertion order; the RNG hot
  path keeps using `orderedLexemeIds`. Byte-identity is proven by the baseline test passing **unchanged**.

---

## The conversion pattern (shared by every batch B1–B9)

Every batch mechanically rewrites a subsystem's call sites from gloss-addressing to id-addressing,
following this fixed pattern. The canonical worked example is `src/engine/lexicon/lookup.ts` — it exhibits
nearly every shape (direct hit, compound part loop, colex via `satEntries`+`meaningForLexemeId`, grounding
substitution). Refer to it.

| Shape | Before (gloss) | After (id) |
|-------|----------------|------------|
| Read a form | `lexGet(lang, m)` | `lexFormById(lang, id)` |
| Has a word | `lexHas(lang, m)` | `lexHasById(lang, id)` |
| Update a form | `lexSet(lang, m, form)` (existing word) | `lexSetFormById(lang, id, form)` |
| Coin a new seeded word | `lexSet(lang, m, form)` (new word) | `coinSeededLexeme(lang, m, form)` — **boundary only** |
| Delete a word | `lexDelete(lang, m)` | `lexDeleteById(lang, id)` |
| Iterate words | `for (const m of lexKeys(lang))` | `for (const id of lexIds(lang))` |
| RNG-ordered iterate | `for (const m of orderedLexiconKeys(lang))` | `for (const id of orderedLexemeIds(lang.lexemes, lang))` |
| Need the gloss string | (already had `m`) | `const m = meaningForLexemeId(lang, id)!` at point of use |
| Satellite read/write | `satGet(lang, F, m)` | `satGet(lang, F, id)` (seam takes either; pass the id) |

**Where the id comes from in each call site:**
- A site that **iterated** `lexKeys`/`orderedLexiconKeys` now iterates `lexIds`/`orderedLexemeIds` and
  already holds the id.
- A site handed a **gloss from outside** (a boundary — see spec §4: translator/narrative entry, preset,
  UI, a `lang.compounds[m].parts` gloss, a curated-table partner gloss) resolves once with
  `idForGloss(lang, m)` (non-minting; `undefined` if the word does not exist) and then works in ids.
- A **soft-boundary** site doing a gloss STRING op (`posOf`, `SEMANTIC_NEIGHBORS[...]`, compound
  `"a+b"` parsing, taboo match) keeps the id as identity and calls `meaningForLexemeId(lang, id)!` only
  for the string operation.

**Determinism discipline:** never replace `orderedLexemeIds` iteration with `lexIds`, or vice-versa —
they are different orders (sorted-by-gloss vs insertion). Preserve whichever the site used. Do not
introduce `.sort()` on ids; the gloss-sorted order is the contract until S5.

**Per-batch gate (identical for every B1–B9), run from repo root `c:/dev/languageevolution`:**
```bash
npx tsc --noEmit
# targeted FAST tests for the touched subsystem (one batched invocation), e.g.:
npx vitest run --dir src <touched test files…>
# byte-identity oracle — MUST pass against the existing locked hashes (no edits):
$env:RUN_SLOW=1; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null
```
Expected: tsc 0 errors; targeted tests green; baseline **12/12 pass, no hash changes**. If the baseline
fails, a byte-identity break was introduced — fix it (do **not** edit the baseline). Then commit.

> **Note on granularity:** B1–B9 are bulk *mechanical* conversions (a fixed find-and-rewrite pattern,
> tsc-driven). Per the S1-T2 precedent on this branch, each subsystem batch is **one task** gated by
> tsc + targeted tests + the baseline oracle, not hundreds of micro-steps. Enumerate the files, apply the
> pattern, run the gate, commit.

> **Execution note:** Worktree subagents are structurally incompatible with this LOCAL unpushed branch
> (they branch off `origin/auto/realism` and cannot see committed foundation work, and truncate mid-task —
> proven in S2b). Execute **inline**, or reconcile uncommitted edits out of a worktree by hand. Each batch
> commits on `auto/storage-pointnative`; local commits only, never push.

---

## Task B0: Foundation — additive barcode-native seam

**Files:**
- Modify: `src/engine/lexicon/access.ts` (add id-native accessors; rewrite gloss-in functions as adapters)
- Test: `src/engine/lexicon/__tests__/barcode_seam.test.ts` (create)

- [ ] **Step 1: Write the failing test** — `src/engine/lexicon/__tests__/barcode_seam.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import {
  lexFormById, lexSetFormById, lexHasById, lexDeleteById, lexIds,
  idForGloss, coinSeededLexeme, lexKeys, lexGet, lexHas,
} from "../access";
import { meaningForLexemeId } from "../lexemeIdentity";

function rootLang() {
  const sim = createSimulation({ ...presetEnglish(), seed: "s3-b0" });
  const st = sim.getState();
  return st.tree[st.rootId]!.language;
}

describe("S3 B0 — barcode-native seam agrees with gloss-in seam", () => {
  it("lexIds positionally matches lexKeys, and id round-trips to its gloss", () => {
    const lang = rootLang();
    const glosses = lexKeys(lang);
    const ids = lexIds(lang);
    expect(ids.length).toBe(glosses.length);
    for (let i = 0; i < ids.length; i++) {
      expect(meaningForLexemeId(lang, ids[i]!)).toBe(glosses[i]);
      expect(idForGloss(lang, glosses[i]!)).toBe(ids[i]);
    }
  });

  it("lexFormById/lexHasById agree with lexGet/lexHas for every gloss", () => {
    const lang = rootLang();
    for (const m of lexKeys(lang)) {
      const id = idForGloss(lang, m)!;
      expect(lexFormById(lang, id)).toEqual(lexGet(lang, m));
      expect(lexHasById(lang, id)).toBe(lexHas(lang, m));
    }
  });

  it("lexSetFormById updates an existing form without minting", () => {
    const lang = rootLang();
    const id = lexIds(lang)[0]!;
    const before = lang.conceptIdSeq;
    lexSetFormById(lang, id, [{ onset: "", nucleus: "a", coda: "" }] as never);
    expect(lexFormById(lang, id)).toEqual([{ onset: "", nucleus: "a", coda: "" }]);
    expect(lang.conceptIdSeq).toBe(before); // no mint
  });

  it("coinSeededLexeme mints a new word and is the id of its gloss", () => {
    const lang = rootLang();
    const id = coinSeededLexeme(lang, "zzqx-new-concept", [{ onset: "", nucleus: "i", coda: "" }] as never);
    expect(idForGloss(lang, "zzqx-new-concept")).toBe(id);
    expect(meaningForLexemeId(lang, id)).toBe("zzqx-new-concept");
    lexDeleteById(lang, id);
    expect(lexHasById(lang, id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run --dir src barcode_seam`
Expected: FAIL — `lexFormById`/`lexIds`/`idForGloss`/`coinSeededLexeme`/`lexSetFormById`/`lexHasById`/`lexDeleteById` are not exported.

- [ ] **Step 3: Add the id-native accessors to `src/engine/lexicon/access.ts`**

Add these exports (the existing imports already include `lexemeIdFor`, `buildLexemeIdToGloss`,
`LexemeId`, `lexPoint`):

```ts
// --- S3: barcode-native primary accessors -------------------------------------------------
// LexemeId is the primary address. The gloss-in functions below are thin adapters during the
// S3 migration and are removed in B10. Order contracts unchanged: `lexIds` = insertion order
// (twin of `lexKeys`); the RNG hot path keeps using `orderedLexemeIds`.

/** Form for a record id, or undefined. Primary read. */
export function lexFormById(lang: LexiconState, id: LexemeId): WordForm | undefined {
  return lang.lexemes[id]?.form;
}

/** Set an EXISTING record's form in place (preserving point + gloss). Never mints; no-op if absent. */
export function lexSetFormById(lang: LexiconState, id: LexemeId, form: WordForm): void {
  const rec = lang.lexemes[id];
  if (rec) rec.form = form;
}

/** Whether a record id exists in the store. */
export function lexHasById(lang: LexiconState, id: LexemeId): boolean {
  return lang.lexemes[id] !== undefined;
}

/** Delete a record by id. */
export function lexDeleteById(lang: LexiconState, id: LexemeId): void {
  if (lang.lexemes[id] !== undefined) delete lang.lexemes[id];
}

/** Seeded ids in INSERTION order — gloss-bearing records only (keyless excluded). Positional twin of
 *  `lexKeys`. NOT sorted (use `orderedLexemeIds` for the RNG-draw order). */
export function lexIds(lang: LexiconState): LexemeId[] {
  const g = buildLexemeIdToGloss(lang);
  const out: LexemeId[] = [];
  for (const cid of Object.keys(lang.lexemes)) if (g.has(cid)) out.push(cid as LexemeId);
  return out;
}

/** Non-minting boundary resolver: gloss → id, or undefined if the word does not exist. */
export function idForGloss(lang: LexiconState, m: Meaning): LexemeId | undefined {
  return lang.lexemeIds?.[m] as LexemeId | undefined;
}

/** Coin a NEW seeded word (or update an existing one's form) by gloss — the single blessed seeded-mint
 *  boundary. Mints a LexemeId + record (materialized point + gloss) for a new meaning; an existing
 *  meaning updates its form in place. Returns the id. */
export function coinSeededLexeme(lang: LexiconState, m: Meaning, form: WordForm): LexemeId {
  const id = lexemeIdFor(lang, m);
  const rec = lang.lexemes[id];
  if (rec) rec.form = form;
  else lang.lexemes[id] = { form, point: Array.from(lexPoint(m)), gloss: m };
  return id;
}
```

- [ ] **Step 4: Rewrite the gloss-in functions as adapters (byte-identical) in the same file**

Replace the existing `lexGet`/`lexHas`/`lexSet`/`lexDelete` bodies with delegations (keep
`lexKeys`/`lexValues`/`lexEntries`/`lexSize` exactly as-is — they still return glosses):

```ts
export function lexGet(lang: LexiconState, m: Meaning): WordForm | undefined {
  const id = idForGloss(lang, m);
  return id === undefined ? undefined : lexFormById(lang, id);
}

export function lexHas(lang: LexiconState, m: Meaning): boolean {
  const id = idForGloss(lang, m);
  return id !== undefined && lexHasById(lang, id);
}

export function lexSet(lang: LexiconState, m: Meaning, form: WordForm): void {
  coinSeededLexeme(lang, m, form);
}

export function lexDelete(lang: LexiconState, m: Meaning): void {
  const id = idForGloss(lang, m);
  if (id !== undefined) { lexDeleteById(lang, id); return; }
  // keyless (gloss-less) record addressed by its own id (e.g. a keyless recarve loser)
  if (lexHasById(lang, m as unknown as LexemeId)) lexDeleteById(lang, m as unknown as LexemeId);
}
```

- [ ] **Step 5: Run the B0 test + the baseline oracle**

Run: `npx vitest run --dir src barcode_seam` → Expected: PASS (4/4).
Run: `npx tsc --noEmit` → Expected: 0 errors.
Run: `$env:RUN_SLOW=1; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null` → Expected: 12/12 pass, no hash changes (adapters are byte-identical).

- [ ] **Step 6: Commit**

```bash
git add src/engine/lexicon/access.ts src/engine/lexicon/__tests__/barcode_seam.test.ts
git commit -m "feat(storage): additive barcode-native lexicon seam (S3 B0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B1: Convert `src/engine/lexicon/` internal ops

**Files (Modify — convert per the pattern; also their `__tests__`):**
`lookup.ts`, `word.ts`, `mutate.ts`, `synonyms.ts`, `taboo.ts`, `disambiguate.ts`, `altForms.ts`,
`compound.ts`, `univerbation.ts`, `reanalysis.ts`, `nounClass.ts`, `synthesis.ts`, `socialContagion.ts`,
`variants.ts`, `frequencyDynamics.ts`. (Do **not** touch `access.ts`, `lexemeIdentity.ts`, `store.ts`,
`satellites.ts` — those are seam internals.)

**Subsystem note:** This is the canonical batch — `lookup.ts` is the worked example. `lang.compounds[m].parts`
are glosses arriving from stored metadata (a boundary): resolve each with `idForGloss`. The colex rung
already uses `satEntries(lang,"colexifiedAs")` + `meaningForLexemeId` — its `winner` is a gloss for
`lexHas/lexGet`; convert to `lexHasById/lexFormById(lang, winnerId)` directly (you already hold `winnerId`).

- [ ] **Step 1: Apply the conversion pattern** to every file above and its test file. Representative edit
  in `lookup.ts` rung 2b (you already hold `winnerId`):

```ts
// Before:
for (const [winnerId, losers] of satEntries(lang, "colexifiedAs")) {
  const winner = meaningForLexemeId(lang, winnerId);
  if (winner === undefined) continue;
  if (losers.includes(meaning) && lexHas(lang, winner)) {
    return { form: lexGet(lang, winner)!.slice(), resolution: "reverse-colex", glossNote: `↔ ${winner}` };
  }
}
// After:
for (const [winnerId, losers] of satEntries(lang, "colexifiedAs")) {
  const winner = meaningForLexemeId(lang, winnerId);
  if (winner === undefined) continue;
  if (losers.includes(meaning) && lexHasById(lang, winnerId)) {
    return { form: lexFormById(lang, winnerId)!.slice(), resolution: "reverse-colex", glossNote: `↔ ${winner}` };
  }
}
```
For the still-gloss `meaning` parameter (a boundary input to `lookupForm`): resolve once at the top of
each rung that needs the store — `const mid = idForGloss(lang, meaning);` — and use `lexHasById`/`lexFormById(lang, mid)`
guarded by `mid !== undefined`. `lang.compounds[meaning].parts` partials: `const pid = idForGloss(lang, partMeaning);`.

- [ ] **Step 2: Gate** — run the per-batch gate (tsc + `npx vitest run --dir src lexicon` covering the
  lexicon `__tests__` + `lookup` + `synonyms` + `taboo` + `disambiguate` + `alt_forms` tests, then the
  `RUN_SLOW=1 meaning_layer_baseline` oracle). Expected: tsc 0; targeted green; baseline 12/12 unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/engine/lexicon
git commit -m "refactor(storage): id-native addressing in lexicon/ ops (S3 B1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B2: Convert `src/engine/phonology/`

**Files (Modify + their `__tests__`):** `regular.ts`, `propose.ts`, `ot.ts`, `sandhi.ts`, `tonogenesis.ts`,
`tone_spread.ts`, `stratal.ts`, `orthography.ts`, `phonologization.ts`, `generated.ts`, `functionalLoad.ts`,
`pruning.ts`. (`apply.ts` already iterates `orderedLexemeIds` + form-views — leave its order logic intact;
only convert any incidental `lexGet`/`lexKeys` it makes outside the hot path.)

**Subsystem note — DETERMINISM-CRITICAL.** These sites feed the seeded RNG. Preserve order exactly:
a site using `orderedLexiconKeys`/`orderedLexemeIds` keeps that order; a site using `lexKeys` →
`lexIds`. Never swap one for the other, never add `.sort()`. Many phonology sites already hold a gloss
purely to fetch a form — those become `lexFormById(lang, id)` once the iterator yields ids.

- [ ] **Step 1: Apply the conversion pattern** to every file + test. Order-sensitive example:

```ts
// Before:  for (const m of orderedLexiconKeys(lang)) { const f = lexGet(lang, m); /* …draw rng… */ }
// After:   for (const id of orderedLexemeIds(lang.lexemes, lang)) { const f = lexFormById(lang, id); /* …draw rng… */ }
```
If a site needs the gloss for legality/sensitivity (e.g. `glossResolverForSweep` consumers), resolve via
`meaningForLexemeId(lang, id)` (seeded) — apply.ts already has the keyless-aware resolver; do not duplicate it.

- [ ] **Step 2: Gate** — tsc + `npx vitest run --dir src phonology regular sandhi tonogenesis ot orthography pruning realism_overhaul_phonology` (the phonology suites) + `RUN_SLOW=1 meaning_layer_baseline`. Expected: tsc 0; targeted green; baseline 12/12 unchanged. (Phonology is where a byte-identity break shows first — if the baseline shifts, an order/value bug was introduced; fix it.)

- [ ] **Step 3: Commit**

```bash
git add src/engine/phonology
git commit -m "refactor(storage): id-native addressing in phonology/ (S3 B2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B3: Convert `src/engine/morphology/`

**Files (Modify + their `__tests__`):** `evolve.ts`, `conjugation.ts`, `ablaut.ts`, `gender.ts`,
`derivation.ts`, `analogy.ts`, `citation.ts`, `inflectionClass.ts`, `morphemeInventory.ts`.

**Subsystem note:** `evolve.ts` has the most sites (21) and already imports `LexemeId` +
`meaningForLexemeId` and uses `evolvableLexemes(lang)` (which yields ids). Sites iterating
`evolvableLexemes` already hold ids — drop any `meaningForLexemeId`→`lexGet(gloss)` round-trip in favor of
`lexFormById(lang, id)`. Satellite writes (`satSet(lang, "inflectionClass", …)`, suppletion, ablaut class)
take the id directly.

- [ ] **Step 1: Apply the conversion pattern** to every file + test. Example (drop a needless round-trip):

```ts
// Before:  const gloss = meaningForLexemeId(lang, id)!; const form = lexGet(lang, gloss)!;
// After:   const form = lexFormById(lang, id)!;
```

- [ ] **Step 2: Gate** — tsc + `npx vitest run --dir src morphology_evolve conjugation_tables ablaut noun_declension inflectionClass analogy morpheme_inventory grammaticalization` + `RUN_SLOW=1 meaning_layer_baseline`. Expected: tsc 0; targeted green; baseline 12/12 unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/engine/morphology
git commit -m "refactor(storage): id-native addressing in morphology/ (S3 B3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B4: Convert `src/engine/semantics/`

**Files (Modify + their `__tests__`):** `drift.ts`, `recarve.ts`, `homonyms.ts`, `bleaching.ts`,
`lexicostat.ts`, `grounding.ts`, `languageMorphemes.ts`.

**Subsystem note:** `recarve.ts` already works in ids (`recarveMergeCandidateIds`, `lexDelete` keyless-id
branch from S2b) — convert its remaining `lexGet`/`lexHas`/`lexSet` to the id forms. SEMANTIC string ops
(`isRegisteredConcept(gloss)`, neighbor/cluster table lookups, `nearestLexicalisedMeaning`) are
soft-boundaries: keep the id, call `meaningForLexemeId(lang, id)!` for the string/table op.

- [ ] **Step 1: Apply the conversion pattern** to every file + test. Soft-boundary example:

```ts
// Before:  if (isRegisteredConcept(m) && lexHas(lang, m)) { … }
// After:   const m = meaningForLexemeId(lang, id); if (m !== undefined && isRegisteredConcept(m) && lexHasById(lang, id)) { … }
```

- [ ] **Step 2: Gate** — tsc + `npx vitest run --dir src drift recarve split homonyms bleaching lexicostat grounding seed_colexification frequency_direction` + `RUN_SLOW=1 meaning_layer_baseline`. Expected: tsc 0; targeted green; baseline 12/12 unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/engine/semantics
git commit -m "refactor(storage): id-native addressing in semantics/ (S3 B4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B5: Convert `src/engine/genesis/` + `src/engine/steps/`

**Files (Modify + their `__tests__`):**
- genesis/: `catalog.ts`, `need.ts`, `phonotactics.ts`, `semanticGap.ts`, `mechanisms/blending.ts`,
  `mechanisms/compound.ts`, `mechanisms/clipping.ts`, `mechanisms/calque.ts`, `mechanisms/derivation.ts`,
  `mechanisms/targetedDerivation.ts`, `mechanisms/conversion.ts`, `mechanisms/reduplication.ts`.
- steps/: `genesis.ts`, `init.ts`, `helpers.ts`, `copula.ts`, `learner.ts`, `creolization.ts`,
  `inventoryManagement.ts`, `obsolescence.ts`, `phonology.ts`.

**Subsystem note — the COINAGE boundary.** Genesis coins NEW seeded words for need-concepts (glosses) —
those `lexSet(lang, newGloss, form)` calls become `coinSeededLexeme(lang, newGloss, form)` (the blessed
mint). Existing-word reads/updates use the id forms. `steps/init.ts` runs at birth before ids may exist —
it operates on the gloss-keyed preset shape via `rekeyLexiconToLexemeIds`; leave birth wiring intact and
only convert post-birth reads.

- [ ] **Step 1: Apply the conversion pattern** to every file + test. Coinage example:

```ts
// Before (new word):  lexSet(lang, needGloss, form);
// After:              coinSeededLexeme(lang, needGloss, form);
```

- [ ] **Step 2: Gate** — tsc + `npx vitest run --dir src genesis genesis_need genesis_mechanisms semantic_gap copula creolization obsolescence keyless_gap_coinage keyless_process_widening` + `RUN_SLOW=1 meaning_layer_baseline`. Expected: tsc 0; targeted green; baseline 12/12 unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/engine/genesis src/engine/steps
git commit -m "refactor(storage): id-native addressing in genesis/ + steps/ (S3 B5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B6: Convert `src/engine/translator/`

**Files (Modify + their `__tests__`):** `translate.ts`, `sentence.ts`, `realise.ts`, `reverse.ts`,
`abstraction.ts`, `cognates.ts`, `closedClass.ts`, `ast.ts`, `gracefulFallback.ts`.

**Subsystem note — TRANSLATOR ENTRY boundary.** The translator's input is a concept/gloss to render. Resolve
gloss→id once at entry (`idForGloss`), work in ids internally, and resolve id→gloss (`meaningForLexemeId`)
only for output glossNotes/labels. `reverse.ts` builds a gloss-keyed reverse index — it iterates `lexIds`
and labels each via `meaningForLexemeId`. Keep `lookupForm`'s public `meaning: Meaning` signature (it is a
boundary API consumed by narrative + UI); convert only its body.

- [ ] **Step 1: Apply the conversion pattern** to every file + test, resolving gloss→id at translator entry.

- [ ] **Step 2: Gate** — tsc + `npx vitest run --dir src translator translator_reverse translator_tree translator_agnosticism translator_semantic_grounding realise_role_clause closed_class_protection cognates abstract_pivot graceful_fallback` + `RUN_SLOW=1 meaning_layer_baseline`. Expected: tsc 0; targeted green; baseline 12/12 unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/engine/translator
git commit -m "refactor(storage): id-native addressing in translator/ (S3 B6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B7: Convert `src/engine/narrative/`

**Files (Modify + their `__tests__`):** `composer.ts`, `generate.ts`, `discourse_generate.ts`, `pools.ts`.

**Subsystem note — NARRATIVE SELECTION boundary.** Narrative picks concepts (glosses) from pools to build
sentences. Resolve gloss→id at selection time; carry ids through composition; resolve id→gloss for the
surface gloss line. `pools.ts` builds candidate sets — iterate `lexIds` and keep `(id, gloss)` pairs where a
gloss is needed for display.

- [ ] **Step 1: Apply the conversion pattern** to every file + test.

- [ ] **Step 2: Gate** — tsc + `npx vitest run --dir src narrative_copula narrative_discourse narrative_negation_coord narrative_gloss_clean` + `RUN_SLOW=1 meaning_layer_baseline`. Expected: tsc 0; targeted green; baseline 12/12 unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/engine/narrative
git commit -m "refactor(storage): id-native addressing in narrative/ (S3 B7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B8: Convert `contact/`, `tree/`, `diagnostics/`, `naming.ts`, `achievements/`, `persistence/`

**Files (Modify + their `__tests__`):**
- contact/: `areal_phonology.ts`, `borrow.ts`, `calque.ts`
- tree/: `reconstruction.ts`, `correspondences.ts`
- diagnostics/: `scorecard.ts`, `buildScorecard.ts`
- `src/engine/naming.ts`, `src/engine/achievements/catalog.ts`
- `src/persistence/export.ts`

**Subsystem note:** `naming.ts` iterates the lexicon RNG-ordered for name generation — preserve its order
(`orderedLexemeIds`). `reconstruction.ts`/`correspondences.ts` walk parent/daughter lexemes by id already
(via `meaningForLexemeId`) — convert their form reads. `persistence/export.ts` is a boundary (serializes
gloss→form for human-readable export): resolve id→gloss via `meaningForLexemeId` at the export edge.

- [ ] **Step 1: Apply the conversion pattern** to every file + test.

- [ ] **Step 2: Gate** — tsc + `npx vitest run --dir src contact reconstruction reconstruction_msa correspondences realism_scorecard sprint2_map_translator` + `RUN_SLOW=1 meaning_layer_baseline`. Expected: tsc 0; targeted green; baseline 12/12 unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/engine/contact src/engine/tree src/engine/diagnostics src/engine/naming.ts src/engine/achievements src/persistence
git commit -m "refactor(storage): id-native addressing in contact/tree/diagnostics/persistence (S3 B8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B9: Convert `src/ui/`

**Files (Modify + their `__tests__`):** `CognateExplorer.tsx`, `CompareView.tsx`, `DictionaryView.tsx`,
`DebugOverlay.tsx`, `GrammarView.tsx`, `GlobalSearch.tsx`, `LexiconView.tsx`, `LanguageTreeView.tsx`,
`LanguageProfile.tsx`, `MapView.tsx`, `PhonologySandbox.tsx`, `ReproduceForm.tsx`, `StatsPanel.tsx`,
`SelectedLanguageBar.tsx`.

**Subsystem note — UI DISPLAY boundary.** Components show labels to users and search by label. Hold ids in
component state where they identify a word; resolve id→label (`meaningForLexemeId`, or `effectiveGlossFor`
for keyless) at render; resolve label→id (`idForGloss`) on user search/selection. `DictionaryView` already
surfaces emergent glosses — keep its display logic; only convert its store reads to id-native.

- [ ] **Step 1: Apply the conversion pattern** to every component + test.

- [ ] **Step 2: Gate** — tsc + `npx vitest run --dir src dictionary_homonyms lexicon_badges` (the UI tests) + the full FAST UI render tests + `RUN_SLOW=1 meaning_layer_baseline`. Expected: tsc 0; targeted green; baseline 12/12 unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/ui
git commit -m "refactor(storage): id-native addressing in ui/ (S3 B9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B10: Cleanup — remove the gloss-in seam API

**Files:**
- Modify: `src/engine/lexicon/access.ts` (remove gloss-in adapters)
- Modify: `src/engine/lexicon/lexemeIdentity.ts` (retire `orderedLexiconKeys`)
- Modify: `src/engine/__tests__/meaning_layer_baseline.test.ts` (signature now id-native)
- Modify: any residual gloss-in callers surfaced by tsc

- [ ] **Step 1: Update the baseline-test consumer** — `meaning_layer_baseline.test.ts` currently imports
  `lexKeys, lexGet`. Rewrite its `signature()` lexicon line to be id-native but produce the **same**
  `gloss=form` strings (so the locked hashes are unchanged):

```ts
import { formToString } from "../phonology/ipa";
import { lexIds, lexFormById } from "../lexicon/access";
import { meaningForLexemeId } from "../lexicon/lexemeIdentity";
// …
const lex = lexIds(lang)
  .map((id) => `${meaningForLexemeId(lang, id)!}=${formToString(lexFormById(lang, id)!)}`)
  .sort()
  .join("|");
```
(Sort the combined `gloss=form` strings? No — match the original: sort by gloss. Build the array as
`[gloss, str]`, sort by gloss, then join the `str`s — or, since each entry begins with the gloss, sorting
the `gloss=form` strings reproduces the gloss sort EXCEPT for the prefix-gloss edge case the original
comment flagged. To be safe, sort by gloss explicitly:)

```ts
const lex = lexIds(lang)
  .map((id) => ({ g: meaningForLexemeId(lang, id)!, f: formToString(lexFormById(lang, id)!) }))
  .sort((a, b) => (a.g < b.g ? -1 : a.g > b.g ? 1 : 0))
  .map((e) => `${e.g}=${e.f}`)
  .join("|");
```

- [ ] **Step 2: Run the baseline FIRST (still on adapters) to confirm the test rewrite is byte-identical**

Run: `$env:RUN_SLOW=1; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null`
Expected: 12/12 pass, no hash changes. (Proves the id-native signature equals the gloss signature before we delete anything.)

- [ ] **Step 3: Remove the gloss-in adapters** from `access.ts` — delete `lexGet`, `lexHas`, `lexSet`,
  `lexDelete`, `lexKeys`, `lexValues`, `lexEntries`, `lexSize`. In `lexemeIdentity.ts` delete
  `orderedLexiconKeys` (callers now use `orderedLexemeIds`).

- [ ] **Step 4: Let tsc find every residual caller and convert it**

Run: `npx tsc --noEmit`
Expected: errors listing any remaining gloss-in callers. Convert each per the pattern until tsc is clean.
(There should be few — B1–B9 converted production + their tests; this catches stragglers, e.g. shared test
helpers.) Re-run until: 0 errors.

- [ ] **Step 5: Full verification**

Run: `npx vitest run --dir src` → Expected: full FAST suite green (≈2033+ passed / 0 failed).
Run: `$env:RUN_SLOW=1; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null` → Expected: 12/12 pass, **no hash changes** across all 6 presets (GEN0 + GENN). Byte-identical end-to-end.

- [ ] **Step 6: Update docs + memory**

- Append an S3-DONE ledger entry to `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md`
  (mark "S3 thread LexemeId … DONE byte-identical"; note S4–S6 remain).
- Update the memory `vector-native-lexicon-flip-active.md` (S3 DONE byte-identical; S4 NEXT) and its
  `MEMORY.md` index line.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(storage): retire gloss-in lexicon seam API — barcode-native end-to-end (S3 B10)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final review

After B10, dispatch a code-review subagent (read-only) over the full S3 commit range
(`git diff <B0^>..HEAD`) checking: (1) no production gloss-in seam call survives; (2) every boundary in
spec §4 is the only place gloss↔id resolution happens; (3) no order contract was altered (no `lexIds`↔
`orderedLexemeIds` swap, no new `.sort()`); (4) baseline hashes unchanged. Then use
`superpowers:finishing-a-development-branch` conventions (local only — do not push).

---

## Self-review (against the spec)

**Spec coverage:** §1 goal → B0–B10; §3.1 new API → B0 (with `glossFor`≡`meaningForLexemeId` noted, DRY);
§3.2 `coinSeededLexeme` → B0 + used at B5 coinage boundary; §3.3 order discipline → conversion-pattern
determinism rules + every batch's baseline gate; §4 boundaries → B5 (coinage), B6 (translator), B7
(narrative), B8 (persistence/export), B9 (UI), soft-boundary rule in pattern + B4; §5 batches → B0–B10
one-to-one; §6 gates → per-batch gate block + B10 full verification; §7 execution-inline + risks →
execution note + determinism discipline. No gaps.

**Placeholder scan:** none — every batch lists exact files, a concrete before/after, exact gate commands,
and a commit. Bulk batches intentionally use pattern+file-list+gate (S1-T2 precedent), not per-line
enumeration.

**Type consistency:** `lexFormById`/`lexSetFormById`/`lexHasById`/`lexDeleteById`/`lexIds`/`idForGloss`/
`coinSeededLexeme` used identically in B0 definition and B1–B10 usage; `meaningForLexemeId` (not a new
`glossFor`) used for id→gloss throughout; `orderedLexemeIds(lang.lexemes, lang)` signature matches
lexemeIdentity.ts.
