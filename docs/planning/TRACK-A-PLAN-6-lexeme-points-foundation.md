# Track A · Plan 6 — Per-Lexeme Point Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each `WordSense` its own gliding **point** (+ **spread**) — the data foundation for per-lexeme semantic drift ("silly: holy→foolish" as a word whose point glides, not a key-hop).

**Architecture:** Add optional `point?: number[]` + `spread?: number` to `WordSense`, plus a `sensePoint(sense)` / `senseSpread(sense)` accessor that falls back to the meaning's static `lexPoint` when the sense hasn't glided yet. Fix `cloneLanguage` to deep-copy the point array (today it shallow-spreads each sense, which would *share* the array between parent and daughter languages — a real bug once points mutate). Persistence is JSON-based and already serializes `words`, so the new fields round-trip for free.

**Tech Stack:** TypeScript, Vitest.

**Why this is the right first chunk:** the per-lexeme model is a multi-plan restructure (your choice in the Plan-6 design fork). This plan lands the *foundation* — senses can carry a point — without yet moving anything, so it is **byte-identical / free**: the fields default `undefined`, `sensePoint` falls back to the Plan-3 static point, nothing consumes it yet, and the `meaning_layer_baseline` signature is `formKey`-only (it never read sense fields). **Plan 7** makes drift *glide* sense points (the deliberate re-baseline); **Plan 8** wires the consumers (classifyShift / translator / UI read `sensePoint`).

---

### Task 1: `WordSense` point/spread + accessors

**Files:**
- Modify: `src/engine/types.ts` (the `WordSense` interface)
- Modify: `src/engine/semantics/meaningPoint.ts` (append accessors)
- Test: `src/engine/semantics/__tests__/meaningPoint.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

```ts
// append to src/engine/semantics/__tests__/meaningPoint.test.ts
import { sensePoint, senseSpread, DEFAULT_SPREAD } from "../meaningPoint";
import type { WordSense } from "../../types";

describe("meaningPoint — per-lexeme sensePoint / senseSpread", () => {
  const base = { weight: 1, bornGeneration: 0 } as const;

  it("sensePoint falls back to the meaning's static point when the sense hasn't glided", () => {
    const s: WordSense = { meaning: "water", ...base };
    expect(Array.from(sensePoint(s))).toEqual(Array.from(lexPoint("water")));
  });

  it("sensePoint uses the sense's own point once it has glided", () => {
    const moved = Array.from(lexPoint("fire")); // pretend this sense glided to fire's region
    const s: WordSense = { meaning: "water", point: moved, ...base };
    expect(Array.from(sensePoint(s))).toEqual(moved);
  });

  it("senseSpread defaults when unset, else returns the stored spread", () => {
    expect(senseSpread({ meaning: "x", ...base })).toBe(DEFAULT_SPREAD);
    expect(senseSpread({ meaning: "x", spread: 0.5, ...base })).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/meaningPoint.test.ts`
Expected: FAIL — `sensePoint is not a function` (and a TS error on the `point`/`spread` sense fields).

- [ ] **Step 3: Add the `WordSense` fields**

In `src/engine/types.ts`, in the `WordSense` interface (the one with `meaning`, `weight`, `register?`, `bornGeneration`, `origin?`), add these two fields:
```ts
  /**
   * Track A: this sense's own position in the meaning space (fixed-point ints, as a plain
   * number[] for clone/JSON-persist friendliness). Absent until the sense GLIDES (Plan 7);
   * read via `sensePoint`, which falls back to the meaning's static `lexPoint`.
   */
  point?: number[];
  /** Track A: this sense's breadth (region radius). Absent = DEFAULT_SPREAD. Broaden/narrow drift moves it (Plan 7). */
  spread?: number;
```

- [ ] **Step 4: Add the accessors**

Append to `src/engine/semantics/meaningPoint.ts`:
```ts
import type { WordSense } from "../types";

/** Default breadth for a sense that hasn't broadened/narrowed yet. Tunable. */
export const DEFAULT_SPREAD = 1;

/** This sense's point — its own glided position if set, else the meaning's static default. */
export function sensePoint(sense: WordSense): Vec {
  return sense.point ? Int32Array.from(sense.point) : lexPoint(sense.meaning);
}

/** This sense's breadth (region radius); DEFAULT_SPREAD until broaden/narrow moves it. */
export function senseSpread(sense: WordSense): number {
  return sense.spread ?? DEFAULT_SPREAD;
}
```
(Note: add the `import type { Vec }` if not already imported — `meaningPoint.ts` already imports `type Vec` from `./vec`; reuse it.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/meaningPoint.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/semantics/meaningPoint.ts src/engine/semantics/__tests__/meaningPoint.test.ts
git commit -m "feat(lexeme): WordSense.point/spread + sensePoint/senseSpread accessors (Track A plan 6)"
```

---

### Task 2: Deep-clone the sense point

**Files:**
- Modify: `src/engine/utils/clone.ts` (the `words` clone in `cloneLanguage`)
- Test: `src/engine/__tests__/clone_sense_point.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/__tests__/clone_sense_point.test.ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { syncWordsFromLexicon } from "../lexicon/word";
import { cloneLanguage } from "../utils/clone";

function freshEnglishWithWords() {
  const sim = createSimulation(presetEnglish());
  const lang = sim.getState().tree[sim.getState().rootId]!.language;
  if (!lang.words) syncWordsFromLexicon(lang, 0);
  return lang;
}

describe("cloneLanguage — sense point independence", () => {
  it("a cloned sense's point array is NOT shared with the parent", () => {
    const lang = freshEnglishWithWords();
    expect(lang.words && lang.words.length > 0).toBe(true);
    const sense = lang.words![0]!.senses[0]!;
    sense.point = [1, 2, 3];

    const clone = cloneLanguage(lang);
    clone.words![0]!.senses[0]!.point![0] = 999;

    expect(sense.point[0]).toBe(1); // mutating the clone must not touch the parent
  });

  it("a sense with no point clones fine (point stays undefined)", () => {
    const lang = freshEnglishWithWords();
    const sense = lang.words![0]!.senses[0]!;
    delete sense.point;
    const clone = cloneLanguage(lang);
    expect(clone.words![0]!.senses[0]!.point).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/__tests__/clone_sense_point.test.ts`
Expected: FAIL — the first test fails: the parent's `point[0]` becomes `999` because `{ ...s }` shares the array.

- [ ] **Step 3: Fix the clone**

In `src/engine/utils/clone.ts`, inside `cloneLanguage`'s `words` mapping, change:
```ts
          senses: w.senses.map((s) => ({ ...s })),
```
to:
```ts
          senses: w.senses.map((s) => ({
            ...s,
            point: s.point ? s.point.slice() : undefined,
          })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/__tests__/clone_sense_point.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Confirm the foundation is byte-identical (free)**

Run: `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline`
Expected: 12 pass, hashes UNCHANGED (the new optional fields are undefined everywhere and the signature is `formKey`-only, so trajectories are byte-identical).
Run: `npx tsc --noEmit` → no output.

- [ ] **Step 6: Commit**

```bash
git add src/engine/utils/clone.ts src/engine/__tests__/clone_sense_point.test.ts
git commit -m "fix(clone): deep-copy WordSense.point so daughters don't share it (Track A plan 6)"
```

---

## What this unblocks
- **Plan 7 (the glide — re-baseline):** drift sets a moving sense's `point` (glide a fixed fraction toward the target's point) and adjusts `spread` on broaden/narrow; `classifyShift` reads `sensePoint`/`senseSpread` so future shifts use the glided positions. Trajectories shift → one deliberate `meaning_layer_baseline` re-baseline. (Persistence already carries the points via JSON — confirmed.)
- **Plan 8 (consumers):** translator grounding + the Dictionary read `sensePoint` so a word's *current* (possibly glided) position drives display and nearest-word lookup.

## Self-review notes
- **Spec coverage:** lays the §3.2 lexeme-as-(form, point, spread) data model on the existing `WordSense`; movement (§3.2 "metaphor moves the point") is Plan 7.
- **Determinism:** byte-identical — optional fields default undefined; `sensePoint` falls back to the static Plan-3 point; the `meaning_layer_baseline` signature is `formKey`-only; verified in Task 2 step 5. The clone fix only changes behaviour for senses that HAVE a point (none yet), so it too is byte-identical now and correct once Plan 7 sets points.
- **Type consistency:** `point?: number[]` (plain array for clone/JSON) ↔ `sensePoint` returns `Vec` via `Int32Array.from`; `WordSense` is imported into `meaningPoint.ts`; `senseSpread` ↔ `DEFAULT_SPREAD`.
- **Persistence:** JSON-based and already serializes `lang.words`; `number[]`/`number` fields survive save/load with no persistence-code change (pre-v6 saves reconstruct `words` via `syncWordsFromLexicon`, which simply yields senses without points → `sensePoint` fallback).
