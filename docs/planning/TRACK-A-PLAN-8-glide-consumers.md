# Track A · Plan 8 — Dictionary Reads the Glided Point

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Plan 7's gliding *visible*: the Dictionary computes a word's nearest neighbours from its **current** (possibly glided) position and flags meanings that have **drifted** from their original anchor.

**Architecture:** `SemanticProfile` (in `DictionaryView.tsx`) currently ranks nearest words with `cosine(embed(...))` (the static anchor). Switch it to `cosineFixed(meaningPointFor(lang, ...))` so neighbours reflect where the meaning sits *now*, and add a small "drifted" badge when `lang.meaningPoints?.[meaning]` exists (the meaning has glided). Read-only UI — **no engine change, no determinism re-baseline** (`DictionaryView` never runs inside `sim.step()`).

**Tech Stack:** TypeScript, React, Vitest.

**Scope note:** the translator-grounding switch onto `meaningPointFor` is deliberately NOT here — `nearestLexicalisedMeaning` lives in `embeddings.ts`, which `meaningPoint.ts` imports, so reading the glided point there would need the grounding helper relocated into its own module (circular import). Its visible effect is ~nil, so it waits.

---

### Task 1: Nearest-by-current-position + "drifted" badge

**Files:**
- Modify: `src/ui/DictionaryView.tsx`
- Test: `src/ui/__tests__/dictionary_drift.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/__tests__/dictionary_drift.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";
import { presetEnglish } from "../../engine/presets/english";
import { lexPoint } from "../../engine/semantics/meaningPoint";

/**
 * Track A plan 8: the Dictionary flags a meaning that has GLIDED (Plan 7) from its anchor with
 * a "drifted" badge, and ranks nearest words from the current position. Here we force a glide
 * by writing lang.meaningPoints["water"] directly.
 */
describe("DictionaryView — drifted meanings", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().loadConfig(presetEnglish());
    const s = useSimStore.getState();
    const lang = s.state.tree[s.state.rootId]!.language;
    lang.meaningPoints = { water: Array.from(lexPoint("fire")) }; // water "glided" toward fire
  });

  it("flags a glided meaning with a 'drifted' badge", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("water")[0]!);
    expect(screen.getByText(/drifted/i)).toBeTruthy();
  });

  it("shows no 'drifted' badge for a meaning that hasn't glided (fire)", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("fire")[0]!);
    expect(screen.queryByText(/drifted/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/ui/__tests__/dictionary_drift.test.tsx`
Expected: FAIL — no `/drifted/i` text.

- [ ] **Step 3: Swap the imports**

In `src/ui/DictionaryView.tsx`, change:
```ts
import { embed, cosine } from "../engine/semantics/embeddings";
```
to:
```ts
import { cosineFixed } from "../engine/semantics/vec";
import { meaningPointFor } from "../engine/semantics/meaningPoint";
```
(`embed`/`cosine` were only used by `SemanticProfile`'s nearest computation, which Step 4 replaces; `readoutProfile` is imported separately and stays.)

- [ ] **Step 4: Rank nearest words from the current position + compute `drifted`**

In `SemanticProfile`'s `useMemo`, change:
```ts
    const target = embed(meaning, lang);
    const nearest = lexKeys(lang)
      .filter((k) => k !== meaning)
      .map((k) => ({ m: k, s: cosine(target, embed(k, lang)) }))
      .filter((x) => x.s > 0.2)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
```
to:
```ts
    const target = meaningPointFor(lang, meaning);
    const nearest = lexKeys(lang)
      .filter((k) => k !== meaning)
      .map((k) => ({ m: k, s: cosineFixed(target, meaningPointFor(lang, k)) }))
      .filter((x) => x.s > 0.2)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
```
and in the same `useMemo`'s return, add `drifted`:
```ts
    const homonyms = homonymsOf(lang, meaning);
    const drifted = !!lang.meaningPoints?.[meaning];
    return { nearest, axes, breakdown, homonyms, drifted };
```

- [ ] **Step 5: Render the "drifted" badge**

In `SemanticProfile`'s header row, after the `<span className="t-muted fs-1">semantic profile</span>` (the label next to the gloss + form), add:
```tsx
          {data.drifted && (
            <span
              className="t-accent fs-1"
              title="this meaning has drifted from its original position in the space"
            >
              drifted
            </span>
          )}
```

- [ ] **Step 6: Run the test + UI suite + typecheck**

Run: `npx vitest run --dir src src/ui/__tests__/dictionary_drift.test.tsx` → 2 pass.
Run: `npx vitest run --dir src/ui` → all pass (the existing semantic-profile / morphemes / homonyms tests assert labels, not exact neighbours, so the nearest-ranking swap doesn't break them).
Run: `npx tsc --noEmit` → no output.

- [ ] **Step 7: Commit**

```bash
git add src/ui/DictionaryView.tsx src/ui/__tests__/dictionary_drift.test.tsx
git commit -m "feat(ui): rank nearest words by current position + flag drifted meanings (Track A plan 8)"
```

---

## What this completes
- **Track A is essentially done.** The continuous meaning model is built (vectors → morpheme space → `lexPoint` → gliding) and surfaced (morpheme composition, homonyms, and now drift) in the Dictionary.
- Remaining Track-A polish (optional): translator grounding onto `meaningPointFor` (needs the grounding helper relocated); `spread` consumption.
- Then the other tracks: **B** (gap-driven generation), **C** (agents re-bake all presets — *the preset rewrite*), **D** (sound change + stress + the parked `frequency_direction` red).

## Self-review notes
- **Spec coverage:** delivers the §5 "UI reads the current point" consumer for the Dictionary; translator grounding is the noted deferral.
- **Determinism:** UI-only, never in `sim.step()` → no re-baseline. `meaningPointFor`/`cosineFixed` are deterministic.
- **Type consistency:** `meaningPointFor(lang, m): Vec` ↔ `cosineFixed(Vec, Vec): number`; `drifted: boolean` consumed as `data.drifted`.
- **No-break check:** `embed`/`cosine` are removed only after their sole use (the nearest computation) is replaced; `readoutProfile` (axes) keeps its own import. Existing dictionary tests assert labels/parts, not exact neighbour ordering, so the ranking swap is safe.
