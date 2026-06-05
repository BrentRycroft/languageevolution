# Track A · Plan 4 — Dictionary Morpheme-Composition Display

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Plan 2's morpheme space *visible* — when a decomposed word is selected in the Dictionary, show its morpheme composition (e.g. `behind = hind + be-`, `daylight = day + light`).

**Architecture:** A tiny accessor `morphemeBreakdown(meaning)` reads the baked `MORPHEME_SPACE.words` and returns a word's ordered morpheme part-ids (or `null`). `DictionaryView`'s `SemanticProfile` panel renders a "morphemes" row from it, resolving each part's gloss + form from the selected language's lexicon. Read-only UI — **no engine change, no determinism re-baseline** (`DictionaryView` never runs inside `sim.step()`).

**Tech Stack:** TypeScript, React, Vitest (+ @testing-library/react, jsdom).

**Scope note:** the baked space is English-only (Plan 2), so the morpheme row appears for English's authored compounds/derivations; other presets show no row until Track C bakes their spaces. Switching the translator grounding + the panel's *nearest-words* onto `lexPoint` is deliberately NOT in this plan: the grounding switch would create a circular import (`embeddings → meaningPoint → embeddings`) and its visible effect is nil, so it waits for a later plan that relocates the grounding helper.

---

### Task 1: `morphemeBreakdown` accessor

**Files:**
- Modify: `src/engine/semantics/morphemeSpaceLoader.ts` (append)
- Test: `src/engine/semantics/__tests__/morphemeSpaceData.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

```ts
// append to src/engine/semantics/__tests__/morphemeSpaceData.test.ts
import { morphemeBreakdown } from "../morphemeSpaceLoader";

describe("morphemeSpaceLoader — morphemeBreakdown", () => {
  it("returns the ordered parts for a decomposed word", () => {
    expect(morphemeBreakdown("behind")).toEqual(["hind", "be-"]);
    expect(morphemeBreakdown("daylight")).toEqual(["day", "light"]);
  });
  it("returns null for a non-decomposed word (a root or unseen meaning)", () => {
    expect(morphemeBreakdown("water")).toBeNull();
    expect(morphemeBreakdown("zzz-not-a-word")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeSpaceData.test.ts`
Expected: FAIL — `morphemeBreakdown is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/engine/semantics/morphemeSpaceLoader.ts

let WORD_PARTS: Map<string, readonly string[]> | null = null;

/**
 * The ordered morpheme part-ids for a decomposed word, or null if it has no recorded
 * decomposition. e.g. "behind" → ["hind", "be-"], "daylight" → ["day", "light"], "water" → null.
 * Lazily indexes the baked words once. Used by the Dictionary to show a word's composition.
 */
export function morphemeBreakdown(meaning: string): readonly string[] | null {
  if (WORD_PARTS === null) {
    WORD_PARTS = new Map(MORPHEME_SPACE.words.map((w) => [w.meaning, w.parts]));
  }
  return WORD_PARTS.get(meaning) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/morphemeSpaceData.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/morphemeSpaceLoader.ts src/engine/semantics/__tests__/morphemeSpaceData.test.ts
git commit -m "feat(morphemeSpace): morphemeBreakdown accessor — a word's ordered parts (Track A plan 4)"
```

---

### Task 2: Render the morpheme row in `SemanticProfile`

**Files:**
- Modify: `src/ui/DictionaryView.tsx`
- Test: `src/ui/__tests__/dictionary_morphemes.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/__tests__/dictionary_morphemes.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";
import { presetEnglish } from "../../engine/presets/english";

/**
 * Track A plan 4: the Dictionary surfaces a decomposed word's morpheme composition (from the
 * baked morpheme space), making the Plan-2 factorization visible in the app.
 */
describe("DictionaryView — morpheme composition", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().loadConfig(presetEnglish());
  });

  it("shows the morpheme composition for a decomposed word (behind = hind + be-)", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("behind")[0]!);
    expect(screen.getByText(/morphemes/i)).toBeTruthy();
    expect(screen.getAllByText("hind").length).toBeGreaterThan(0); // a part is listed
  });

  it("shows no morpheme row for a non-decomposed word (water)", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("water")[0]!);
    expect(screen.queryByText(/morphemes/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/ui/__tests__/dictionary_morphemes.test.tsx`
Expected: FAIL — the first test can't find a `/morphemes/i` label.

- [ ] **Step 3: Add the import**

In `src/ui/DictionaryView.tsx`, after the existing import:
```ts
import { readoutProfile, READOUT_AXES, type ReadoutAxis } from "../engine/semantics/readoutAxes";
```
add:
```ts
import { morphemeBreakdown } from "../engine/semantics/morphemeSpaceLoader";
```

- [ ] **Step 4: Compute the breakdown in `SemanticProfile`'s memo**

In `SemanticProfile`, change:
```ts
    const axes = readoutProfile(meaning);
    return { nearest, axes };
```
to:
```ts
    const axes = readoutProfile(meaning);
    const breakdown = morphemeBreakdown(meaning);
    return { nearest, axes, breakdown };
```

- [ ] **Step 5: Render the morpheme row**

In `SemanticProfile`, immediately AFTER the header block's closing `</div>` (the one that closes the row containing `<strong>{prettyGloss(meaning)}</strong>` … and the ✕ close button) and BEFORE the two-column grid `<div style={{ display: "grid", … }}>`, insert:
```tsx
      {data.breakdown && (
        <div className="row-8 items-center fs-1" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <span className="label-line">morphemes</span>
          {data.breakdown.map((p, i) => {
            const pf = lexGet(lang, p);
            return (
              <span key={`${p}-${i}`} className="row-4 items-center">
                {i > 0 && <span className="t-muted">+</span>}
                <span>{prettyGloss(p)}</span>
                {pf && <span className="mono t-muted">{formatForm(pf, lang, script, p)}</span>}
              </span>
            );
          })}
        </div>
      )}
```
(`lexGet`, `prettyGloss`, `formatForm` are already imported in this file.)

- [ ] **Step 6: Run the test + typecheck**

Run: `npx vitest run --dir src src/ui/__tests__/dictionary_morphemes.test.tsx`
Expected: PASS (2 tests).
Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/ui/DictionaryView.tsx src/ui/__tests__/dictionary_morphemes.test.tsx
git commit -m "feat(ui): show a word's morpheme composition in the Dictionary (Track A plan 4)"
```

---

## What this unblocks
- The Plan-2 morpheme space is now visible in the app — the first user-facing payoff of the vector-space-native model.
- **Plan 5 (mutable points + homonymy):** add a sparse per-language point-override store so drift can move a point / grow-shrink `spread`, surface homonyms (same form, distant points) as distinct lexemes, and **invalidate the `meaningPoint` module cache** when points mutate. The translator-grounding / nearest-words switch onto `lexPoint` rides along here (relocating the grounding helper resolves the circular import).

## Self-review notes
- **Spec coverage:** delivers the UI half of Track A spec §5 ("UI: …show homonym sets and morpheme composition") for the *composition* part; homonym-set display rides with Plan 5's homonymy work.
- **Determinism:** no engine/sim change; `DictionaryView` is never in `sim.step()`, so no re-baseline. The accessor is a pure lazily-indexed read of the baked artifact.
- **Type consistency:** `morphemeBreakdown(meaning): readonly string[] | null` is consumed as `data.breakdown` (same type) and `.map`ped (readonly arrays map fine); `MORPHEME_SPACE.words[].parts` is the readonly source.
- **Test robustness:** the UI test loads English explicitly via `loadConfig(presetEnglish())` (the default store config may not carry the English `seedDerivations`); it asserts the `morphemes` label + a part gloss rather than brittle exact-form strings, and that a non-decomposed word shows no row.
