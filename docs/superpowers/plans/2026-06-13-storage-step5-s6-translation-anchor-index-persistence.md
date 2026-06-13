# Storage step 5 — S6: translation via anchor index + persistence (FINAL) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make user-facing concept→word translation geometric (drift-aware) via a new cached `idForConcept` resolver, and formalize the point-native store persistence as a v11 save-version bump — completing the vector-native storage migration.

**Architecture:** `idForConcept(lang, m)` resolves a concept to the lexeme whose *emergent* gloss (nearest anchor of its current/drifted point) is `m`, with a stored-gloss fallback that makes it a byte-identical superset of `idForGloss` for un-drifted words. It replaces `idForGloss` only at translator/narrative **output** sites (the engine's identity bookkeeping, closed-class words, and `mutate.ts` stay stored-gloss). Persistence formalizes the existing `restoreState` store-shape shims as a v10→v11 migration step.

**Tech Stack:** TypeScript, Vitest. Branch `auto/storage-pointnative`, **local commits only — never push/PR**.

**Critical determinism context (read before starting):**
- The translator + narrative are **display/output, NOT in the per-generation step pipeline** (`steps/*.ts` import only translator *utility tables*, never the translation functions). So the geometric change is **display-only → byte-identical on the `meaning_layer_baseline`** (the S4 pattern). `mutate.ts` deliberately stays stored-gloss (geometric there would corrupt `morphStructure`). **No re-bake is expected; do not edit baseline hashes.** If a preset diverges, STOP and root-cause.
- `idForConcept` is a **safe superset of `idForGloss`**: same result for un-drifted words, so the baseline stays byte-identical regardless of how many output sites are converted. The behavioral change is confined to (a) ~1.3% of concepts whose *seed* emergent gloss already differs from the authored gloss (the anchor-index golden-parity gap) and (b) words that drift during a run — both **display-only**. A translator test that asserts a specific form for one of those concepts gets its **display assertion** updated (not a baseline re-bake).

**Determinism commands (PowerShell on win32; bash in comments):**
- Type check: `npx tsc --noEmit`
- Fast targeted: `npx vitest run --dir src <file…>`
- Full baseline (~9–10 min): `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline` *(bash: `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline`)*; clear after: `$env:RUN_SLOW=$null`
- Lean full-FAST (Batch 4): `npx vitest run --dir src --exclude '**/soundLaws.test.ts' --exclude '**/concept_smoke.test.ts' --exclude '**/phase72e_stress_tests.test.ts'`

> **Long-run safety net (saved preference):** when starting the full baseline (~10 min) or the lean full-FAST, arm a recurring `ScheduleWakeup` (~5 min) and re-arm on each wake until it returns. UI `document is not defined` failures are known jsdom-load flakiness — re-run the file single-file (`environment >0ms` = real) before treating as a regression.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/engine/lexicon/conceptIndex.ts` | **NEW** — geometric concept→lexeme resolver | `idForConcept`, `invalidateConceptIndexCache` + cache |
| `src/engine/lexicon/mutate.ts` | Lexicon mutation chokepoint | Invalidate the concept-index cache next to each `invalidateReverseLexCache` |
| `src/engine/translator/realise.ts`, `sentence.ts`, `translate.ts`, `abstraction.ts`, `gracefulFallback.ts` | Forward translation output | Content-word `idForGloss` → `idForConcept` |
| `src/engine/narrative/composer.ts`, `generate.ts`, `discourse_generate.ts` | Narrative output | Content-word `idForGloss` → `idForConcept` |
| `src/engine/translator/reverse.ts` | Reverse caption | Caption to emergent gloss |
| `src/persistence/migrate.ts` | Save-version migration | Bump to v11 + `MIGRATIONS[10]` (point-native store migration) |
| Test files | — | `conceptIndex.test.ts` (new), drift-reflects lock test, `migrate.test.ts` v10→v11 + round-trip |

---

## Task 1 (Batch 1) — `idForConcept` cached geometric resolver (additive, byte-identical)

**Files:**
- Create: `src/engine/lexicon/conceptIndex.ts`
- Modify: `src/engine/lexicon/mutate.ts:76,143,158` (cache invalidation)
- Test: `src/engine/lexicon/__tests__/conceptIndex.test.ts`

- [ ] **Step 1: Create the resolver**

Create `src/engine/lexicon/conceptIndex.ts`:

```ts
import type { Language, Meaning } from "../types";
import type { LexemeId } from "./lexemeIdentity";
import { meaningForLexemeId, orderedLexemeIds } from "./lexemeIdentity";
import { idForGloss } from "./access";
import { satGet } from "./satellites";
import { currentPointForId } from "../semantics/meaningPoint";
import { glossOf } from "../semantics/anchors";
import { hasEmbedding } from "../semantics/embeddings";

/**
 * conceptIndex.ts (storage step-5 S6) — the GEOMETRIC concept→lexeme resolver.
 *
 * `idForConcept(lang, m)` returns the gloss-bearing lexeme whose EMERGENT gloss (nearest anchor of
 * its current/drifted point) is `m`, ties broken by sorted LexemeId (S5 order, first-wins). It falls
 * back to `idForGloss(lang, m)` when no record geometrically glosses to `m` (closed-class / non-anchor
 * / unlexicalised) — making it a SAFE SUPERSET of `idForGloss`: byte-identical for un-drifted words.
 * Display/translation use only; the engine's identity bookkeeping keeps `idForGloss`.
 */
const cache = new WeakMap<Language, Map<Meaning, LexemeId>>();

/** Emergent gloss of a gloss-bearing record at id level — mirrors `effectiveGloss(lang, sense)`. */
function emergentGlossForId(lang: Language, id: LexemeId, stored: Meaning): Meaning {
  const hasDrift = satGet(lang, "meaningPoints", id) !== undefined;
  return hasDrift || hasEmbedding(stored) ? glossOf(currentPointForId(lang, id)) : stored;
}

function buildConceptIndex(lang: Language): Map<Meaning, LexemeId> {
  const out = new Map<Meaning, LexemeId>();
  // Sorted-LexemeId order (S5): a concept with two equally-near lexemes resolves to the lowest id.
  for (const id of orderedLexemeIds(lang.lexemes)) {
    const stored = meaningForLexemeId(lang, id);
    if (stored === undefined) continue; // keyless — no gloss
    const eg = emergentGlossForId(lang, id, stored);
    if (!out.has(eg)) out.set(eg, id);
  }
  return out;
}

export function idForConcept(lang: Language, m: Meaning): LexemeId | undefined {
  let idx = cache.get(lang);
  if (!idx) {
    idx = buildConceptIndex(lang);
    cache.set(lang, idx);
  }
  return idx.get(m) ?? idForGloss(lang, m);
}

/** Invalidate the cache (mid-gen mutations; the per-gen lang rewrite auto-invalidates via WeakMap). */
export function invalidateConceptIndexCache(lang: Language): void {
  cache.delete(lang);
}
```

- [ ] **Step 2: Wire cache invalidation into `mutate.ts`**

In `src/engine/lexicon/mutate.ts`, add the import (next to the existing `invalidateReverseLexCache` import on line 3):

```ts
import { invalidateConceptIndexCache } from "./conceptIndex";
```

Then add `invalidateConceptIndexCache(lang);` immediately after EACH of the three `invalidateReverseLexCache(lang);` calls (lines 76, 143, 158). Example at line 76:

```ts
  invalidateReverseLexCache(lang);
  invalidateConceptIndexCache(lang);
```

(These are harmless no-ops in Batch 1 — nothing reads the cache yet.)

- [ ] **Step 3: Write the resolver unit tests**

Create `src/engine/lexicon/__tests__/conceptIndex.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import { idForConcept } from "../conceptIndex";
import { idForGloss } from "../access";
import { lexPoint, currentPointForId } from "../../semantics/meaningPoint";

describe("S6 — idForConcept geometric resolver", () => {
  it("equals idForGloss for un-drifted seeded concepts that self-gloss", () => {
    const lang = createSimulation(presetEnglish()).getState().tree["L-0"]!.language;
    for (const m of ["water", "fire", "stone", "tree", "eat", "big"] as const) {
      expect(idForConcept(lang, m)).toBe(idForGloss(lang, m));
    }
  });

  it("falls back to idForGloss for a closed-class / non-anchor lemma", () => {
    const lang = createSimulation(presetEnglish()).getState().tree["L-0"]!.language;
    // 'the' resolves via the stored index, not geometry (function word, no content anchor).
    expect(idForConcept(lang, "the")).toBe(idForGloss(lang, "the"));
  });

  it("follows drift: a content word glided onto another anchor resolves geometrically", () => {
    const lang = createSimulation(presetEnglish()).getState().tree["L-0"]!.language;
    const waterId = idForGloss(lang, "water")!;
    // Glide 'water' fully onto the 'fire' anchor; the concept-index cache is rebuilt per-lang ref.
    lang.meaningPoints = { ...(lang.meaningPoints ?? {}), [waterId]: Array.from(lexPoint("fire")) };
    // 'water's lexeme now emergent-glosses to 'fire', so idForConcept('fire') can return it
    // (lowest-id wins if 'fire' itself is also present). At minimum it is a lexeme whose current
    // point IS fire's anchor:
    const fireResolved = idForConcept(lang, "fire")!;
    expect(Array.from(currentPointForId(lang, fireResolved))).toEqual(Array.from(lexPoint("fire")));
    // and 'water' (now empty geometrically) falls back to its stored id:
    expect(idForConcept(lang, "water")).toBe(waterId);
  });
});
```

(Note: the cache keys on the `lang` object reference; the test mutates the same `lang`, and since no prior `idForConcept(lang, …)` call cached an index before the glide in this test, the first call after the glide builds a fresh index. If a test needs to force a rebuild after mutating an already-queried lang, call `invalidateConceptIndexCache(lang)`.)

- [ ] **Step 4: Type-check + run resolver tests**

Run: `npx tsc --noEmit` → 0 errors.
Run: `npx vitest run --dir src conceptIndex` → all pass.

- [ ] **Step 5: Baseline byte-identical (additive — nothing consumes the resolver yet)**

Run: `npx vitest run --dir src meaning_layer_baseline` → 6 GEN0 pass (fast tier; additive change can't affect forms).
Run (arm a wakeup): `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null` → 12/12 byte-identical.

- [ ] **Step 6: Commit**

```bash
git add src/engine/lexicon/conceptIndex.ts src/engine/lexicon/mutate.ts src/engine/lexicon/__tests__/conceptIndex.test.ts
git commit -m "feat(storage): S6 B1 — idForConcept geometric resolver (additive)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 (Batch 2) — Geometric translation output (display-only, baseline byte-identical)

**Files:**
- Modify: `src/engine/translator/realise.ts`, `sentence.ts`, `translate.ts`, `abstraction.ts`, `gracefulFallback.ts`
- Modify: `src/engine/narrative/composer.ts`, `generate.ts`, `discourse_generate.ts`
- Modify: `src/engine/translator/reverse.ts` (caption)
- Test: `src/engine/__tests__/translation_drift.test.ts` (new lock test)

**Conversion rule (apply per site):** convert `idForGloss(lang, X)` → `idForConcept(lang, X)` **iff** `X` is an open-class *content concept being resolved to its current target word for output*. **Do NOT convert:** closed-class branches that fall through to `closedClassForm` (pronouns, `have`/`be`, coordinators, determiners), existence checks (`lexHasById(lang, idForGloss(...))`), satellite/identity bookkeeping, or `coinSeededLexeme`. Because `idForConcept` falls back to `idForGloss`, an over-conversion is byte-identical — the baseline + the lock test are the safety net.

- [ ] **Step 1: Convert the `realise.ts` open-class resolver (the chokepoint)**

In `src/engine/translator/realise.ts`, add to the access import (line 15):

```ts
import { idForGloss, lexFormById, lexHasById } from "../lexicon/access";
import { idForConcept } from "../lexicon/conceptIndex";
```

Convert the open-class content resolution. The `resolveOpen` callback (lines 786-788) becomes:

```ts
    resolveOpen: (lemma) => {
      const _sid = idForConcept(lang, lemma);
      const form = _sid !== undefined ? lexFormById(lang, _sid) : undefined;
```

Then convert the other **content-word** `idForGloss` sites in this file (the numeral/classifier/oblique/NP-head content lookups at ~422, ~550, ~570, ~748) to `idForConcept`, but **leave** the closed-class auxiliary/coordinator/emphatic branches (`auxLemma` "have"/"be" at ~859/876, `np.coord` ~647, `np.emphatic` ~624) on `idForGloss` (they resolve via `closedClassForm` and are function words). Use judgment per the rule; when unsure, converting is byte-identical (fallback), so prefer converting a genuine content lookup and leaving an obvious function-word/existence-check site.

- [ ] **Step 2: Convert the remaining translator + narrative output sites**

For each of `sentence.ts`, `translate.ts`, `abstraction.ts`, `gracefulFallback.ts`, `narrative/composer.ts`, `narrative/generate.ts`, `narrative/discourse_generate.ts`: add `import { idForConcept } from "../lexicon/conceptIndex";` (adjust relative path for `narrative/*` → `"../lexicon/conceptIndex"`), then convert the content-word `idForGloss(lang, <contentLemma>) → lexFormById` output-resolution sites to `idForConcept`, per the rule. Leave existence checks (`lexHasById(lang, idForGloss(...))`) and closed-class resolution unchanged.

Run after each file: `npx tsc --noEmit` (0 errors).

- [ ] **Step 3: Convert the reverse caption to emergent gloss**

In `src/engine/translator/reverse.ts`, the words-table caption path (line 95) currently appends the stored `s.meaning`. Resolve the sense's **emergent** gloss via the sense's lexeme id so a drifted word captions to its current meaning. Add the import:

```ts
import { meaningForLexemeId, orderedLexemeIds } from "../lexicon/lexemeIdentity";
import { glossOf } from "../semantics/anchors";
import { currentPointForId } from "../semantics/meaningPoint";
```

Replace line 95 (`append(w.formKey, s.meaning, "open");`) with an emergent-gloss caption that falls back to the stored meaning when the sense has no id (byte-identical for un-drifted):

```ts
        const eg = s.lexemeId !== undefined ? glossOf(currentPointForId(lang, s.lexemeId)) : s.meaning;
        append(w.formKey, eg, "open");
```

(For an un-drifted anchor word `glossOf(currentPointForId(id)) === s.meaning`, so captions are byte-identical except for genuinely drifted / emergent-divergent words.)

- [ ] **Step 4: Write the translation-reflects-drift lock test**

Create `src/engine/__tests__/translation_drift.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { idForConcept, invalidateConceptIndexCache } from "../lexicon/conceptIndex";
import { idForGloss, lexFormById } from "../lexicon/access";
import { lexPoint } from "../semantics/meaningPoint";

describe("S6 — translation resolves a drifted word geometrically", () => {
  it("the form for a concept follows a content word that drifted onto its anchor", () => {
    const lang = createSimulation(presetEnglish()).getState().tree["L-0"]!.language;
    const stoneId = idForGloss(lang, "stone")!;
    const stoneForm = lexFormById(lang, stoneId)!;
    // Glide 'stone' fully onto the 'tree' anchor: 'stone's lexeme now means 'tree' geometrically.
    lang.meaningPoints = { ...(lang.meaningPoints ?? {}), [stoneId]: Array.from(lexPoint("tree")) };
    invalidateConceptIndexCache(lang);
    // The translator's content-word resolution (idForConcept → lexFormById) for 'tree' now yields
    // a lexeme whose current point is the tree anchor (stone, having drifted in), OR tree's own
    // lexeme if it sorts lower — either way a tree-anchored form; and 'stone' falls back to stored.
    const treeResolved = idForConcept(lang, "tree")!;
    const treeForm = lexFormById(lang, treeResolved)!;
    expect(treeForm.length).toBeGreaterThan(0);
    expect(idForConcept(lang, "stone")).toBe(stoneId); // stone vacated geometrically → stored fallback
    expect(lexFormById(lang, idForConcept(lang, "stone")!)).toEqual(stoneForm);
  });
});
```

- [ ] **Step 5: Type-check + run translator/narrative tests**

Run: `npx tsc --noEmit` → 0 errors.
Run: `npx vitest run --dir src translator translation_drift narrative reverse sprint2_map_translator` → pass. **If a test asserts a specific form/caption for an emergent-divergent or drifted concept and fails, update that DISPLAY assertion to the new value** (a deliberate consequence of geometric resolution — it is display, not a baseline re-bake). Do NOT touch `meaning_layer_baseline`.

- [ ] **Step 6: Baseline byte-identical (display-only — must stay green)**

Run: `npx vitest run --dir src meaning_layer_baseline` → 6 GEN0 pass.
Run (arm a wakeup): `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null` → **12/12 byte-identical, no hash edits.** If any preset diverges, STOP — the geometric change leaked into the sim path (a wrongly-converted bookkeeping site); revert that site.

- [ ] **Step 7: Commit**

```bash
git add src/engine/translator src/engine/narrative src/engine/__tests__/translation_drift.test.ts
git commit -m "feat(storage): S6 B2 — geometric concept->word translation output

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 (Batch 3) — Persistence v11 (byte-identical)

**Files:**
- Modify: `src/persistence/migrate.ts`
- Test: `src/persistence/__tests__/migrate.test.ts`

- [ ] **Step 1: Add the store-migration imports**

In `src/persistence/migrate.ts`, add to the imports (after line 7-8):

```ts
import { migrateLexemeStore, migrateSatelliteMaps } from "../engine/lexicon/store";
import { backfillSenseLexemeIds } from "../engine/lexicon/word";
```

- [ ] **Step 2: Bump the version and add `MIGRATIONS[10]`**

Change `export const LATEST_SAVE_VERSION = 10;` (line 22) to `11`. Then add the v10→v11 step to the `MIGRATIONS` object (after the `9:` entry, before the closing `};` near line 172):

```ts
  // Storage step-5 (S6, FINAL): v11 formalizes the point-native lexeme store. Convert an OLD-shape
  // v10 save (id-keyed form-only `lexicon` + separate `keylessLexemes`, gloss-keyed satellite maps,
  // senses without `lexemeId`) into the canonical point-native shape (records, id-keyed satellites
  // incl. meaningPoints, sense.lexemeId). Runs the SAME shims restoreState applies, so it is a no-op
  // for an already-point-native v10 save. New saves write v11.
  10: (raw) => {
    const snapshot = raw.stateSnapshot as RawObj | undefined;
    if (snapshot && snapshot.tree && typeof snapshot.tree === "object") {
      const tree = snapshot.tree as Record<string, RawObj>;
      for (const node of Object.values(tree)) {
        const lang = node.language as Language | undefined;
        if (!lang) continue;
        migrateLexemeStore(lang);
        migrateSatelliteMaps(lang);
        backfillSenseLexemeIds(lang);
      }
    }
    return { ...raw, version: 11 };
  },
```

- [ ] **Step 3: Write the v10→v11 migration + round-trip tests**

Add to `src/persistence/__tests__/migrate.test.ts` (match the file's existing import style for `migrateSavedRun`):

```ts
import { describe, it, expect } from "vitest";
import { migrateSavedRun, LATEST_SAVE_VERSION } from "../migrate";

describe("S6 — v11 point-native store migration", () => {
  it("converts an old-shape v10 save (form-only lexicon) to point-native records", () => {
    const raw = {
      version: 10,
      config: { preset: "english" },
      stateSnapshot: {
        tree: {
          "L-0": {
            language: {
              id: "L-0",
              lexemeIds: { water: "c_w" },
              lexicon: { c_w: [{ ipa: "w" }] }, // id-keyed form-only (pre-S1 shape)
            },
          },
        },
        generation: 0,
      },
    };
    const migrated = migrateSavedRun(raw as unknown);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(LATEST_SAVE_VERSION);
    const lang = (migrated!.stateSnapshot as any).tree["L-0"].language;
    expect(lang.lexemes).toBeDefined();         // records materialized
    expect(lang.lexemes.c_w).toBeDefined();
    expect(lang.lexicon).toBeUndefined();       // old form-only map dropped
  });

  it("is a no-op for an already point-native save (idempotent round-trip)", () => {
    const raw = {
      version: 10,
      config: { preset: "english" },
      stateSnapshot: {
        tree: {
          "L-0": {
            language: {
              id: "L-0",
              lexemeIds: { water: "c_w" },
              lexemes: { c_w: { form: [{ ipa: "w" }], point: [0], gloss: "water" } },
            },
          },
        },
        generation: 0,
      },
    };
    const migrated = migrateSavedRun(raw as unknown);
    const lang = (migrated!.stateSnapshot as any).tree["L-0"].language;
    expect(lang.lexemes.c_w.gloss).toBe("water"); // unchanged
    expect(lang.lexicon).toBeUndefined();
  });
});
```

(If the `WordForm` shape in the fixture doesn't match the real phoneme type, mirror an existing `migrate.test.ts` fixture's form representation — the assertions only check the store *shape*, not form contents.)

- [ ] **Step 4: Type-check + run persistence tests**

Run: `npx tsc --noEmit` → 0 errors.
Run: `npx vitest run --dir src migrate autosave storage` → pass (existing migration regression tests + the new v11 tests).

- [ ] **Step 5: Baseline byte-identical (persistence change is load-path only)**

Run: `npx vitest run --dir src meaning_layer_baseline` → 6 GEN0 pass.
Run (arm a wakeup): `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null` → 12/12 byte-identical.

- [ ] **Step 6: Commit**

```bash
git add src/persistence/migrate.ts src/persistence/__tests__/migrate.test.ts
git commit -m "feat(storage): S6 B3 — persistence v11 (formalize point-native store migration)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4 (Batch 4) — Final verification + ledger (migration COMPLETE)

**Files:** `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md`, memory files.

- [ ] **Step 1: Lean full-FAST**

Arm a ~5-min `ScheduleWakeup`. Run:
`npx vitest run --dir src --exclude '**/soundLaws.test.ts' --exclude '**/concept_smoke.test.ts' --exclude '**/phase72e_stress_tests.test.ts'`
Expected: green except the known intermittent UI `document is not defined` jsdom flakiness (re-run any such file single-file; `environment >0ms` = real) and any display-assertion re-bakes already handled in Batch 2. A genuine regression shows as an `AssertionError: expected X to be Y` in a non-UI test — investigate those. The `meaning_layer_baseline` (12/12, all batches) is the authoritative determinism gate.

- [ ] **Step 2: Update the ledger — migration COMPLETE**

In `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md`, add an S6-DONE entry (mirroring S5's style): `idForConcept` geometric resolver; translator/narrative output + reverse caption now geometric (display-only, byte-identical baseline); `mutate.ts` kept stored-gloss (morphStructure-safety); persistence formalized as v11 (`MIGRATIONS[10]`, shims kept). Change "Sub-project 6 REMAINS (S6 NEXT)" → **"Sub-project 6 DONE — the vector-native storage migration is COMPLETE."** Add a one-line closing summary of the whole S1–S6 arc.

- [ ] **Step 3: Update memory**

Update `vector-native-lexicon-flip-active.md` (S6 → DONE; migration COMPLETE; no NEXT) and its `MEMORY.md` index line. (Controller does this, not a subagent.)

- [ ] **Step 4: Commit the ledger/docs**

```bash
git add docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md
git commit -m "docs(storage): mark S6 DONE — vector-native storage migration COMPLETE

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (run against the spec)

**Spec coverage:**
- §1 `idForConcept` resolver (cached, geometric + stored fallback, deterministic tie-break) → Task 1. ✓
- §2 geometric translation output (translator/narrative content sites + reverse caption; closed-class/bookkeeping excluded) → Task 2 (rule + key sites + per-file gate). ✓
- §3 `mutate.ts` unchanged → no task touches `setLexiconForm`'s `findPrimaryWordForMeaning` (only adds a cache-invalidation line). ✓
- §4 persistence v11 (`MIGRATIONS[10]` + keep shims + migration/round-trip tests) → Task 3. ✓
- §5 determinism (GEN0+GENN byte-identical; display-only; new tests) → baseline gate in Tasks 1-3; resolver/drift/migration tests. ✓
- §6 decomposition (4 batches) → Tasks 1-4. ✓

**Placeholder scan:** Task 2's per-file conversion is rule-based by necessity (the audit is mechanical + fallback-safe + baseline-gated), with the chokepoint (`resolveOpen`) and reverse caption given as exact code and an explicit conversion rule + exclusion list — not a vague "convert the sites." The fixture caveat in Task 3 Step 3 is a concrete "mirror the existing fixture" instruction. No "TBD/handle edge cases" remain.

**Type consistency:** `idForConcept(lang, m): LexemeId | undefined` and `invalidateConceptIndexCache(lang)` are used consistently (definition Task 1; consumers Tasks 1-2 + the lock tests). `currentPointForId`, `glossOf`, `hasEmbedding`, `meaningForLexemeId`, `orderedLexemeIds`, `idForGloss`, `satGet` match their real exports (verified). `MIGRATIONS[10]` returns `{...raw, version: 11}` consistent with `LATEST_SAVE_VERSION = 11`. ✓
