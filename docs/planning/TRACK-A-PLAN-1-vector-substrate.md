# Track A · Plan 1 — Fixed-Point Vector Substrate + Composition Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, fixed-point vector math + additive composition primitives that the whole vector-space overhaul stands on — proven in isolation before any engine code is touched.

**Architecture:** Two new pure modules under `src/engine/semantics/`. `vec.ts` defines a fixed-point integer vector (`Int32Array`, scale 4096, 58 dims = 50 lexical + 8 reserved grammatical) and integer arithmetic so every distance/ranking decision is cross-platform byte-identical. `morphemeSpace.ts` defines the `Morpheme` type, the additive `compose` (sum of morpheme points), the `compositionError` invariant check, and `nearestComposition` (the seeded greedy gap-filler that Track B will use). No engine state, no RNG-coupled simulation paths, no determinism re-baseline — these are leaf modules with no importers yet.

**Tech Stack:** TypeScript, Vitest. Reuses the existing `makeRng` (`src/engine/rng.ts`) for seeded tie-breaks and `WordForm` (`src/engine/types.ts`).

**Why this scope (read once):** This is Plan 1 of Track A. It deliberately contains *only* the math substrate so we validate the A1 decision (additive-by-construction composition) with real, passing tests before committing to the storage flip (Plan 3) or the per-preset rewrite (Track C). Determinism rule that governs everything here: **all decisions (distance, argmax, tie-break) use integer math (`distanceSq`, seeded `rng.int`); floating point is allowed ONLY for human-readable similarity readout (`cosineFixed`), never for state or ranking.**

---

### Task 1: Fixed-point vector type + quantization

**Files:**
- Create: `src/engine/semantics/vec.ts`
- Test: `src/engine/semantics/__tests__/vec.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { VEC_DIM, VEC_SCALE, LEXICAL_DIMS, GRAMMATICAL_DIMS, zeroVec, fromFloats, toFloats } from "../vec";

describe("vec — fixed-point representation", () => {
  it("dimensionality is 50 lexical + 8 grammatical = 58", () => {
    expect(LEXICAL_DIMS).toBe(50);
    expect(GRAMMATICAL_DIMS).toBe(8);
    expect(VEC_DIM).toBe(58);
  });

  it("zeroVec is the full dimensionality, all zeros", () => {
    const z = zeroVec();
    expect(z.length).toBe(VEC_DIM);
    expect(Array.from(z).every((x) => x === 0)).toBe(true);
  });

  it("fromFloats quantizes into the lexical dims and leaves grammatical dims zero", () => {
    const v = fromFloats([1, -1, 0.5]);
    expect(v[0]).toBe(VEC_SCALE);                    // 1 * 4096
    expect(v[1]).toBe(-VEC_SCALE);                   // -1 * 4096
    expect(v[2]).toBe(Math.round(0.5 * VEC_SCALE));  // 2048
    expect(v[VEC_DIM - 1]).toBe(0);                  // a grammatical dim, untouched
  });

  it("toFloats round-trips within quantization error", () => {
    const f = toFloats(fromFloats([0.123, -2.5, 3.14159]));
    expect(f[0]).toBeCloseTo(0.123, 3);
    expect(f[1]).toBeCloseTo(-2.5, 3);
    expect(f[2]).toBeCloseTo(3.14159, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/vec.test.ts`
Expected: FAIL — `Cannot find module '../vec'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/semantics/vec.ts
/**
 * vec.ts — fixed-point vector substrate for the vector-space-native meaning model.
 *
 * A meaning/morpheme position is an Int32Array of VEC_DIM components, each = round(value
 * × VEC_SCALE). Integer storage + integer arithmetic make every distance and ranking
 * decision byte-identical across platforms (the project's determinism invariant). Int32
 * (not Int16) gives composition headroom so sums of several morpheme vectors never
 * overflow. The first LEXICAL_DIMS dims mirror the shipped GloVe-50 space; the trailing
 * GRAMMATICAL_DIMS are reserved (zero-filled) for Track E and unused until then.
 */

export const VEC_SCALE = 4096; // 2^12 fixed-point scale
export const LEXICAL_DIMS = 50; // GloVe-50
export const GRAMMATICAL_DIMS = 8; // reserved for Track E (tense/aspect/mood/number/case/person/gender/definiteness)
export const VEC_DIM = LEXICAL_DIMS + GRAMMATICAL_DIMS; // 58

export type Vec = Int32Array;

/** A zero vector of the full dimensionality. */
export function zeroVec(): Vec {
  return new Int32Array(VEC_DIM);
}

/** Quantize float components into the lexical dims (grammatical dims stay zero). */
export function fromFloats(floats: readonly number[]): Vec {
  const v = new Int32Array(VEC_DIM);
  const n = Math.min(floats.length, VEC_DIM);
  for (let i = 0; i < n; i++) v[i] = Math.round(floats[i]! * VEC_SCALE);
  return v;
}

/** Dequantize to floats (display / interop only — never for ranking decisions). */
export function toFloats(v: Vec): number[] {
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / VEC_SCALE;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/vec.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/vec.ts src/engine/semantics/__tests__/vec.test.ts
git commit -m "feat(vec): fixed-point vector type + quantization (Track A plan 1)"
```

---

### Task 2: Integer vector arithmetic

**Files:**
- Modify: `src/engine/semantics/vec.ts` (append functions)
- Test: `src/engine/semantics/__tests__/vec.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

```ts
// append to src/engine/semantics/__tests__/vec.test.ts
import { sumVecs, dotFixed, distanceSq, cosineFixed } from "../vec";

describe("vec — integer arithmetic", () => {
  it("sumVecs adds componentwise (the additive composition operation)", () => {
    const s = sumVecs([fromFloats([1, 2, 3]), fromFloats([0.5, -1, 0])]);
    expect(s[0]).toBe(Math.round(1.5 * VEC_SCALE));
    expect(s[1]).toBe(Math.round(1 * VEC_SCALE));
    expect(s[2]).toBe(Math.round(3 * VEC_SCALE));
  });

  it("distanceSq is integer-exact: 0 for identical, positive otherwise", () => {
    const a = fromFloats([1, 2, 3]);
    expect(distanceSq(a, a)).toBe(0);
    expect(distanceSq(a, fromFloats([1, 2, 4]))).toBe(VEC_SCALE * VEC_SCALE); // (1*scale)^2
  });

  it("dotFixed is integer-exact", () => {
    const a = fromFloats([1, 1]);
    const b = fromFloats([2, 3]);
    expect(dotFixed(a, b)).toBe(VEC_SCALE * (2 * VEC_SCALE) + VEC_SCALE * (3 * VEC_SCALE));
  });

  it("cosineFixed ~1 for parallel, ~0 for orthogonal (readout only)", () => {
    expect(cosineFixed(fromFloats([1, 0, 0]), fromFloats([3, 0, 0]))).toBeCloseTo(1, 5);
    expect(cosineFixed(fromFloats([1, 0, 0]), fromFloats([0, 1, 0]))).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/vec.test.ts`
Expected: FAIL — `sumVecs is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/engine/semantics/vec.ts

/** Componentwise sum (additive composition). Integer-exact. */
export function sumVecs(vs: readonly Vec[]): Vec {
  const out = new Int32Array(VEC_DIM);
  for (const v of vs) for (let i = 0; i < VEC_DIM; i++) out[i]! += v[i]!;
  return out;
}

/** Integer dot product. Safe in a JS number (max ~58·(few·10^4)^2 « 2^53). */
export function dotFixed(a: Vec, b: Vec): number {
  let d = 0;
  for (let i = 0; i < VEC_DIM; i++) d += a[i]! * b[i]!;
  return d;
}

/** Squared Euclidean distance — integer-exact. USE THIS for all ranking/argmax. */
export function distanceSq(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < VEC_DIM; i++) {
    const diff = a[i]! - b[i]!;
    s += diff * diff;
  }
  return s;
}

/** Cosine similarity. Float output — for human-readable readout ONLY, never ranking. */
export function cosineFixed(a: Vec, b: Vec): number {
  const dot = dotFixed(a, b);
  const na = Math.sqrt(dotFixed(a, a));
  const nb = Math.sqrt(dotFixed(b, b));
  if (na === 0 || nb === 0) return 0;
  return dot / (na * nb);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/vec.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/vec.ts src/engine/semantics/__tests__/vec.test.ts
git commit -m "feat(vec): integer arithmetic — sum/dot/distanceSq/cosineFixed (Track A plan 1)"
```

---

### Task 3: Morpheme type + additive composition invariant

**Files:**
- Create: `src/engine/semantics/morphemeSpace.ts`
- Test: `src/engine/semantics/__tests__/morphemeSpace.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { fromFloats } from "../vec";
import { compose, compositionError, type Morpheme } from "../morphemeSpace";

describe("morphemeSpace — additive composition", () => {
  it("compose sums morpheme points (teacher = teach + -er offset)", () => {
    const teach = fromFloats([1, 0, 0]);
    const er = fromFloats([0, 0.2, 0]); // small 'agent-of' offset
    expect(Array.from(compose([teach, er]))).toEqual(Array.from(fromFloats([1, 0.2, 0])));
  });

  it("compositionError is zero when the point equals its composition (the invariant)", () => {
    const fire = fromFloats([2, 1, 0]);
    const water = fromFloats([1, 2, 0]);
    expect(compositionError(compose([fire, water]), [fire, water])).toBe(0);
  });

  it("compositionError is positive when the point drifts from the composition", () => {
    const fire = fromFloats([2, 1, 0]);
    const water = fromFloats([1, 2, 0]);
    expect(compositionError(fromFloats([5, 5, 0]), [fire, water])).toBeGreaterThan(0);
  });

  it("a Morpheme carries id/form/point/type", () => {
    const m: Morpheme = { id: "fire", form: ["f", "a", "j", "ə"], point: fromFloats([2, 0, 0]), type: "root" };
    expect(m.type).toBe("root");
    expect(m.point.length).toBe(58);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeSpace.test.ts`
Expected: FAIL — `Cannot find module '../morphemeSpace'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/semantics/morphemeSpace.ts
/**
 * morphemeSpace.ts — the additive-by-construction composition layer (A1).
 *
 * A word's meaning point is the SUM of its morphemes' points (compose). Because the space
 * is built so this holds for known words (the factorization in Plan 2), composition is
 * exact, which is what makes gap-filling (Track B) and preset morphemization (Track C)
 * well-defined. compositionError measures violation of the invariant (0 = exact).
 */
import type { WordForm } from "../types";
import { type Vec, sumVecs, distanceSq } from "./vec";

export type MorphemeType = "root" | "prefix" | "suffix" | "infix";

export interface Morpheme {
  id: string;
  form: WordForm;
  point: Vec;
  type: MorphemeType;
}

/** Additive composition: a word's point = the sum of its morpheme points. */
export function compose(points: readonly Vec[]): Vec {
  return sumVecs(points);
}

/** Squared distance between a stored point and the composition of its morphemes (0 = exact). */
export function compositionError(point: Vec, morphemePoints: readonly Vec[]): number {
  return distanceSq(point, compose(morphemePoints));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeSpace.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/morphemeSpace.ts src/engine/semantics/__tests__/morphemeSpace.test.ts
git commit -m "feat(morphemeSpace): Morpheme type + additive compose + invariant (Track A plan 1)"
```

---

### Task 4: `nearestComposition` — the seeded greedy gap-filler

**Files:**
- Modify: `src/engine/semantics/morphemeSpace.ts` (append)
- Test: `src/engine/semantics/__tests__/morphemeSpace.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

```ts
// append to src/engine/semantics/__tests__/morphemeSpace.test.ts
import { nearestComposition } from "../morphemeSpace";

function morph(id: string, floats: number[]): Morpheme {
  return { id, form: [], point: fromFloats(floats), type: "root" };
}

describe("morphemeSpace — nearestComposition (gap-filler used by Track B)", () => {
  const inventory: Morpheme[] = [
    morph("fire", [2, 0, 0]),
    morph("water", [0, 2, 0]),
    morph("big", [0, 0, 2]),
    morph("small", [0, 0, -2]),
  ];

  it("finds the single morpheme nearest a target", () => {
    const got = nearestComposition(fromFloats([1.9, 0, 0]), inventory, 1, "s");
    expect(got.map((m) => m.id)).toEqual(["fire"]);
  });

  it("composes two morphemes to reach a combined target", () => {
    const got = nearestComposition(fromFloats([2, 2, 0]), inventory, 2, "s"); // fire + water
    expect(got.map((m) => m.id).sort()).toEqual(["fire", "water"]);
  });

  it("stops adding morphemes once none improves the fit", () => {
    const got = nearestComposition(fromFloats([2, 0, 0]), inventory, 3, "s"); // exactly fire
    expect(got.map((m) => m.id)).toEqual(["fire"]);
  });

  it("is deterministic under a fixed seed", () => {
    const a = nearestComposition(fromFloats([2, 2, 0]), inventory, 2, "seed-1").map((m) => m.id);
    const b = nearestComposition(fromFloats([2, 2, 0]), inventory, 2, "seed-1").map((m) => m.id);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeSpace.test.ts`
Expected: FAIL — `nearestComposition is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/engine/semantics/morphemeSpace.ts
import { makeRng } from "../rng";

/**
 * Greedy search for a small morpheme combination whose composed point is nearest `target`.
 * At each step it adds the morpheme that most reduces the (integer) squared distance, up to
 * `maxParts`, stopping when nothing improves. Ties at the same minimal distance are broken
 * by a seeded RNG so the result is deterministic. O(maxParts · |inventory|) — fine as a
 * primitive; Track B can optimise. This is the engine of necessity-driven coinage.
 */
export function nearestComposition(
  target: Vec,
  inventory: readonly Morpheme[],
  maxParts: number,
  seed: string,
): Morpheme[] {
  const chosen: Morpheme[] = [];
  const points: Vec[] = [];
  let bestDist = distanceSq(target, sumVecs(points)); // empty composition → |target|²
  for (let step = 0; step < maxParts; step++) {
    let minDist = bestDist;
    for (const m of inventory) {
      const d = distanceSq(target, sumVecs([...points, m.point]));
      if (d < minDist) minDist = d;
    }
    if (minDist >= bestDist) break; // no candidate improves the fit
    const ties = inventory.filter(
      (m) => distanceSq(target, sumVecs([...points, m.point])) === minDist,
    );
    const pick = ties.length === 1 ? ties[0]! : ties[makeRng(`${seed}|${step}`).int(ties.length)]!;
    chosen.push(pick);
    points.push(pick.point);
    bestDist = minDist;
  }
  return chosen;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeSpace.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/engine/semantics/morphemeSpace.ts src/engine/semantics/__tests__/morphemeSpace.test.ts
git commit -m "feat(morphemeSpace): seeded greedy nearestComposition gap-filler (Track A plan 1)"
```

---

## What this unblocks (next plans)

- **Plan 2 (A.0b):** `scripts/build-morpheme-space.ts` — load the validation preset (English), seed root points from the shipped GloVe table, solve for affix vectors so authored decompositions compose exactly, and bake a deterministic `morphemeSpaceData.ts`. Uses `vec.ts` + `compositionError` from this plan as its acceptance check (every authored word's `compositionError` must be 0).
- **Plan 3 (A.1):** storage flip — give `WordSense` a `point`/`spread` and add the morpheme inventory behind `access.ts`, **byte-identical** (`meaning_layer_baseline` gate).
- **Plan 4 (A.2):** behaviour flip — drift moves points, homonymy/polysemy by threshold, translator resolves by point; one deliberate re-baseline.
- **Track C (after A.1 schema):** rewrite ALL presets onto the morpheme substrate (agent-delegable, one per preset). The user's reminder — it's the bulk follow-on and depends on this math + the A.1 schema.

## Self-review notes
- **Spec coverage:** implements §3.1 (fixed-point Vec, 50+8 dims), §4.1/§4.3 (compose + nearestComposition) of the Track A spec. Storage model (§3.2/§5), factorization bake (§4.2), migration (§7), and behaviour (§6/§8) are explicitly deferred to Plans 2–4 — noted above, not dropped.
- **Determinism:** every ranking/argmax uses integer `distanceSq` + seeded `rng.int`; `cosineFixed` (float) is readout-only. No simulation state touched, no RNG stream perturbed → no re-baseline.
- **Type consistency:** `Vec = Int32Array` and `Morpheme {id,form,point,type}` are used identically across both modules and all tests; `VEC_DIM=58` asserted in Task 1 and relied on in Task 3's `point.length` check.
