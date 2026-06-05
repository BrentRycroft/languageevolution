# Track A · Plan 5 — Homonymy (distinct words that sound alike)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognise **homonyms** — two meanings that share a surface form but sit far apart in meaning space (knight/night) — as distinct words, distinguished from **polysemy** (related senses of one word, near points). Surface them in the Dictionary.

**Architecture:** A pure detector `homonymsOf(lang, meaning)` groups the lexicon by surface form and returns the *other* meanings sharing this word's form whose meaning points (Plan-3 `lexPoint`) are distant (cosine `< HOMONYMY_COSINE`). The Dictionary's `SemanticProfile` renders a "homonyms" row from it. Read-only analysis + UI — **no engine/sim change, no determinism re-baseline** (`homonymsOf` is never called from `sim.step()`).

**Tech Stack:** TypeScript, React, Vitest.

**Why this is free:** the lexicon is already meaning-keyed, so two meanings that share a form are already distinct entries — and their meaning points are *static* (Plan 3). Detecting homonyms is therefore pure analysis over existing state. Mutable points (drift moving a point, so meanings drift apart/together over time) is the re-baseline-bearing follow-on — **Plan 6** — and is deliberately not here.

**Realism note:** homonyms arise when sound change accidentally collapses two unrelated words' forms; polysemy arises when one word's sense broadens. The cosine threshold separates them: near points (same word, related senses) vs distant points (different words that merely sound alike).

---

### Task 1: `homonymsOf` detector

**Files:**
- Create: `src/engine/semantics/homonyms.ts`
- Test: `src/engine/semantics/__tests__/homonyms.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import { lexSet } from "../../lexicon/access";
import { homonymsOf } from "../homonyms";

function freshEnglish() {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("homonyms — homonymsOf", () => {
  it("two distant meanings sharing a form ARE homonyms (big/small are antonyms → far apart)", () => {
    const l = freshEnglish();
    lexSet(l, "big", ["k", "u", "x"]);
    lexSet(l, "small", ["k", "u", "x"]); // identical form, distant points
    expect(homonymsOf(l, "big")).toContain("small");
    expect(homonymsOf(l, "small")).toContain("big");
  });

  it("two NEAR meanings sharing a form are NOT homonyms — that's polysemy (dog/cat are close)", () => {
    const l = freshEnglish();
    lexSet(l, "dog", ["m", "o", "z"]);
    lexSet(l, "cat", ["m", "o", "z"]); // identical form, near points
    expect(homonymsOf(l, "dog")).not.toContain("cat");
  });

  it("a unique form has no homonyms", () => {
    const l = freshEnglish();
    lexSet(l, "water", ["w", "a", "q", "ʒ", "x", "z"]); // distinctive, unshared
    expect(homonymsOf(l, "water")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/homonyms.test.ts`
Expected: FAIL — `Cannot find module '../homonyms'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/semantics/homonyms.ts
/**
 * homonyms.ts — distinguish HOMONYMS from POLYSEMY.
 *
 * Two meanings that share a surface form are HOMONYMS when their meaning points are far apart
 * (low cosine) — distinct words that merely sound alike (knight/night), typically from sound
 * change collapsing two unrelated forms. When the shared-form meanings are CLOSE in the space
 * they are polysemy instead (related senses of one word). Read-only analysis over the static
 * meaning points (lexPoint); never runs in the simulation step.
 */
import type { Language, Meaning } from "../types";
import { lexKeys, lexGet } from "../lexicon/access";
import { formToString } from "../phonology/ipa";
import { lexPoint } from "./meaningPoint";
import { cosineFixed } from "./vec";

/** Below this cosine, two same-form meanings are treated as distinct words (homonyms),
 * not related senses (polysemy). Tunable (Track A spec open question H). */
export const HOMONYMY_COSINE = 0.3;

/**
 * The other meanings sharing `meaning`'s surface form whose points are distant enough to be
 * true homonyms (not polysemy). Sorted; empty if the form is unique or every sharer is near.
 */
export function homonymsOf(lang: Language, meaning: Meaning): Meaning[] {
  const form = lexGet(lang, meaning);
  if (!form || form.length === 0) return [];
  const key = formToString(form);
  const here = lexPoint(meaning);
  const out: Meaning[] = [];
  for (const other of lexKeys(lang)) {
    if (other === meaning) continue;
    const otherForm = lexGet(lang, other);
    if (!otherForm || otherForm.length === 0) continue;
    if (formToString(otherForm) !== key) continue;
    if (cosineFixed(here, lexPoint(other)) < HOMONYMY_COSINE) out.push(other);
  }
  return out.sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --dir src src/engine/semantics/__tests__/homonyms.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/homonyms.ts src/engine/semantics/__tests__/homonyms.test.ts
git commit -m "feat(homonyms): homonymsOf — same form + distant points = distinct words (Track A plan 5)"
```

---

### Task 2: Surface homonyms in `SemanticProfile`

**Files:**
- Modify: `src/ui/DictionaryView.tsx`
- Test: `src/ui/__tests__/dictionary_homonyms.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/__tests__/dictionary_homonyms.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";
import { presetEnglish } from "../../engine/presets/english";
import { lexSet } from "../../engine/lexicon/access";

/**
 * Track A plan 5: the Dictionary flags homonyms — two meanings that share a form but sit far
 * apart in meaning space — as distinct words (vs polysemy). Here big/small are forced to share
 * a form; since they are antonyms (far apart), they surface as homonyms.
 */
describe("DictionaryView — homonyms", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().loadConfig(presetEnglish());
    const s = useSimStore.getState();
    const lang = s.state.tree[s.state.rootId]!.language;
    lexSet(lang, "big", ["k", "u", "x"]);
    lexSet(lang, "small", ["k", "u", "x"]);
  });

  it("surfaces a homonym (big/small forced to share a form)", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("big")[0]!);
    expect(screen.getByText(/homonyms/i)).toBeTruthy();
    expect(screen.getAllByText("small").length).toBeGreaterThan(0);
  });

  it("a word with a unique form shows no homonyms row", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("mother")[0]!);
    expect(screen.queryByText(/homonyms/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --dir src src/ui/__tests__/dictionary_homonyms.test.tsx`
Expected: FAIL — no `/homonyms/i` label found.

- [ ] **Step 3: Add the import**

In `src/ui/DictionaryView.tsx`, after:
```ts
import { morphemeBreakdown } from "../engine/semantics/morphemeSpaceLoader";
```
add:
```ts
import { homonymsOf } from "../engine/semantics/homonyms";
```

- [ ] **Step 4: Compute homonyms in `SemanticProfile`'s memo**

In `SemanticProfile`, change:
```ts
    const axes = readoutProfile(meaning);
    const breakdown = morphemeBreakdown(meaning);
    return { nearest, axes, breakdown };
```
to:
```ts
    const axes = readoutProfile(meaning);
    const breakdown = morphemeBreakdown(meaning);
    const homonyms = homonymsOf(lang, meaning);
    return { nearest, axes, breakdown, homonyms };
```

- [ ] **Step 5: Render the homonyms row**

In `SemanticProfile`'s JSX, immediately AFTER the `{data.breakdown && ( … )}` morpheme-row block (added in Plan 4) and BEFORE the two-column grid `<div style={{ display: "grid", … }}>`, insert:
```tsx
      {data.homonyms.length > 0 && (
        <div
          className="row-8 items-center fs-1"
          style={{ marginTop: 8, flexWrap: "wrap" }}
        >
          <span
            className="label-line"
            title="same form, distant meaning — distinct words that merely sound alike"
          >
            homonyms
          </span>
          {data.homonyms.map((h) => {
            const hf = lexGet(lang, h);
            return (
              <span key={h} className="row-4 items-center">
                <span>{prettyGloss(h)}</span>
                {hf && <span className="mono t-muted">{formatForm(hf, lang, script, h)}</span>}
              </span>
            );
          })}
        </div>
      )}
```

- [ ] **Step 6: Run the test + typecheck**

Run: `npx vitest run --dir src src/ui/__tests__/dictionary_homonyms.test.tsx`
Expected: PASS (2 tests).
Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/ui/DictionaryView.tsx src/ui/__tests__/dictionary_homonyms.test.tsx
git commit -m "feat(ui): flag homonyms (same form, distant meaning) in the Dictionary (Track A plan 5)"
```

---

## What this unblocks
- Idea #5 is delivered at the observable level: homonyms are recognised and shown as distinct words. The detector also gives Track D / scorecard a way to *measure* emergent homonymy (sound change collapsing forms) later.
- **Plan 6 (mutable points — the re-baseline):** a sparse per-language point-override store so drift can MOVE a meaning's point (metaphor) and grow/shrink a `spread` scalar (broaden/narrow). `lexPoint` becomes `lexPoint(lang, meaning)` (override first, else the static default), the `meaningPoint` cache is invalidated on mutation, and clone/persistence carry the overrides. Drift writing point-moves shifts trajectories → one deliberate re-baseline. With points then mutable, homonyms can *emerge over time* as meanings drift apart while forms collide — `homonymsOf` already detects them.

## Self-review notes
- **Spec coverage:** delivers Track A spec §3.2 homonymy ("two senses sharing a form with distant points = homonyms") at the detection + UI layer, and the §5 "show homonym sets" UI. Polysemy `spread` and point *movement* ride with Plan 6.
- **Determinism:** `homonymsOf` is pure, read-only, never in `sim.step()` → no re-baseline. Uses the static `lexPoint` (Plan 3) and integer `cosineFixed` for the decision.
- **Type consistency:** `homonymsOf(lang, meaning): Meaning[]` consumed as `data.homonyms` and `.map`ped; `HOMONYMY_COSINE` is the single tunable threshold; reuses `lexGet`/`prettyGloss`/`formatForm` already imported in `DictionaryView.tsx`.
- **Test robustness:** uses real embedding relationships (big/small far, dog/cat near) so the assertions don't depend on magic vector values; the UI test forces a known homonym by sharing a form between two antonyms, and checks a unique-form word shows no row.
