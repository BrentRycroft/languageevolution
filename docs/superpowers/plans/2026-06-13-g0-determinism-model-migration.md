# G0 — Determinism Model Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cross-machine byte-identical determinism gate (`meaning_layer_baseline`'s frozen `GEN0`/`GENN` hashes) with per-machine reproducibility + metric-stability snapshot bands, additively and behavior-neutrally.

**Architecture:** Three layers: (1) a reproducibility gate that runs each preset twice and asserts identical live signatures (reusing the existing `signature()`), (2) a metric-bands layer folded into the existing scorecard run that hard-asserts ~10 per-preset scalar metrics stay within committed bands, (3) the existing statistical floors unchanged. New gates stand up first; the frozen hashes are retired last. No engine code changes.

**Tech Stack:** TypeScript, Vitest. Determinism/realism gates under `src/engine/__tests__`; metric helpers in `src/engine/diagnostics/scorecard.ts`.

**Reference spec:** `docs/superpowers/specs/2026-06-13-g0-determinism-model-migration-design.md`

**Note:** This plan is authored for later execution by a subagent (deferred). Branch `auto/storage-pointnative`, local commits only.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/engine/__tests__/signature.ts` | **Create** | Shared `signature(sim)` helper (extracted from `meaning_layer_baseline.test.ts`) |
| `src/engine/__tests__/reproducibility.test.ts` | **Create** | Layer 1 — run-twice-identical gate (FAST + RUN_SLOW) |
| `src/engine/__tests__/meaning_layer_baseline.test.ts` | Modify → **Delete** (Task 4) | Import shared `signature()` during coexistence; deleted at retirement |
| `src/engine/__tests__/metric_bands.snapshot.ts` | **Create** | Layer 2 — committed per-preset metric snapshot + bands |
| `src/engine/__tests__/realism_scorecard.test.ts` | Modify | Fold metric-band hard assertions into the existing RUN_SLOW run |
| `src/engine/__tests__/gate_meta.test.ts` | **Create** | Negative/meta tests: the gates fail when they should |
| `CLAUDE.md` | Modify | Update the determinism guidance |
| `docs/planning/ROADMAP.md` | Modify | Note the new determinism model |

---

## Task 1: Extract `signature()` and add the reproducibility gate

**Files:**
- Create: `src/engine/__tests__/signature.ts`
- Modify: `src/engine/__tests__/meaning_layer_baseline.test.ts`
- Create: `src/engine/__tests__/reproducibility.test.ts`

- [ ] **Step 1: Create the shared `signature()` helper**

Create `src/engine/__tests__/signature.ts` with the exact logic currently inline in `meaning_layer_baseline.test.ts` (gloss→form pairs + word formKeys, FNV-hashed):

```ts
import type { createSimulation } from "../simulation";
import { formToString } from "../phonology/ipa";
import { fnv1a } from "../rng";
import { lexIds, lexFormById } from "../lexicon/access";
import { meaningForLexemeId } from "../lexicon/lexemeIdentity";

/**
 * Deterministic hash of every tree node's lexicon (gloss → form, gloss-sorted)
 * + word formKeys. Shared by the reproducibility gate and (until retired) the
 * meaning-layer baseline. Locks GLOSS → form via the id-native seam.
 */
export function signature(sim: ReturnType<typeof createSimulation>): string {
  const tree = sim.getState().tree;
  const parts: string[] = [];
  for (const id of Object.keys(tree).sort()) {
    const lang = tree[id]!.language;
    const lex = lexIds(lang)
      .map((idk) => ({ g: meaningForLexemeId(lang, idk)!, f: formToString(lexFormById(lang, idk)!) }))
      .sort((a, b) => (a.g < b.g ? -1 : a.g > b.g ? 1 : 0))
      .map((e) => `${e.g}=${e.f}`)
      .join("|");
    const words = (lang.words ?? []).map((w) => w.formKey).sort().join("|");
    parts.push(`${id}#${lex}#${words}`);
  }
  return fnv1a(parts.join("\n")).toString(16).padStart(8, "0");
}
```

- [ ] **Step 2: Point `meaning_layer_baseline.test.ts` at the shared helper**

In `meaning_layer_baseline.test.ts`, delete the inline `signature` function (and its now-unused imports `formToString`, `fnv1a`, `lexIds`, `lexFormById`, `meaningForLexemeId` if used only by it), and add `import { signature } from "./signature";`. Leave the GEN0/GENN maps and tests intact (they stay green during coexistence).

- [ ] **Step 3: Verify the baseline still passes (byte-identical refactor)**

Run: `npx vitest run --dir src meaning_layer_baseline`
Expected: PASS — the 6 GEN0 tests still match their locked hashes (the refactor is byte-identical).

- [ ] **Step 4: Write the reproducibility gate**

Create `src/engine/__tests__/reproducibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetGermanic } from "../presets/germanic";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { signature } from "./signature";
import type { SimulationConfig } from "../types";

/**
 * Per-machine reproducibility gate (G0). Same config on the SAME machine must
 * reproduce identically — the determinism invariant that survives GPU floats
 * (G7), replacing cross-machine byte-identity. Compares two LIVE runs; no frozen
 * baseline. Trivially green on the deterministic CPU engine today (intended
 * future guard).
 */
const RUN_SLOW = !!(globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.RUN_SLOW;

const PRESETS: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  bantu: presetBantu,
  romance: presetRomance,
  germanic: presetGermanic,
  tokipona: presetTokipona,
  english: presetEnglish,
};

describe("determinism — per-machine reproducibility (run twice → identical)", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: gen-0 + 5-step run reproduces identically (FAST)`, () => {
      const a = createSimulation(build());
      const b = createSimulation(build());
      expect(signature(a), `${name} gen-0`).toBe(signature(b));
      for (let i = 0; i < 5; i++) { a.step(); b.step(); }
      expect(signature(a), `${name} gen-5`).toBe(signature(b));
    });

    it.skipIf(!RUN_SLOW)(`${name}: 30-step run reproduces identically (RUN_SLOW)`, () => {
      const a = createSimulation(build());
      const b = createSimulation(build());
      for (let i = 0; i < 30; i++) { a.step(); b.step(); }
      expect(signature(a), `${name} gen-30`).toBe(signature(b));
    });
  }
});
```

- [ ] **Step 5: Run the reproducibility gate**

Run: `npx vitest run --dir src reproducibility`
Expected: PASS — 6 FAST tests pass (RUN_SLOW skipped).
Run: `RUN_SLOW=1 npx vitest run --dir src reproducibility`
Expected: PASS — all 12 pass.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/engine/__tests__/signature.ts src/engine/__tests__/reproducibility.test.ts src/engine/__tests__/meaning_layer_baseline.test.ts
git commit -m "$(printf 'test(g0): reproducibility gate + extract shared signature()\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Metric-bands layer (snapshot + folded scorecard assertions)

**Files:**
- Create: `src/engine/__tests__/metric_bands.snapshot.ts`
- Modify: `src/engine/__tests__/realism_scorecard.test.ts`

The ten metrics (all computable from the scorecard's existing single-lineage 200-gen run):
`swadesh1000`, `swadesh2500`, `swadesh5000` (the three checkpoints already in `curve`),
`invSize` (`lang.phonemeInventory.segmental.length`), `sizeRatio` (`lexIds(lang).length / seed.size`),
`colexRate` (`colexificationRate(lang).rate`), `antonymCosine` (`antonymCosine(lang).mean`),
`voicelessStopShare` (`onsetStats(lang).voicelessStopShare`), `regularShare` (`actuationShare(lang).regularShare`),
`homophonyRate` (`homophonyRate(lang)`).

- [ ] **Step 1: Create the snapshot module (bands set; values captured in Step 3)**

Create `src/engine/__tests__/metric_bands.snapshot.ts`:

```ts
/**
 * Metric-stability snapshot bands (G0). The re-bakeable regression baseline that
 * replaces byte-identity: each metric must stay within `band` of `value`
 * (absolute if `absolute`, else relative fraction). Update a `value` DELIBERATELY
 * (with a dated comment) when a change legitimately moves a metric — same
 * discipline as the old hash re-bakes, but tolerant to small drift.
 *
 * `value`s captured 2026-xx-xx from `RUN_SLOW=1 vitest realism_scorecard` (G0 is
 * behavior-neutral, so the captured values are the current/correct ones).
 */
export type MetricId =
  | "swadesh1000" | "swadesh2500" | "swadesh5000"
  | "invSize" | "sizeRatio" | "colexRate" | "antonymCosine"
  | "voicelessStopShare" | "regularShare" | "homophonyRate";

export interface MetricBand {
  /** Recorded reference value (captured; see header). */
  value: number;
  /** Half-width of the tolerance band. Absolute units if `absolute`, else a relative fraction. */
  band: number;
  absolute: boolean;
}

/** Default band per metric type (used when filling the snapshot below). */
export const DEFAULT_BANDS: Record<MetricId, { band: number; absolute: boolean }> = {
  swadesh1000: { band: 0.05, absolute: true },
  swadesh2500: { band: 0.05, absolute: true },
  swadesh5000: { band: 0.05, absolute: true },
  invSize: { band: 4, absolute: true },
  sizeRatio: { band: 0.3, absolute: true },
  colexRate: { band: 0.05, absolute: true },
  antonymCosine: { band: 0.15, absolute: true },
  voicelessStopShare: { band: 0.05, absolute: true },
  regularShare: { band: 0.15, absolute: false },
  homophonyRate: { band: 0.05, absolute: true },
};

// Filled in Step 3 (one entry per preset id: pie/bantu/romance/germanic/tokipona/english).
export const METRIC_BANDS: Record<string, Record<MetricId, MetricBand>> = {};

export function bandFor(presetId: string, metric: MetricId): MetricBand | undefined {
  return METRIC_BANDS[presetId]?.[metric];
}

export function withinBand(actual: number, b: MetricBand): boolean {
  if (!Number.isFinite(actual)) return false;
  const half = b.absolute ? b.band : Math.abs(b.value) * b.band;
  return actual >= b.value - half && actual <= b.value + half;
}
```

- [ ] **Step 2: Fold band assertions into the scorecard, with a capture log**

In `realism_scorecard.test.ts`, add imports:

```ts
import { onsetStats, actuationShare, antonymCosine, colexificationRate, homophonyRate } from "../diagnostics/scorecard";
import { lexIds } from "../lexicon/access";
import { bandFor, withinBand, type MetricId } from "./metric_bands.snapshot";
```

After the existing `const lang = soleLeaf(sim.getState());` and `rows` are built (around line 105-113), compute the ten raw metrics and assert/capture:

```ts
      // ── G0 metric-stability bands (RUN_SLOW) ──
      const metrics: Record<MetricId, number> = {
        swadesh1000: curve[0]!.swadesh,
        swadesh2500: curve[1]!.swadesh,
        swadesh5000: curve[2]!.swadesh,
        invSize: lang.phonemeInventory.segmental.length,
        sizeRatio: lexIds(lang).length / Math.max(1, seed.size),
        colexRate: colexificationRate(lang).rate,
        antonymCosine: antonymCosine(lang).mean,
        voicelessStopShare: onsetStats(lang).voicelessStopShare,
        regularShare: actuationShare(lang).regularShare,
        homophonyRate: homophonyRate(lang),
      };
      // CAPTURE AID (remove after Step 3): print exact values for the snapshot.
      // eslint-disable-next-line no-console
      console.log(`METRIC_CAPTURE ${preset.id} ${JSON.stringify(metrics)}`);
      for (const [k, v] of Object.entries(metrics) as [MetricId, number][]) {
        const b = bandFor(preset.id, k);
        if (!b) continue; // no snapshot yet → skip (filled in Step 3)
        expect(withinBand(v, b), `${preset.id}.${k}=${v} outside band [${b.value}±${b.absolute ? b.band : b.value * b.band}]`).toBe(true);
      }
```

- [ ] **Step 3: Capture the snapshot values**

Run: `RUN_SLOW=1 npx vitest run --dir src realism_scorecard 2>&1 | grep METRIC_CAPTURE`
Expected: six `METRIC_CAPTURE <preset> {…}` lines. Run twice; confirm the JSON is identical both runs (reproducible). Then fill `METRIC_BANDS` in `metric_bands.snapshot.ts` using the captured values + `DEFAULT_BANDS`, e.g.:

```ts
export const METRIC_BANDS: Record<string, Record<MetricId, MetricBand>> = {
  pie: {
    swadesh1000: { value: /* captured */ 0.0, ...DEFAULT_BANDS.swadesh1000 },
    // … all ten metrics, for all six presets …
  },
  // bantu / romance / germanic / tokipona / english …
};
```

(Build each entry as `{ value: <captured>, ...DEFAULT_BANDS[metric] }`.)

- [ ] **Step 4: Remove the capture log; verify the bands gate**

Delete the `METRIC_CAPTURE` `console.log` line from Step 2.
Run: `RUN_SLOW=1 npx vitest run --dir src realism_scorecard`
Expected: PASS — every metric is within its band (it must be: the bands were built around the captured values).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/engine/__tests__/metric_bands.snapshot.ts src/engine/__tests__/realism_scorecard.test.ts
git commit -m "$(printf 'test(g0): metric-stability snapshot bands folded into scorecard\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Negative/meta tests (prove the gates catch real breaks)

**Files:**
- Create: `src/engine/__tests__/gate_meta.test.ts`

- [ ] **Step 1: Write the meta tests**

Create `src/engine/__tests__/gate_meta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { signature } from "./signature";
import { withinBand, type MetricBand } from "./metric_bands.snapshot";

/**
 * Meta-tests: prove the G0 gates are NOT vacuous — they fail when they should.
 */
describe("G0 gate meta-tests", () => {
  it("signature() discriminates: an extra step changes the signature", () => {
    const a = createSimulation(presetEnglish());
    const b = createSimulation(presetEnglish());
    a.step();
    a.step();
    b.step();
    // a has taken one more step than b → signatures must differ.
    expect(signature(a)).not.toBe(signature(b));
  });

  it("a reproducibility break would be caught (differing signatures fail equality)", () => {
    const a = createSimulation(presetEnglish());
    const b = createSimulation(presetEnglish());
    for (let i = 0; i < 3; i++) { a.step(); b.step(); }
    const same = signature(a) === signature(b);
    expect(same).toBe(true); // they DO match (control)
    // and a divergence would be detectable:
    a.step();
    expect(signature(a) === signature(b)).toBe(false);
  });

  it("withinBand catches a perturbation outside the band", () => {
    const b: MetricBand = { value: 30, band: 4, absolute: true };
    expect(withinBand(30, b)).toBe(true);
    expect(withinBand(31, b)).toBe(true);
    expect(withinBand(40, b)).toBe(false); // perturbation → out of band
    const rel: MetricBand = { value: 0.6, band: 0.15, absolute: false };
    expect(withinBand(0.6, rel)).toBe(true);
    expect(withinBand(0.9, rel)).toBe(false);
    expect(withinBand(NaN, b)).toBe(false);
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npx vitest run --dir src gate_meta`
Expected: PASS (3 tests).

```bash
git add src/engine/__tests__/gate_meta.test.ts
git commit -m "$(printf 'test(g0): meta-tests prove reproducibility + band gates catch breaks\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Retire `meaning_layer_baseline` frozen hashes

**Files:**
- Delete: `src/engine/__tests__/meaning_layer_baseline.test.ts`

- [ ] **Step 1: Confirm the new gates cover the same surface**

Run: `RUN_SLOW=1 npx vitest run --dir src reproducibility realism_scorecard gate_meta`
Expected: PASS — reproducibility (12), scorecard with bands (6), meta (3) all green. These are the replacement; the frozen-hash file can now go.

- [ ] **Step 2: Delete the frozen-hash baseline**

```bash
git rm src/engine/__tests__/meaning_layer_baseline.test.ts
```

(The shared `signature()` lives in `signature.ts` — used by `reproducibility.test.ts` and `gate_meta.test.ts` — so nothing is orphaned.)

- [ ] **Step 3: Verify nothing references the removed file or its hash maps**

Run: `git grep -nE "meaning_layer_baseline|GEN0|GENN" -- 'src/**'`
Expected: no matches under `src/` (the file is gone; `GEN0`/`GENN` existed only there).

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git commit -am "$(printf 'test(g0): retire cross-machine byte-identity baseline (meaning_layer_baseline)\n\nReplaced by the reproducibility gate + metric-stability bands.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/planning/ROADMAP.md`

- [ ] **Step 1: Update CLAUDE.md determinism guidance**

In `CLAUDE.md` §4 ("Goal-Driven Execution"), the paragraph that reads *"For determinism work, the real proof of byte-identity is the `meaning_layer_baseline` GEN0/GENN baseline — trust it over individual aged assertions."* — replace with:

```
**Verify against the current determinism model.** As of the G0 migration
(2026-06-13), determinism is **per-machine reproducibility** (same config on the
same machine → identical output: the `reproducibility.test.ts` gate), not
cross-machine byte-identity. Regression detection is the metric-stability snapshot
bands (`metric_bands.snapshot.ts`, folded into the RUN_SLOW scorecard) plus the
statistical floors (`divergence_regression`, `proto_preservation`, `realism_*`).
A metric moving out of band is re-baked DELIBERATELY (update the snapshot value
with a dated note) when the change is legitimate. There is no longer a frozen
cross-machine hash baseline.
```

- [ ] **Step 2: Add a ROADMAP note**

In `docs/planning/ROADMAP.md`, under the decision log / status area, add:

```
- **G0 — determinism model migrated (2026-06-13).** Cross-machine byte-identity
  (meaning_layer_baseline frozen hashes) retired in favour of per-machine
  reproducibility (reproducibility.test.ts) + metric-stability snapshot bands
  (metric_bands.snapshot.ts, in the scorecard). Unblocks geometric reworks (G1)
  and GPU offload (G7). Behavior-neutral.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/planning/ROADMAP.md
git commit -m "$(printf 'docs(g0): determinism model = per-machine reproducibility + metric bands\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Final verification gate

- [ ] **Step 1: tsc clean** — `npx tsc --noEmit`.
- [ ] **Step 2: Targeted gates** — `RUN_SLOW=1 npx vitest run --dir src reproducibility realism_scorecard gate_meta divergence_regression proto_preservation` → all green.
- [ ] **Step 3: Full suite** — `npx vitest run --dir src` green (FAST), and once as a milestone `RUN_SLOW=1 npx vitest run --dir src` green. Confirm no test references the removed `meaning_layer_baseline`.

---

## Self-review

**Spec coverage:** Layer 1 reproducibility → Task 1. Layer 2 metric bands → Task 2. Negative tests → Task 3. Retire frozen hashes → Task 4. Docs (CLAUDE.md + ROADMAP) → Task 5. Behavior-neutral (no engine edits) — every task touches only tests/docs. ✓

**Placeholder scan:** The only un-filled literals are the captured metric `value`s (Task 2 Step 3) — these are machine-computed by design (a capture step, exactly like the old hash re-bakes), with an explicit command to produce them; not a placeholder. ✓

**Type/name consistency:** `signature(sim)` signature identical across `signature.ts`, `reproducibility.test.ts`, `gate_meta.test.ts`. `MetricId` / `MetricBand` / `withinBand` / `bandFor` consistent between `metric_bands.snapshot.ts` and its consumers. Metric helper names (`onsetStats`, `actuationShare`, `antonymCosine`, `colexificationRate`, `homophonyRate`) match `diagnostics/scorecard.ts` exports used by `buildScorecard`. ✓

**Out of scope (correctly excluded):** No engine/behavior change; no GPU; no geometric work. ✓
