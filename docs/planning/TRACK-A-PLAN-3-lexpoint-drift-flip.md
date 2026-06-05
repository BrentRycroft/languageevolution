# Track A · Plan 3 — `lexPoint` as Source of Truth + Drift Flip

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a concept's meaning a first-class *point* (`lexPoint`) seeded from the baked morpheme space, and flip the drift hot-path to navigate that compositional space — one deliberate determinism re-baseline.

**Architecture:** `lexPoint(meaning)` is a pure, cached function: a decomposed word (present in the Plan-2 baked space) sits at its morpheme *composition*; every other word sits at its quantized GloVe anchor (`fromFloats(embed(meaning))`). Because points are a deterministic function of the meaning (not mutable per-language state *yet*), there is NO new `Language` field, NO clone change, NO persistence change. `classifyShift` (the drift step's semantic-distance decision) switches from on-the-fly `cosine(embed(...))` to `cosineFixed(lexPoint(...))`, so drift now reads the compositional meaning. That changes evolved trajectories → a deliberate re-baseline of `meaning_layer_baseline` GENN.

**Tech Stack:** TypeScript, Vitest. Builds on Plan 1 (`vec.ts` `cosineFixed`/`fromFloats`) and Plan 2 (`morphemeSpaceLoader.loadMorphemeSpace`).

**Determinism policy (per the project owner's 2026-06 steer):** byte-identity vs the *old* baseline is NOT a goal — pursue it only when free. Here the data/accessor (Task 1) is byte-identical for free (no importer touches the sim yet); the drift flip (Task 2) deliberately re-baselines. **Reproducibility (same seed → identical output every run) is preserved** — `lexPoint` + `cosineFixed` are pure integer-seeded/​deterministic. Mutable per-language points (true "drift moves the point"), homonymy-aware behaviour, and the UI/translator consumption are later plans.

**Scope note:** the baked space is English-only (Plan 2's validation preset). For other presets `lexPoint` falls back to the GloVe anchor for every word, so their re-baseline comes only from the float→fixed-point quantization; English additionally shifts its 26 decomposed words to their compositions. Track C bakes per-preset spaces and makes `lexPoint` preset-aware.

---

### Task 1: `lexPoint` — the stored meaning point

**Files:**
- Create: `src/engine/semantics/meaningPoint.ts`
- Test: `src/engine/semantics/__tests__/meaningPoint.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { lexPoint } from "../meaningPoint";
import { fromFloats } from "../vec";
import { embed } from "../embeddings";
import { loadMorphemeSpace } from "../morphemeSpaceLoader";

describe("meaningPoint — lexPoint", () => {
  it("a decomposed word sits at its baked morpheme composition", () => {
    const behind = loadMorphemeSpace().wordPoints.get("behind")!;
    expect(Array.from(lexPoint("behind"))).toEqual(Array.from(behind));
  });

  it("a non-decomposed word sits at its quantized GloVe anchor", () => {
    // "water" is a root/part, never a baked WORD, so it falls back to the anchor.
    expect(Array.from(lexPoint("water"))).toEqual(Array.from(fromFloats(embed("water"))));
  });

  it("the composition for behind differs from the holistic anchor only if be- carried a residual (here it is exact)", () => {
    // behind = hind + be-, be- single-occurrence → composition reconstructs the anchor.
    expect(Array.from(lexPoint("behind"))).toEqual(Array.from(fromFloats(embed("behind"))));
  });

  it("is cached — same reference on repeat", () => {
    expect(lexPoint("water")).toBe(lexPoint("water"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/meaningPoint.test.ts`
Expected: FAIL — `Cannot find module '../meaningPoint'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/semantics/meaningPoint.ts
/**
 * meaningPoint.ts — a concept's meaning POSITION, the source of truth for semantic distance.
 *
 * `lexPoint(meaning)` returns the fixed-point vector a meaning occupies: a decomposed word
 * (present in the baked morpheme space) sits at its morpheme COMPOSITION; every other word
 * sits at its quantized GloVe anchor. Pure + cached + deterministic — points are a function
 * of the meaning, so there is no per-language state to clone or persist (mutable points come
 * in a later plan). Drift and, later, the translator/UI read distances from here instead of
 * recomputing `embed()` per call.
 */
import type { Meaning } from "../types";
import { type Vec, fromFloats } from "./vec";
import { embed } from "./embeddings";
import { loadMorphemeSpace } from "./morphemeSpaceLoader";

let WORD_POINTS: Map<string, Vec> | null = null;
function wordPoints(): Map<string, Vec> {
  if (WORD_POINTS === null) WORD_POINTS = loadMorphemeSpace().wordPoints;
  return WORD_POINTS;
}

const cache = new Map<Meaning, Vec>();

/** The meaning point: baked composition if decomposed, else the quantized GloVe anchor. */
export function lexPoint(meaning: Meaning): Vec {
  const hit = cache.get(meaning);
  if (hit) return hit;
  const point = wordPoints().get(meaning) ?? fromFloats(embed(meaning));
  cache.set(meaning, point);
  return point;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/meaningPoint.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/meaningPoint.ts src/engine/semantics/__tests__/meaningPoint.test.ts
git commit -m "feat(meaningPoint): lexPoint — stored meaning position from the morpheme space (Track A plan 3)"
```

---

### Task 2: Flip drift's semantic distance onto `lexPoint`

**Files:**
- Modify: `src/engine/semantics/drift.ts` (import line + `classifyShift` line ~102)

This is the deliberate behaviour change. `classifyShift` currently weighs shift kinds using `cosine(embed(from, lang), embed(to, lang))`. Switch it to the stored point.

- [ ] **Step 1: Add the import**

In `src/engine/semantics/drift.ts`, change:
```ts
import { nearestMeanings, embed, cosine } from "./embeddings";
```
to:
```ts
import { nearestMeanings, embed, cosine } from "./embeddings";
import { cosineFixed } from "./vec";
import { lexPoint } from "./meaningPoint";
```
(Keep `embed`/`cosine` — they are still used by the `nearestMeanings` fallback path; only `classifyShift`'s primary distance moves.)

- [ ] **Step 2: Switch the classifyShift similarity**

In `classifyShift`, change the line:
```ts
  const similarity = cosine(embed(from, lang), embed(to, lang));
```
to:
```ts
  // MEGA overhaul (vector-space-native): drift navigates the COMPOSITIONAL meaning space —
  // a decomposed word sits at its morpheme composition (lexPoint), not its holistic GloVe
  // anchor. Distance is the fixed-point cosine so the decision is cross-platform exact.
  const similarity = cosineFixed(lexPoint(from), lexPoint(to));
```
`lang` stays in the signature (other rungs use it) — it is simply no longer needed for the similarity. Leave it; do not remove the parameter.

- [ ] **Step 3: Typecheck + run the drift unit + semantics tests**

Run: `npx tsc --noEmit` → expect no output.
Run: `npx vitest run --dir src classifyShift drift semantic` → the `classifyShift` unit test (no rng/lang/freq) is unaffected; some multi-gen semantics tests may shift (reconcile in Task 3).
Expected: `classifyShift.test.ts` PASS; note any failures for Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/engine/semantics/drift.ts
git commit -m "feat(drift): navigate the compositional meaning space via lexPoint (Track A plan 3)"
```

---

### Task 3: Re-baseline the determinism tier + reconcile

The drift change shifts every preset's trajectory. Re-baseline deliberately (the owner has dropped byte-identity vs the old baseline; reproducibility is preserved and re-confirmed below).

- [ ] **Step 1: Capture the new GENN hashes**

Run: `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline 2>&1 | grep -oE "(pie|bantu|romance|germanic|tokipona|english) gen-30 byte-identity: expected '[0-9a-f]+'" | sort -u`
This prints `<preset> ... expected '<NEW hash>'` for each of the 6 presets (the first hash in vitest's message is the *received* = new value). Record all six.

- [ ] **Step 2: Update the baseline + document it**

In `src/engine/__tests__/meaning_layer_baseline.test.ts`, replace the six values in the `GENN` record with the new hashes from Step 1, and prepend a dated comment to the block:
```ts
// GENN re-baselined 2026-06-04 (Track A plan 3 — lexPoint drift flip). classifyShift now
// measures semantic distance via cosineFixed(lexPoint(from), lexPoint(to)) — the stored
// compositional meaning point (fixed-point), not on-the-fly cosine(embed()). English's 26
// decomposed words shift to their morpheme compositions; all presets also shift slightly
// from the float→fixed-point quantization. GEN0 unchanged (no drift at gen 0).
// Reproducibility preserved (same config → identical output; re-run confirmed). Byte-identity
// vs the prior baseline is intentionally NOT preserved (owner steer 2026-06).
```

- [ ] **Step 3: Confirm meaning_layer green + reproducible**

Run: `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline` → expect 12 pass.
Run it a SECOND time → identical pass (proves reproducibility: same config → same hashes).

- [ ] **Step 4: Run the fast tier + reconcile stragglers**

Run: `npx vitest run --dir src`
Expected: any failure is a multi-gen semantics test asserting a *specific* drifted form/cluster. For each, confirm it is a trajectory shift (not a logic break) by reading the assertion, then update the expected value or widen a documented tolerance — exactly as the realism-overhaul re-baselines did (e.g. `lexical_diffusion` 5% tolerance, `embeddings`/`soundLaws` re-baselines). Do NOT weaken an assertion that is testing a real invariant; if a failure looks like a logic regression (e.g. antonyms merging, inventory unbounded), STOP and report.
Re-run until the fast tier is green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/__tests__/meaning_layer_baseline.test.ts <any reconciled test files>
git commit -m "rebaseline: lexPoint drift flip shifts all 6 preset trajectories (Track A plan 3)"
```

---

## What this unblocks

- **Plan 4 (read-only consumers, NO re-baseline):** the Dictionary shows each decomposed word's morpheme breakdown (from the baked space) and computes nearest-neighbours via `lexPoint`; the translator grounds by compositional point. These touch only translator/UI (not `sim.step()`), so they need no determinism re-baseline.
- **Plan 5 (mutable points + homonymy):** add a sparse per-language point-override store so drift can MOVE a point (metaphor) and grow/shrink `spread` (broaden/narrow), and surface homonyms (same form, distant points) as distinct lexemes. This is where per-language point storage + clone/persistence finally change.

## Self-review notes
- **Spec coverage:** implements Track A spec §3.2 (the meaning *point* as identity) and §4.1 (decomposed word = its composition; others = anchor), consumed by the drift hot-path. §6 is updated: the byte-identical A.1 phase is dropped per owner steer; this plan does the flip + one re-baseline directly. Homonymy/polysemy *behaviour* (§3.2 spread) and the access-seam point APIs (§5) move to Plans 4–5.
- **Determinism:** `lexPoint`/`cosineFixed` are deterministic; the re-baseline is deliberate and reproducibility is re-confirmed (Task 3 step 3). The `classifyShift` unit test stays green (it passes no rng/lang/freq, so the similarity is computed but the kind is the argmax over the same weights — verify in Task 2 step 3).
- **Type consistency:** `lexPoint(meaning): Vec` and `cosineFixed(a: Vec, b: Vec): number` (both from Plan 1) are used exactly as defined; no new `Language` field, so no clone/persistence/types churn.
- **Known limit (documented):** the baked space is English-only, so cross-preset meanings borrow English's composition; Track C makes `lexPoint` preset-aware.
