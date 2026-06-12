# Storage step 5 — S5: intrinsic LexemeId RNG order — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the canonical per-word RNG draw order off the English gloss to lexicographic-by-LexemeId (`orderedLexemeIds = Object.keys(lexicon).sort()`), making the simulation trajectory gloss-independent, and re-bake the GENN determinism baseline for all 6 presets.

**Architecture:** A single function (`orderedLexemeIds`) defines the canonical RNG-draw order. Changing its sort key from gloss to LexemeId propagates trajectory-wide because the phonology sweep returns its store keyed in that order and `mergeFormsIntoStore` rebuilds the store (hence `lexIds`) in it every step. GEN0 is untouched (no sweep at seed); GENN re-bakes by design.

**Tech Stack:** TypeScript, Vitest. Branch `auto/storage-pointnative`, **local commits only — never push/PR**.

**Critical determinism context (read before starting):**
- This is a **deliberate trajectory re-bake** — the first S-sub-project that changes the baseline by design. The `meaning_layer_baseline` GENN hashes for all 6 presets WILL change and ARE updated here. This is the ONE place editing those hashes is correct.
- **GEN0 is a hard guard.** The order only affects the per-step sweep; gen-0 seed forms are untouched. The GEN0 hashes (`meaning_layer_baseline.test.ts:81-91`) must **NOT** change. If any GEN0 hash fails after the flip, STOP — the change leaked into seed state (a bug), do not edit GEN0.
- **Reproducibility is required.** Same config → identical output. Capture the new GENN hashes, then run the full baseline a SECOND time and confirm 12/12 green with those same hashes before committing.
- The per-word sound-change sub-rng is seeded from each word's own LexemeId ([apply.ts:912-918](../../../src/engine/phonology/apply.ts#L912)) — already order-independent, unchanged. The trajectory shift comes from the main shared-rng draw sequence reordering + the store-key reorder propagating to `lexIds` sites.

**Determinism commands (PowerShell on win32; bash equivalent in comments):**
- Type check: `npx tsc --noEmit`
- Fast targeted: `npx vitest run --dir src <file…>`
- GEN0 fast tier (all 6 presets, ~5s): `npx vitest run --dir src meaning_layer_baseline` *(no RUN_SLOW → runs only the gen-0 byte-identity tier)*
- Full GENN baseline (~9–10 min): `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline`  *(bash: `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline`)*. **Clear the flag after:** `$env:RUN_SLOW=$null`

> **Long-run safety net (saved preference):** when you start the full baseline (~10 min) or the full FAST suite, arm a recurring `ScheduleWakeup` (~5 min) and re-arm on each wake until the run returns.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/engine/lexicon/lexemeIdentity.ts` | Canonical RNG-draw order | `orderedLexemeIds` → `Object.keys(lexicon).sort()`; drop `lang` param + gloss-sort; update docstring |
| `src/engine/phonology/apply.ts` | Sound-change sweep | Collapse the `lang ? … : …` ternary to `orderedLexemeIds(lexicon)` |
| `src/engine/naming.ts` | Language-name generation | Drop `lang` arg; update the gloss-sorted comment |
| `src/engine/translator/reverse.ts` | Reverse-lex map (else branch) | Drop `lang` arg; update the gloss-sorted comment |
| `src/engine/__tests__/concept_order_seam.test.ts` | Order-contract lock | Rewrite: assert id-sorted store keys, not sorted glosses |
| `src/engine/__tests__/meaning_layer_baseline.test.ts` | Determinism baseline | Update the 6 `GENN` hashes (GEN0 untouched) |
| `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md` | Migration ledger | S5-DONE entry |

---

## Task 1 (Batch 1) — The flip + the deliberate GENN re-bake (one commit)

**Files:** as above (all except the ledger).

- [ ] **Step 1: Flip `orderedLexemeIds`**

In `src/engine/lexicon/lexemeIdentity.ts`, replace the whole `orderedLexemeIds` function (currently lines 91-121, docstring + body) with:

```ts
/**
 * The canonical RNG-draw order: the store keys sorted lexicographically by their intrinsic
 * **LexemeId** (S5 — the deliberate gloss-independent flip). Replaces the prior gloss-sorted order.
 * Every RNG-coupled per-word draw walks this sequence (the phonology sweep in apply.ts, language
 * naming, reverse translation), so the trajectory no longer depends on any concept's English label.
 *
 * Takes `lexicon` explicitly (the engine passes its form-view; callers may pass the record store) —
 * only the KEYS are read, so the value type is loose. Identical to `Object.keys(lexicon).sort()`,
 * which is exactly what the sweep already used when no language was supplied.
 */
export function orderedLexemeIds(lexicon: Record<string, unknown>): LexemeId[] {
  return (Object.keys(lexicon) as LexemeId[]).sort();
}
```

Also update the orientation comment just above it (lines 47-49) — change the stale signature reference `orderedLexemeIds(lexicon, lang)` to `orderedLexemeIds(lexicon)`:

```ts
// S3 B10b / S5: `orderedLexiconKeys` (the gloss-sorted gloss list) is RETIRED, and the canonical
// RNG-draw order is now `orderedLexemeIds(lexicon)` below — the store keys sorted by intrinsic
// LexemeId (gloss-independent). Callers that need a gloss resolve id→gloss via `meaningForLexemeId`.
```

- [ ] **Step 2: Collapse the sweep's ternary in `apply.ts`**

In `src/engine/phonology/apply.ts`, lines 906-908 currently read:

```ts
  const keys: string[] = lang
    ? orderedLexemeIds(lexicon, lang)
    : Object.keys(lexicon).sort();
```

Both branches are now identical. Replace with:

```ts
  const keys: string[] = orderedLexemeIds(lexicon);
```

(`lang` is still used elsewhere in this function for `glossResolverForSweep(lang)` — leave that.)

- [ ] **Step 3: Update `naming.ts`**

In `src/engine/naming.ts`, the `generateName` body (lines 21-25) — drop the `lang` arg and update the comment:

```ts
export function generateName(parent: Language, rng: Rng): string {
  // SEEDED ids only, sorted by intrinsic LexemeId (S5: the canonical RNG-draw order is now
  // gloss-independent). orderedLexemeIds returns ALL store keys sorted; the keyless ones map to no
  // seed gloss and are filtered out so the rng.int(ids.length) bound stays the seeded count.
  const ids = orderedLexemeIds(parent.lexemes).filter((id) => meaningForLexemeId(parent, id) !== undefined);
```

- [ ] **Step 4: Update `reverse.ts`**

In `src/engine/translator/reverse.ts`, lines 99-101 — drop the `lang` arg and update the comment:

```ts
    // orderedLexemeIds = ALL store keys sorted by intrinsic LexemeId (S5, gloss-independent);
    // keyless ids (no gloss) are skipped below by the undefined-gloss guard.
    for (const id of orderedLexemeIds(lang.lexemes)) {
```

- [ ] **Step 5: Rewrite the order-contract test**

Replace the entire contents of `src/engine/__tests__/concept_order_seam.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetGermanic } from "../presets/germanic";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { orderedLexemeIds } from "../lexicon/lexemeIdentity";
import type { SimulationConfig } from "../types";

/**
 * S5 — ORDER-CONTRACT lock. The canonical RNG-draw order that the hot path (apply.ts, naming.ts,
 * reverse.ts) walks is `orderedLexemeIds` = the store keys sorted lexicographically by intrinsic
 * LexemeId — gloss-INDEPENDENT (the S5 flip). This freezes that contract so a regression to
 * gloss-sorting (or any other order) is caught here, not as a silent trajectory divergence in the
 * slow harness.
 */
const PRESETS: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  bantu: presetBantu,
  romance: presetRomance,
  germanic: presetGermanic,
  tokipona: presetTokipona,
  english: presetEnglish,
};

describe("concept-order seam — canonical order is sorted LexemeIds", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: canonical order (orderedLexemeIds) is the store keys sorted by LexemeId`, () => {
      const lang = createSimulation(build()).getState().tree["L-0"]!.language;
      expect(orderedLexemeIds(lang.lexemes)).toEqual(Object.keys(lang.lexemes).sort());
    });
  }
});
```

- [ ] **Step 6: Type-check and run targeted tests**

Run: `npx tsc --noEmit`
Expected: 0 errors (this surfaces any remaining `orderedLexemeIds(…, lang)` 2-arg call — there should be none left).

Run: `npx vitest run --dir src concept_order_seam naming translator regular`
Expected: pass. `concept_order_seam` now asserts the id-sorted contract. `naming`/`translator`/`regular` assert behavior/properties, not exact order, so they pass. **If any of these asserts a specific evolved form or generated name and fails, that is a deliberate re-bake** — update that one assertion to the new value (it changed because the draw order changed), re-run.

- [ ] **Step 7: Verify GEN0 is byte-identical (hard guard)**

Run: `npx vitest run --dir src meaning_layer_baseline`
Expected: **6 passed** (the gen-0 fast tier), 6 skipped. All GEN0 hashes still match. **If any GEN0 test fails, STOP** — the flip leaked into seed state; do not edit GEN0, investigate.

- [ ] **Step 8: Run the full baseline to capture the new GENN hashes**

Arm a ~5-min `ScheduleWakeup`. Run: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline`
Expected: the 6 gen-0 tests pass; the 6 **GENN** tests FAIL (this is the intended re-bake). For each preset the failure prints `Expected: "<old>"` / `Received: "<new>"`. Record the 6 `Received` values — these are the new locked hashes. (Old values, for reference: pie `96539fb4`, bantu `9cc04867`, romance `622cb632`, germanic `42b92e41`, tokipona `c8a2f719`, english `843f52f2`.)

- [ ] **Step 9: Update the 6 GENN hashes**

In `src/engine/__tests__/meaning_layer_baseline.test.ts`, replace the `GENN` map (lines 351-358) values with the 6 `Received` hashes from Step 8, and add a re-baseline comment above it documenting S5:

```ts
// GENN re-baselined 2026-06-12 (storage step-5 S5 — intrinsic LexemeId RNG order). The canonical
// per-word RNG draw order flipped from gloss-sorted to lexicographic-by-LexemeId
// (orderedLexemeIds = Object.keys(lexicon).sort()), making the trajectory gloss-INDEPENDENT. ALL
// SIX presets shift (the order reaches every sweep + every downstream lexIds draw). GEN0 unchanged
// (no sweep at seed). Reproducibility confirmed (full baseline run twice, identical). This is the
// deliberate iteration-order flip S3/S4 deferred — see
// docs/superpowers/specs/2026-06-12-storage-step5-s5-intrinsic-lexemeid-order-design.md.
const GENN: Record<string, string> = {
  pie: "<new-pie>",
  bantu: "<new-bantu>",
  romance: "<new-romance>",
  germanic: "<new-germanic>",
  tokipona: "<new-tokipona>",
  english: "<new-english>",
};
```

(Replace each `<new-…>` with the corresponding `Received` hash from Step 8. Leave `GEN0` untouched.)

- [ ] **Step 10: Re-run the full baseline → 12/12 green**

Run: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline`
Expected: **12 passed** (6 GEN0 + 6 GENN now matching the updated hashes).

- [ ] **Step 11: Reproducibility — run the full baseline a second time**

Run: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null`
Expected: **12 passed** again, identical. (Same config → identical output. If a hash differs between Step 10 and Step 11, the run is non-deterministic — STOP and investigate; do not commit.)

- [ ] **Step 12: Commit (code + test + hashes together)**

```bash
git add src/engine/lexicon/lexemeIdentity.ts src/engine/phonology/apply.ts src/engine/naming.ts src/engine/translator/reverse.ts src/engine/__tests__/concept_order_seam.test.ts src/engine/__tests__/meaning_layer_baseline.test.ts
git commit -m "feat(storage): S5 — intrinsic LexemeId RNG order (deliberate re-bake)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Committing code + updated hashes together keeps the commit green; the code change alone would leave GENN red.)

---

## Task 2 (Batch 2) — Verification + ledger

**Files:** `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md`, memory files.

- [ ] **Step 1: Full FAST suite**

Arm a ~5-min `ScheduleWakeup`. Run: `npx vitest run --dir src`
Expected: green except possibly (a) a handful of tests that assert a specific evolved form / generated name — those are **deliberate re-bakes**; update each failing assertion to its new value (the trajectory changed by design) and re-run that file; and (b) the known residual UI jsdom-under-load flakiness (`document is not defined` in `.tsx` files) — re-run any such file in isolation (`npx vitest run --dir src <file>`); it passes alone and is not a real failure (the polluting worktrees were pruned 2026-06-12). The determinism baseline (Task 1) is the authoritative gate.

If Step 1 required re-baking any form/name assertions, commit them:
```bash
git add -A
git commit -m "test(storage): S5 re-bake order-dependent assertions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 2: Update the ledger**

In `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md`, add an S5-DONE entry under the sub-project list (mirroring the S4 entry style): note that the canonical RNG-draw order is now `orderedLexemeIds = Object.keys(lexicon).sort()` (intrinsic LexemeId, gloss-independent), that all 6 GENN hashes were deliberately re-baked (GEN0 byte-identical, reproducible), and the commit(s). Change "Sub-projects 5-6 REMAIN (S5 NEXT)" → "Sub-project 6 REMAINS (S6 NEXT)".

- [ ] **Step 3: Update memory**

Update `vector-native-lexicon-flip-active.md` (S5 → DONE; S6 NEXT) and its `MEMORY.md` index line. (Controller does this, not a subagent.)

- [ ] **Step 4: Commit the ledger/docs**

```bash
git add docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md
git commit -m "docs(storage): mark storage step-5 sub-project S5 DONE

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (run against the spec)

**Spec coverage:**
- §1 the flip (`orderedLexemeIds → Object.keys(lexicon).sort()`, drop lang param) → Task 1 Step 1. ✓
- §2 consumers (apply ternary collapse, naming arg+comment, reverse arg+comment) + test rewrite → Task 1 Steps 2-5. ✓
- §3 determinism (GEN0 byte-identical guard, GENN re-bake all 6, reproducibility via two runs) → Task 1 Steps 7-11. ✓
- §4 decomposition (Batch 1 flip+re-bake one commit; Batch 2 full FAST + ledger) → Tasks 1-2. ✓

**Placeholder scan:** The `<new-…>` hash tokens in Task 1 Step 9 are runtime-captured values (Step 8 produces them) with an explicit capture instruction — not vague placeholders. Task 2 Step 1's "handful of tests" is bounded with a concrete handling rule (re-bake the assertion) and the authoritative gate named (the baseline). No "TBD/handle edge cases" remain.

**Type consistency:** `orderedLexemeIds(lexicon)` (1-arg) is used consistently in Steps 1-5 (definition + all 3 call sites + the test). The dropped `lang` param is removed at every call site (apply, naming, reverse). `GENN` map shape matches the existing `Record<string, string>`. ✓
