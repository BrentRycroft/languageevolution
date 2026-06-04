# Track A · Plan 2 — Morpheme-Space Factorization + Bake

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the shipped GloVe anchors into an *additive* morpheme space — seed root points from GloVe, solve affix vectors so authored decompositions compose, validate the recipe on the real English preset, and bake a deterministic `morphemeSpaceData.ts`.

**Architecture:** A pure solver `morphemeFactor.ts` (`factorizeMorphemes`) takes roots (known anchor points) + decompositions (words → ordered morpheme-id parts, with affixes flagged) and returns every morpheme's point (roots = their anchor; each affix = the rounded **mean residual** over the words that use it — the least-squares fit) plus each word's composed point. A bake script feeds the real English preset (`seedCompounds` + `seedDerivations`, anchors via `embed`) through it and emits a deterministic data module loaded back as `Morpheme`s. Builds on Plan 1's `vec.ts` / `morphemeSpace.ts`.

**Tech Stack:** TypeScript, Vitest, `tsx` for the bake script (the repo already runs `npx tsx scripts/*.ts`).

**Determinism note:** Everything here is offline tooling + a baked artifact; no simulation state, no RNG-coupled path, no re-baseline. The bake must be reproducible: sort all emitted collections by id/meaning, store vectors as plain int arrays, use integer `roundDivVec` for the affix mean.

**Key facts grounded in the codebase:**
- `embed(meaning)` (`src/engine/semantics/embeddings.ts`) returns a 50-float GloVe vector (table hit) or a deterministic hash fallback. Use `fromFloats(embed(m))` to get a `Vec`.
- English authored decompositions live on the preset config: `seedCompounds: Record<meaning,{parts:string[]}>` (e.g. `daylight:{parts:["day","light"]}`, `teacher:{parts:["teach","-er.agt"]}`) and `seedDerivations: Record<meaning,{base,affix,position?}>` (`behind:{base:"hind",affix:"be-",position:"prefix"}`).
- A part id is an **affix** iff it starts or ends with `"-"` (`"-er.agt"`, `"be-"`); everything else is a root with a GloVe anchor.
- Affix multiplicities in English: `-er.agt`×4, `-ness`×4, `-dom`×2, `-ship`×1, `-hood`×1, `be-`×1. Single-occurrence affixes reconstruct their word's anchor *exactly*; multi-occurrence ones carry a least-squares residual.

---

### Task 1: Vector helpers — `subVecs`, `roundDivVec`

**Files:**
- Modify: `src/engine/semantics/vec.ts` (append)
- Test: `src/engine/semantics/__tests__/vec.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

```ts
// append to src/engine/semantics/__tests__/vec.test.ts
import { subVecs, roundDivVec } from "../vec";

describe("vec — subtraction + integer mean", () => {
  it("subVecs is componentwise a − b, integer-exact", () => {
    const d = subVecs(fromFloats([3, 1, 0]), fromFloats([1, 2, 0]));
    expect(d[0]).toBe(2 * VEC_SCALE);
    expect(d[1]).toBe(-1 * VEC_SCALE);
    expect(d[2]).toBe(0);
  });

  it("roundDivVec computes a rounded componentwise mean (deterministic)", () => {
    const sum = sumVecs([fromFloats([1, 0, 0]), fromFloats([2, 0, 0])]); // [3,0,0]*scale
    const mean = roundDivVec(sum, 2);
    expect(mean[0]).toBe(Math.round((3 * VEC_SCALE) / 2)); // 6144
  });

  it("roundDivVec by 1 is identity", () => {
    const v = fromFloats([0.7, -0.3, 0]);
    const out = roundDivVec(v, 1);
    expect(Array.from(out)).toEqual(Array.from(v));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/vec.test.ts`
Expected: FAIL — `subVecs is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/engine/semantics/vec.ts

/** Componentwise difference a − b. Integer-exact. */
export function subVecs(a: Vec, b: Vec): Vec {
  const out = new Int32Array(VEC_DIM);
  for (let i = 0; i < VEC_DIM; i++) out[i] = a[i]! - b[i]!;
  return out;
}

/** Componentwise rounded mean: round(v[i] / n). Deterministic. `n` must be ≥ 1. */
export function roundDivVec(v: Vec, n: number): Vec {
  const out = new Int32Array(VEC_DIM);
  for (let i = 0; i < VEC_DIM; i++) out[i] = Math.round(v[i]! / n);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/vec.test.ts`
Expected: PASS (all vec tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/vec.ts src/engine/semantics/__tests__/vec.test.ts
git commit -m "feat(vec): subVecs + roundDivVec for the factorization solver (Track A plan 2)"
```

---

### Task 2: The factorization solver `factorizeMorphemes`

**Files:**
- Create: `src/engine/semantics/morphemeFactor.ts`
- Test: `src/engine/semantics/__tests__/morphemeFactor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { fromFloats, distanceSq } from "../vec";
import { factorizeMorphemes, type Decomp } from "../morphemeFactor";

describe("morphemeFactor — factorizeMorphemes", () => {
  it("a single-occurrence affix is solved exactly (residual reconstructs the anchor)", () => {
    const roots = new Map([["hind", fromFloats([1, 0, 0])]]);
    const decomps: Decomp[] = [
      { word: "behind", wordAnchor: fromFloats([1, 0.5, 0]), parts: ["hind", "be-"] },
    ];
    const { morphemes, wordPoints } = factorizeMorphemes({ roots, affixIds: new Set(["be-"]), decomps });
    // be- = anchor(behind) − anchor(hind) = [0,0.5,0]
    expect(Array.from(morphemes.get("be-")!)).toEqual(Array.from(fromFloats([0, 0.5, 0])));
    // composed point reconstructs the anchor exactly
    expect(distanceSq(wordPoints.get("behind")!, fromFloats([1, 0.5, 0]))).toBe(0);
  });

  it("a multi-occurrence affix is the rounded mean of its residuals (least-squares)", () => {
    const roots = new Map([
      ["teach", fromFloats([1, 0, 0])],
      ["bake", fromFloats([2, 0, 0])],
    ]);
    const decomps: Decomp[] = [
      { word: "teacher", wordAnchor: fromFloats([1, 0.5, 0]), parts: ["teach", "-er"] }, // residual [0,0.5,0]
      { word: "baker", wordAnchor: fromFloats([2, 0.3, 0]), parts: ["bake", "-er"] },   // residual [0,0.3,0]
    ];
    const { morphemes, wordPoints } = factorizeMorphemes({ roots, affixIds: new Set(["-er"]), decomps });
    // mean residual = [0, 0.4, 0]
    expect(Array.from(morphemes.get("-er")!)).toEqual(Array.from(fromFloats([0, 0.4, 0])));
    // the composition invariant ALWAYS holds: word point == sum of part points
    expect(distanceSq(wordPoints.get("teacher")!, fromFloats([1, 0.4, 0]))).toBe(0);
    // but reconstruction vs the word's own anchor is now nonzero (the least-squares residual)
    expect(distanceSq(wordPoints.get("teacher")!, fromFloats([1, 0.5, 0]))).toBeGreaterThan(0);
  });

  it("pure compounds (all roots) compose with no affix to solve", () => {
    const roots = new Map([
      ["day", fromFloats([1, 0, 0])],
      ["light", fromFloats([0, 1, 0])],
    ]);
    const decomps: Decomp[] = [
      { word: "daylight", wordAnchor: fromFloats([9, 9, 9]), parts: ["day", "light"] },
    ];
    const { wordPoints } = factorizeMorphemes({ roots, affixIds: new Set(), decomps });
    // point = day + light = [1,1,0]; the word's own GloVe anchor is irrelevant to the compose
    expect(Array.from(wordPoints.get("daylight")!)).toEqual(Array.from(fromFloats([1, 1, 0])));
  });

  it("throws on an unknown root or stacked affixes (v1 limits)", () => {
    expect(() =>
      factorizeMorphemes({
        roots: new Map(),
        affixIds: new Set(["-er"]),
        decomps: [{ word: "x", wordAnchor: fromFloats([0]), parts: ["missing", "-er"] }],
      }),
    ).toThrow(/no anchor/);
    expect(() =>
      factorizeMorphemes({
        roots: new Map([["r", fromFloats([1])]]),
        affixIds: new Set(["-a", "-b"]),
        decomps: [{ word: "x", wordAnchor: fromFloats([1]), parts: ["r", "-a", "-b"] }],
      }),
    ).toThrow(/stacks/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeFactor.test.ts`
Expected: FAIL — `Cannot find module '../morphemeFactor'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/semantics/morphemeFactor.ts
/**
 * morphemeFactor.ts — build the additive-by-construction morpheme space (A1, Plan 2).
 *
 * Given root anchors (seeded from GloVe) and a set of word decompositions, solve every
 * affix's vector as the rounded MEAN RESIDUAL over the words that use it — the least-squares
 * fit for `base + affix = wordAnchor`. Roots keep their anchors. Each word's point is then
 * the SUM of its morpheme points, so the composition invariant (compositionError == 0) holds
 * by construction; the residual shows up only as reconstruction error vs the word's own
 * anchor (zero for single-occurrence affixes, nonzero where one affix must fit many words).
 *
 * v1 assumption (holds for the authored preset data): each decomposed word has AT MOST ONE
 * affix; its other parts are roots with known anchors. Affix stacking throws — Track C can
 * lift this with an iterative solve when bulk morphemization needs it.
 */
import { type Vec, sumVecs, subVecs, roundDivVec } from "./vec";

export interface Decomp {
  word: string;
  wordAnchor: Vec;
  parts: string[]; // ordered morpheme ids (roots and/or one affix)
}

export interface FactorInput {
  roots: Map<string, Vec>;
  affixIds: ReadonlySet<string>;
  decomps: readonly Decomp[];
}

export interface FactorResult {
  morphemes: Map<string, Vec>; // every id → point (roots = anchor; affixes = solved mean)
  wordPoints: Map<string, Vec>; // word meaning → composed point (= sum of its part points)
}

export function factorizeMorphemes(input: FactorInput): FactorResult {
  const morphemes = new Map<string, Vec>(input.roots);

  // Accumulate each affix's residuals: residual = wordAnchor − Σ(root parts).
  const accum = new Map<string, { sum: Vec; n: number }>();
  for (const d of input.decomps) {
    const affixes = d.parts.filter((p) => input.affixIds.has(p));
    if (affixes.length === 0) continue; // pure compound — nothing to solve
    if (affixes.length > 1) {
      throw new Error(`factorize: "${d.word}" stacks ${affixes.length} affixes (v1 supports ≤ 1)`);
    }
    const affix = affixes[0]!;
    const rootPts: Vec[] = [];
    for (const p of d.parts) {
      if (p === affix) continue;
      const v = input.roots.get(p);
      if (!v) throw new Error(`factorize: root "${p}" of "${d.word}" has no anchor`);
      rootPts.push(v);
    }
    const residual = subVecs(d.wordAnchor, sumVecs(rootPts));
    const a = accum.get(affix);
    if (a) {
      a.sum = sumVecs([a.sum, residual]);
      a.n += 1;
    } else {
      accum.set(affix, { sum: residual, n: 1 });
    }
  }
  for (const [affix, { sum, n }] of accum) morphemes.set(affix, roundDivVec(sum, n));

  // Compose every word's point from its now-resolved parts.
  const wordPoints = new Map<string, Vec>();
  for (const d of input.decomps) {
    const pts: Vec[] = [];
    for (const p of d.parts) {
      const v = morphemes.get(p);
      if (!v) throw new Error(`factorize: part "${p}" of "${d.word}" unresolved`);
      pts.push(v);
    }
    wordPoints.set(d.word, sumVecs(pts));
  }
  return { morphemes, wordPoints };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeFactor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/morphemeFactor.ts src/engine/semantics/__tests__/morphemeFactor.test.ts
git commit -m "feat(morphemeFactor): least-squares affix solve + composition (Track A plan 2)"
```

---

### Task 3: Validate the recipe on the REAL English preset

**Files:**
- Create: `src/engine/semantics/__tests__/morphemeFactor_english.test.ts`

This test builds the solver's inputs straight from the English preset and proves the recipe runs on real data: the composition invariant holds for every authored word, `behind` (single-occurrence `be-`) reconstructs its anchor exactly, and the solve is deterministic.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { presetEnglish } from "../../presets/english";
import { embed } from "../embeddings";
import { fromFloats, distanceSq, type Vec } from "../vec";
import { factorizeMorphemes, type Decomp } from "../morphemeFactor";

const isAffix = (id: string) => id.startsWith("-") || id.endsWith("-");

function buildEnglishInput() {
  const cfg = presetEnglish();
  const compounds = cfg.seedCompounds ?? {};
  const derivs = cfg.seedDerivations ?? {};
  const roots = new Map<string, Vec>();
  const affixIds = new Set<string>();
  const decomps: Decomp[] = [];
  const addRoot = (m: string) => { if (!roots.has(m)) roots.set(m, fromFloats(embed(m))); };

  for (const [word, c] of Object.entries(compounds)) {
    for (const p of c.parts) (isAffix(p) ? affixIds.add(p) : addRoot(p));
    decomps.push({ word, wordAnchor: fromFloats(embed(word)), parts: c.parts.slice() });
  }
  for (const [word, d] of Object.entries(derivs)) {
    isAffix(d.affix) ? affixIds.add(d.affix) : addRoot(d.affix);
    addRoot(d.base);
    decomps.push({ word, wordAnchor: fromFloats(embed(word)), parts: [d.base, d.affix] });
  }
  return { roots, affixIds, decomps };
}

describe("morphemeFactor — real English preset", () => {
  it("derives the expected authored affixes", () => {
    const { affixIds } = buildEnglishInput();
    for (const a of ["-er.agt", "-ness", "-dom", "-ship", "-hood", "be-"]) {
      expect(affixIds.has(a)).toBe(true);
    }
  });

  it("the composition invariant holds for every authored word (point == Σ parts)", () => {
    const input = buildEnglishInput();
    const { morphemes, wordPoints } = factorizeMorphemes(input);
    for (const d of input.decomps) {
      const parts = d.parts.map((p) => morphemes.get(p)!);
      const composed = parts.reduce(
        (acc, v) => { for (let i = 0; i < v.length; i++) acc[i]! += v[i]!; return acc; },
        new Int32Array(wordPoints.get(d.word)!.length),
      );
      expect(distanceSq(wordPoints.get(d.word)!, composed), d.word).toBe(0);
    }
  });

  it("a single-occurrence affix reconstructs its word's anchor exactly (behind = hind + be-)", () => {
    const input = buildEnglishInput();
    const { wordPoints } = factorizeMorphemes(input);
    expect(distanceSq(wordPoints.get("behind")!, fromFloats(embed("behind")))).toBe(0);
  });

  it("is deterministic — same inputs produce the same affix vectors", () => {
    const a = factorizeMorphemes(buildEnglishInput()).morphemes.get("-er.agt")!;
    const b = factorizeMorphemes(buildEnglishInput()).morphemes.get("-er.agt")!;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeFactor_english.test.ts`
Expected: PASS (4 tests). If `behind` reconstruction is nonzero, STOP — it means `embed("behind")`/`embed("hind")` changed or `be-` is no longer single-occurrence; report rather than weakening the assertion.

- [ ] **Step 3: Commit**

```bash
git add src/engine/semantics/__tests__/morphemeFactor_english.test.ts
git commit -m "test(morphemeFactor): validate the factorization recipe on the English preset (Track A plan 2)"
```

---

### Task 4: Bake `morphemeSpaceData.ts` + loader

**Files:**
- Create: `scripts/build-morpheme-space.ts`
- Create (generated by the script): `src/engine/semantics/morphemeSpaceData.ts`
- Create: `src/engine/semantics/morphemeSpaceLoader.ts`
- Test: `src/engine/semantics/__tests__/morphemeSpaceData.test.ts`

- [ ] **Step 1: Write the bake script**

```ts
// scripts/build-morpheme-space.ts
/**
 * build-morpheme-space.ts — generate src/engine/semantics/morphemeSpaceData.ts
 *
 * Seeds root points from the shipped GloVe table (via embed), solves the English preset's
 * authored affixes (factorizeMorphemes), and emits a deterministic data module: morphemes
 * sorted by id, words sorted by meaning, vectors as plain int arrays. Run:
 *   npx tsx scripts/build-morpheme-space.ts
 */
import * as fs from "fs";
import { presetEnglish } from "../src/engine/presets/english";
import { embed } from "../src/engine/semantics/embeddings";
import { fromFloats, type Vec } from "../src/engine/semantics/vec";
import { factorizeMorphemes, type Decomp } from "../src/engine/semantics/morphemeFactor";

const isAffix = (id: string) => id.startsWith("-") || id.endsWith("-");
const affixType = (id: string): "prefix" | "suffix" => (id.endsWith("-") ? "prefix" : "suffix");

const cfg = presetEnglish();
const compounds = cfg.seedCompounds ?? {};
const derivs = cfg.seedDerivations ?? {};
const roots = new Map<string, Vec>();
const affixIds = new Set<string>();
const decomps: Decomp[] = [];
const partsByWord = new Map<string, string[]>();
const addRoot = (m: string) => { if (!roots.has(m)) roots.set(m, fromFloats(embed(m))); };

for (const [word, c] of Object.entries(compounds)) {
  for (const p of c.parts) (isAffix(p) ? affixIds.add(p) : addRoot(p));
  decomps.push({ word, wordAnchor: fromFloats(embed(word)), parts: c.parts.slice() });
  partsByWord.set(word, c.parts.slice());
}
for (const [word, d] of Object.entries(derivs)) {
  isAffix(d.affix) ? affixIds.add(d.affix) : addRoot(d.affix);
  addRoot(d.base);
  decomps.push({ word, wordAnchor: fromFloats(embed(word)), parts: [d.base, d.affix] });
  partsByWord.set(word, [d.base, d.affix]);
}

const { morphemes, wordPoints } = factorizeMorphemes({ roots, affixIds, decomps });

const morphemeRows = [...morphemes.keys()].sort().map((id) => ({
  id,
  type: isAffix(id) ? affixType(id) : "root",
  point: Array.from(morphemes.get(id)!),
}));
const wordRows = [...wordPoints.keys()].sort().map((m) => ({
  meaning: m,
  parts: partsByWord.get(m)!,
  point: Array.from(wordPoints.get(m)!),
}));

const out =
  `// AUTO-GENERATED by scripts/build-morpheme-space.ts — do not edit by hand.\n` +
  `// Additive morpheme space for the English validation preset (Track A plan 2).\n` +
  `export const MORPHEME_SPACE = {\n` +
  `  preset: "english",\n` +
  `  morphemes: ${JSON.stringify(morphemeRows)},\n` +
  `  words: ${JSON.stringify(wordRows)},\n` +
  `} as const;\n`;

fs.writeFileSync("src/engine/semantics/morphemeSpaceData.ts", out);
console.log(`baked ${morphemeRows.length} morphemes, ${wordRows.length} words`);
```

- [ ] **Step 2: Run the bake script to generate the data module**

Run: `npx tsx scripts/build-morpheme-space.ts`
Expected: prints `baked N morphemes, M words` and creates `src/engine/semantics/morphemeSpaceData.ts`. Run it a second time and confirm `git diff --stat src/engine/semantics/morphemeSpaceData.ts` shows NO change (determinism).

- [ ] **Step 3: Write the loader**

```ts
// src/engine/semantics/morphemeSpaceLoader.ts
/**
 * morphemeSpaceLoader.ts — read the baked morpheme space (morphemeSpaceData.ts) into typed
 * runtime structures: Morphemes with Int32Array points + a meaning→point map. Plan 3 (the
 * storage flip) seeds lexeme/morpheme points from here.
 */
import type { Vec } from "./vec";
import type { Morpheme } from "./morphemeSpace";
import { MORPHEME_SPACE } from "./morphemeSpaceData";

function toVec(arr: readonly number[]): Vec {
  return Int32Array.from(arr);
}

export interface LoadedMorphemeSpace {
  morphemes: Morpheme[];
  wordPoints: Map<string, Vec>;
}

export function loadMorphemeSpace(): LoadedMorphemeSpace {
  const morphemes: Morpheme[] = MORPHEME_SPACE.morphemes.map((m) => ({
    id: m.id,
    form: [],
    point: toVec(m.point),
    type: m.type as Morpheme["type"],
  }));
  const wordPoints = new Map<string, Vec>(
    MORPHEME_SPACE.words.map((w) => [w.meaning, toVec(w.point)]),
  );
  return { morphemes, wordPoints };
}
```

- [ ] **Step 4: Write the artifact-validation test**

```ts
// src/engine/semantics/__tests__/morphemeSpaceData.test.ts
import { describe, it, expect } from "vitest";
import { MORPHEME_SPACE } from "../morphemeSpaceData";
import { loadMorphemeSpace } from "../morphemeSpaceLoader";
import { embed } from "../embeddings";
import { fromFloats, distanceSq, sumVecs } from "../vec";

describe("morphemeSpaceData — baked artifact", () => {
  it("morpheme ids are sorted (deterministic bake)", () => {
    const ids = MORPHEME_SPACE.morphemes.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("the composition invariant holds on the BAKED data (word point == Σ part points)", () => {
    const { morphemes, wordPoints } = loadMorphemeSpace();
    const byId = new Map(morphemes.map((m) => [m.id, m.point]));
    for (const w of MORPHEME_SPACE.words) {
      const composed = sumVecs(w.parts.map((p) => byId.get(p)!));
      expect(distanceSq(wordPoints.get(w.meaning)!, composed), w.meaning).toBe(0);
    }
  });

  it("behind reconstructs its GloVe anchor exactly (single-occurrence be-)", () => {
    const { wordPoints } = loadMorphemeSpace();
    expect(distanceSq(wordPoints.get("behind")!, fromFloats(embed("behind")))).toBe(0);
  });

  it("affix morphemes carry prefix/suffix types, roots carry root", () => {
    const byId = new Map(MORPHEME_SPACE.morphemes.map((m) => [m.id, m.type]));
    expect(byId.get("be-")).toBe("prefix");
    expect(byId.get("-er.agt")).toBe("suffix");
    expect(byId.get("day")).toBe("root");
  });
});
```

- [ ] **Step 5: Run the tests + typecheck**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeSpaceData.test.ts`
Expected: PASS (4 tests).
Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-morpheme-space.ts src/engine/semantics/morphemeSpaceData.ts src/engine/semantics/morphemeSpaceLoader.ts src/engine/semantics/__tests__/morphemeSpaceData.test.ts
git commit -m "feat(morphemeSpace): bake English morpheme-space data + loader (Track A plan 2)"
```

---

## What this unblocks

- **Plan 3 (A.1 storage flip):** `loadMorphemeSpace()` seeds the lexeme `point`s and the morpheme inventory behind `access.ts`, byte-identical. The English preset now has a real additive morpheme space to flip onto.
- **Track C:** the same `factorizeMorphemes` recipe scales to every preset (one agent per preset), lifting the v1 "≤ 1 affix per word" limit with an iterative solve where bulk vocabulary needs it.

## Self-review notes
- **Spec coverage:** implements Track A spec §4.2 (affix factorization via least-squares, bake script mirroring `build-embedding.ts`) and the §9 acceptance check ("every authored word's compositionError is 0", asserted in Tasks 3 + 4). Root seeding from GloVe = §4.1.
- **Determinism:** offline tooling + baked artifact only; sorted emission + integer `roundDivVec`; no engine state, no re-baseline. Reproducibility checked by re-running the bake (Task 4 step 2).
- **Type consistency:** `Decomp` / `FactorInput` / `FactorResult` are used identically across Tasks 2–4; `Morpheme` (from Plan 1) is reused by the loader; `MORPHEME_SPACE` shape (morphemes:{id,type,point}, words:{meaning,parts,point}) matches between the script's emit and both the loader and the data test.
- **Known v1 limit (documented, intentional):** at most one affix per word; affix stacking throws with a clear message. Lifted in Track C.
