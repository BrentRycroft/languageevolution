# Track A · Plan 7 — Drift Glides Meaning Points (the re-baseline)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make meaning points *move*: when a word undergoes a metaphor/metonymy shift toward a related sense, its point glides a fixed step toward that sense — so the meaning space is alive and drift navigates the moved positions.

**Architecture:** A sparse per-language `meaningPoints?: Record<Meaning, number[]>` holds glided positions (default = the static Plan-3 `lexPoint`). `meaningPointFor(lang, meaning)` reads the override-or-default. `classifyShift` measures semantic distance via `meaningPointFor` (lang-aware) instead of the static `lexPoint`, and `driftOneMeaning` calls `glideMeaningPoint` when a kept (polysemous) metaphor/metonymy shift fires — nudging the source meaning a fixed `1/GLIDE_DENOM` of the way toward the target. The glide feeds back into future `classifyShift` calls → trajectories shift → **one deliberate `meaning_layer_baseline` re-baseline.**

**Tech Stack:** TypeScript, Vitest. Builds on Plan 1 (`sumVecs`, `cosineFixed`), Plan 2 (`subVecs`, `roundDivVec`), Plan 3 (`lexPoint`).

**Design note (per-meaning vs per-sense — implementation reality):** Plan 6 added `WordSense.point` for the per-lexeme model. But true per-sense gliding is fragile: `syncWordsFromLexicon` rebuilds `words` at init+split (would drop a sense's point), and reading a sense in the drift hot path needs a meaning→sense lookup. A per-MEANING map is robust (never rebuilt; survives clone/persist; O(1)) and — since each meaning maps 1:1 to a sense — yields the same observable gliding. So the glide source-of-truth is `lang.meaningPoints`; `WordSense.point`/`sensePoint` remain the per-sense API for later display needs (Plan 8 can mirror the map into `sensePoint`). Reproducibility (same seed → identical output) holds throughout; only byte-identity-vs-old-baseline moves.

---

### Task 1: `meaningPoints` store + `meaningPointFor` + glide helper (infra, byte-identical)

**Files:**
- Modify: `src/engine/types.ts` (Language interface)
- Modify: `src/engine/semantics/meaningPoint.ts` (append)
- Modify: `src/engine/utils/clone.ts` (cloneLanguage)
- Modify: `src/engine/lexicon/mutate.ts` (deleteMeaning cleanup)
- Test: `src/engine/semantics/__tests__/meaningPoint.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
// append to src/engine/semantics/__tests__/meaningPoint.test.ts
import { meaningPointFor, glideMeaningPoint, GLIDE_DENOM } from "../meaningPoint";
import { subVecs, roundDivVec, sumVecs } from "../vec";
import type { Language } from "../../types";

function bareLang(): Language {
  return { meaningPoints: undefined } as unknown as Language;
}

describe("meaningPoint — meaningPointFor / glideMeaningPoint", () => {
  it("meaningPointFor falls back to the static lexPoint with no override", () => {
    expect(Array.from(meaningPointFor(bareLang(), "water"))).toEqual(Array.from(lexPoint("water")));
  });

  it("meaningPointFor returns the stored override when present", () => {
    const lang = bareLang();
    lang.meaningPoints = { water: Array.from(lexPoint("fire")) };
    expect(Array.from(meaningPointFor(lang, "water"))).toEqual(Array.from(lexPoint("fire")));
  });

  it("glideMeaningPoint moves a meaning 1/GLIDE_DENOM toward the target and records it", () => {
    const lang = bareLang();
    const from = lexPoint("water");
    const toward = lexPoint("fire");
    glideMeaningPoint(lang, "water", "fire");
    const expected = sumVecs([from, roundDivVec(subVecs(toward, from), GLIDE_DENOM)]);
    expect(lang.meaningPoints!["water"]).toEqual(Array.from(expected));
  });

  it("repeated glides accumulate (the point keeps moving toward the target)", () => {
    const lang = bareLang();
    glideMeaningPoint(lang, "water", "fire");
    const after1 = lang.meaningPoints!["water"]!.slice();
    glideMeaningPoint(lang, "water", "fire");
    const after2 = lang.meaningPoints!["water"]!;
    // closer to fire than after the first glide (distance strictly decreases)
    const dist = (p: number[]) => {
      const f = Array.from(lexPoint("fire"));
      return p.reduce((s, x, i) => s + (x - f[i]!) ** 2, 0);
    };
    expect(dist(after2)).toBeLessThan(dist(after1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/meaningPoint.test.ts`
Expected: FAIL — `meaningPointFor is not a function`.

- [ ] **Step 3: Add the `Language` field**

In `src/engine/types.ts`, in the `Language` interface (near the other optional per-meaning satellite maps like `wordFrequencyHints` / `registerOf`), add:
```ts
  /**
   * Track A plan 7: sparse glided meaning positions (fixed-point ints as number[] for
   * clone/JSON-persist). A meaning absent here sits at its static `lexPoint`; drift's
   * metaphor/metonymy shifts nudge an entry toward the target (glideMeaningPoint). Read via
   * `meaningPointFor`. Survives the word-resync (it is never rebuilt from the lexicon).
   */
  meaningPoints?: Record<Meaning, number[]>;
```

- [ ] **Step 4: Append the accessor + glide helper**

Append to `src/engine/semantics/meaningPoint.ts`:
```ts
import type { Language } from "../types";
import { sumVecs, subVecs, roundDivVec } from "./vec";

/** Fraction of the way a glide moves toward the target: 1/GLIDE_DENOM per metaphor/metonymy. */
export const GLIDE_DENOM = 8;

/** A meaning's CURRENT point: its glided override if any, else the static default. Lang-aware. */
export function meaningPointFor(lang: Language, meaning: Meaning): Vec {
  const o = lang.meaningPoints?.[meaning];
  return o ? Int32Array.from(o) : lexPoint(meaning);
}

/** Nudge `meaning` a fixed 1/GLIDE_DENOM toward `toward`'s current point; record the override. */
export function glideMeaningPoint(lang: Language, meaning: Meaning, toward: Meaning): void {
  const from = meaningPointFor(lang, meaning);
  const target = meaningPointFor(lang, toward);
  const step = roundDivVec(subVecs(target, from), GLIDE_DENOM);
  (lang.meaningPoints ??= {})[meaning] = Array.from(sumVecs([from, step]));
}
```
(`meaningPoint.ts` already imports `type Vec` from `./vec` and `Meaning` from `../types`; reuse them, just add `Language` + the three vec helpers.)

- [ ] **Step 5: Clone the store**

In `src/engine/utils/clone.ts`, inside `cloneLanguage`'s returned object (alongside the other satellite maps like `wordFrequencyHints: { ...lang.wordFrequencyHints }`), add:
```ts
    meaningPoints: lang.meaningPoints
      ? Object.fromEntries(
          Object.entries(lang.meaningPoints).map(([k, v]) => [k, v.slice()]),
        )
      : undefined,
```

- [ ] **Step 6: Clean up on meaning deletion**

In `src/engine/lexicon/mutate.ts`, inside `deleteMeaning` (where it purges the meaning's other satellite entries — `wordFrequencyHints`, `registerOf`, etc.), add a cleanup so a dropped meaning doesn't leave a stale point:
```ts
  if (lang.meaningPoints) delete lang.meaningPoints[meaning];
```
(Use whatever the meaning parameter is named in `deleteMeaning` — match the existing satellite-purge lines.)

- [ ] **Step 7: Run test + byte-identity check**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/meaningPoint.test.ts` → all pass.
Run: `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline` → 12 pass, hashes UNCHANGED (nothing writes `meaningPoints` yet, and `classifyShift` hasn't switched). If a hash changed, STOP and report.
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/semantics/meaningPoint.ts src/engine/utils/clone.ts src/engine/lexicon/mutate.ts src/engine/semantics/__tests__/meaningPoint.test.ts
git commit -m "feat(meaningPoint): meaningPoints store + meaningPointFor + glideMeaningPoint (Track A plan 7)"
```

---

### Task 2: classifyShift reads the moved point + drift glides + RE-BASELINE

**Files:**
- Modify: `src/engine/semantics/drift.ts`
- Modify: `src/engine/__tests__/meaning_layer_baseline.test.ts` (re-baseline)

- [ ] **Step 1: Switch classifyShift to the lang-aware point**

In `src/engine/semantics/drift.ts`:
(a) Add to the imports (next to `import { lexPoint } from "./meaningPoint";`):
```ts
import { meaningPointFor, glideMeaningPoint } from "./meaningPoint";
```
(b) In `classifyShift`, the 5th parameter is currently `_lang?: Language` (renamed unused in Plan 3). Rename it back to `lang?: Language`.
(c) Change the similarity line:
```ts
  const similarity = cosineFixed(lexPoint(from), lexPoint(to));
```
to:
```ts
  // Plan 7: distance from the meanings' CURRENT (possibly glided) points, not the static
  // anchors — drift navigates the living space. No-lang callers (the unit test) keep the
  // static lexPoint, so their behaviour is unchanged.
  const similarity = lang
    ? cosineFixed(meaningPointFor(lang, from), meaningPointFor(lang, to))
    : cosineFixed(lexPoint(from), lexPoint(to));
```
(`lexPoint` is still imported and used in the no-lang branch — keep its import.)

- [ ] **Step 2: Glide the point when a metaphor/metonymy shift is kept**

In `driftOneMeaning`, find the polysemous branch where a kept drift records a colexification — the `else` of `if (!polysemous) { deleteMeaning(...) } else { recordColexification(lang, m, target); }`. Inside that `else` block, AFTER `recordColexification(lang, m, target);`, add:
```ts
        // Plan 7: a kept metaphor/metonymy shift glides m's point toward the target —
        // the word's meaning drifts toward the sense it colexified with.
        if (kind === "metaphor" || kind === "metonymy") {
          glideMeaningPoint(lang, m, target);
        }
```

- [ ] **Step 3: Typecheck + capture the new hashes**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run --dir src classifyShift` → the unit test (no lang) is UNCHANGED and must pass.
Run: `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline 2>&1 | grep -oE "(pie|bantu|romance|germanic|tokipona|english) gen-30 byte-identity: expected '[0-9a-f]+'" | sort -u`
The FIRST hash in each "expected 'X' to be 'Y'" line is the NEW value. Record all six. (If FEWER than six presets show a diff, only those that drift via kept metaphor/metonymy within 30 gens moved — update only those; leave the rest.)

- [ ] **Step 4: Update + document the baseline**

In `src/engine/__tests__/meaning_layer_baseline.test.ts`, update the changed `GENN` hash(es) and prepend:
```ts
// GENN re-baselined 2026-06-04 (Track A plan 7 — drift glides meaning points). classifyShift
// now measures distance from each meaning's CURRENT point (meaningPointFor), and a kept
// metaphor/metonymy shift glides the source meaning 1/8 toward the target (glideMeaningPoint),
// recorded in lang.meaningPoints. Presets whose 30-gen run contains a kept metaphor/metonymy
// shift drift differently from there. GEN0 unchanged (no drift at gen 0). Reproducibility
// preserved (same config → identical output; re-run confirmed).
```

- [ ] **Step 5: Confirm green + reproducible, then reconcile fast tier**

Run: `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline` → 12 pass. Run it a SECOND time → identical (reproducibility).
Run: `npx vitest run --dir src` → reconcile any multi-gen semantics test that asserts a specific drifted form/cluster (update the expected value as a trajectory shift). **STOP and report** if a failure looks like a logic regression (antonyms merging, inventory unbounded, crash, NaN). Re-run until the fast tier is green. List every test you reconciled.

- [ ] **Step 6: Commit**

```bash
git add src/engine/semantics/drift.ts src/engine/__tests__/meaning_layer_baseline.test.ts <reconciled files>
git commit -m "feat(drift): glide meaning points on kept metaphor/metonymy + re-baseline (Track A plan 7)"
```

---

## What this unblocks
- **Plan 8 (consumers):** translator grounding + the Dictionary read `meaningPointFor` so a word's *current* glided position drives display + nearest-word lookup (no re-baseline — read-only). `sensePoint` can mirror `meaningPoints` so the per-sense API reflects the glide.
- The space is now genuinely dynamic: meanings drift over generations, and `homonymsOf` (Plan 5) will begin to find emergent homonyms as glided meanings move apart while forms collide.

## Self-review notes
- **Spec coverage:** delivers §3.2 "metaphor moves the point" via `glideMeaningPoint`, consumed by `classifyShift`. `spread` movement (broaden/narrow) is intentionally deferred until a consumer reads it (Track D homonymy boundary) — recording it now would be inert.
- **Determinism:** the glide is integer fixed-point, no RNG draw, applied after existing drift logic — so within a gen the draw order is unchanged; the moved point only changes FUTURE classifyShift outcomes, which is the deliberate re-baseline. Reproducibility re-confirmed (Task 2 step 5). The no-lang `classifyShift` unit test is byte-identical.
- **Type consistency:** `meaningPoints?: Record<Meaning, number[]>` (clone/JSON) ↔ `meaningPointFor` returns `Vec` via `Int32Array.from`; `glideMeaningPoint` writes `Array.from(Vec)`; reuses `subVecs`/`roundDivVec`/`sumVecs`.
- **Robustness:** the per-meaning map survives `syncWordsFromLexicon`/`syncWordsAfterPhonology` (never rebuilt from it), is cloned (Task 1 step 5) and persisted (JSON), and is purged on `deleteMeaning` (Task 1 step 6) so dropped meanings leave no stale points.
