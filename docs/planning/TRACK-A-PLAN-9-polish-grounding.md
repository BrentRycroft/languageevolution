# Track A · Plan 9 (polish) — Translator Grounds by Current Position

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the translator's nearest-anchor grounding read each meaning's **current** (possibly glided) point — consistent with drift (Plan 7) and the Dictionary (Plan 8), which already use `meaningPointFor`.

**Architecture:** `nearestLexicalisedMeaning` lives in `embeddings.ts`, which `meaningPoint.ts` imports (`lexPoint` needs `embed`). Reading `meaningPointFor` from `embeddings.ts` would be a circular import. So **relocate** `nearestLexicalisedMeaning` + `SEMANTIC_GROUNDING_THRESHOLD` + `GroundedMeaning` into a new `semantics/grounding.ts` (which imports `meaningPointFor` from `meaningPoint.ts` — no cycle, nothing imports `grounding.ts` back) and switch its distance to `cosineFixed(meaningPointFor(...))`. Update the two importers. Read-only translator path — **no determinism re-baseline** (never in `sim.step()`).

**Tech Stack:** TypeScript, Vitest.

**Deferred (with reason): `spread` consumption.** The spec's `spread` (breadth) is intentionally NOT wired here. It has no consumer yet, and the only producer (broaden/narrow drift) drops the source meaning in the current form-centric drift, so writing a spread on it would be inert and tangled. `spread` belongs with **Track D**, where the homonymy/polysemy boundary consumes it and the sound-change rework gives broaden/narrow a coherent point/region to move. `WordSense.spread` (Plan 6) + `senseSpread` (Plan 6) remain the ready foundation.

---

### Task 1: Relocate grounding to its own module + switch to `meaningPointFor`

**Files:**
- Create: `src/engine/semantics/grounding.ts`
- Modify: `src/engine/semantics/embeddings.ts` (remove the three relocated members + the now-unused import)
- Modify: `src/engine/lexicon/lookup.ts` (import path)
- Modify: `src/engine/__tests__/translator_semantic_grounding.test.ts` (import path)

- [ ] **Step 1: Create `grounding.ts`**

```ts
// src/engine/semantics/grounding.ts
/**
 * grounding.ts — nearest-anchor grounding for the translator (relocated from embeddings.ts).
 *
 * Lives in its own module so it can read `meaningPointFor` (a meaning's CURRENT, possibly
 * glided position) without a circular import through embeddings.ts (which meaningPoint.ts
 * depends on). The translator reuses the semantically nearest word a language ALREADY has,
 * measured at its present position in the space, rather than coining a novel form.
 */
import type { Language, Meaning } from "../types";
import { lexKeys, lexGet } from "../lexicon/access";
import { cosineFixed } from "./vec";
import { meaningPointFor } from "./meaningPoint";

/**
 * Default cosine bar for treating one meaning as a usable stand-in for another. Tuned so
 * genuine near-synonyms / hyponyms ground (river≈water) but loosely-associated words do not —
 * below it the translator coins a fresh form instead of substituting.
 */
export const SEMANTIC_GROUNDING_THRESHOLD = 0.5;

export interface GroundedMeaning {
  meaning: Meaning;
  similarity: number;
}

/**
 * The lexicalised meaning in `lang` whose current point is closest to `meaning`, provided it
 * clears `threshold`. Null if nothing's close enough. Read-only.
 */
export function nearestLexicalisedMeaning(
  lang: Language,
  meaning: Meaning,
  threshold: number = SEMANTIC_GROUNDING_THRESHOLD,
): GroundedMeaning | null {
  const target = meaningPointFor(lang, meaning);
  let best: GroundedMeaning | null = null;
  for (const k of lexKeys(lang)) {
    if (k === meaning) continue;
    const f = lexGet(lang, k);
    if (!f || f.length === 0) continue;
    const s = cosineFixed(target, meaningPointFor(lang, k));
    if (s >= threshold && (!best || s > best.similarity)) {
      best = { meaning: k, similarity: s };
    }
  }
  return best;
}
```

- [ ] **Step 2: Remove the relocated members from `embeddings.ts`**

In `src/engine/semantics/embeddings.ts`, delete `SEMANTIC_GROUNDING_THRESHOLD`, `GroundedMeaning`, and `nearestLexicalisedMeaning` (the block from the `/** Default cosine bar … */` comment through the end of `nearestLexicalisedMeaning`). Then remove the now-unused import:
```ts
import { lexKeys, lexGet } from "../lexicon/access";
```
(They were used ONLY by `nearestLexicalisedMeaning`; `embed`/`cosine`/`nearestMeanings` don't use them. `tsc` will confirm.)

- [ ] **Step 3: Update the two importers**

In `src/engine/lexicon/lookup.ts`, change:
```ts
import { nearestLexicalisedMeaning } from "../semantics/embeddings";
```
to:
```ts
import { nearestLexicalisedMeaning } from "../semantics/grounding";
```
In `src/engine/__tests__/translator_semantic_grounding.test.ts`, change the import of `nearestLexicalisedMeaning` + `SEMANTIC_GROUNDING_THRESHOLD` from `"../semantics/embeddings"` to `"../semantics/grounding"`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → no output (catches any missed import / now-unused binding).
Run: `npx vitest run --dir src src/engine/__tests__/translator_semantic_grounding.test.ts` → 4 pass (truck→car still grounds: `cosineFixed(meaningPointFor(truck), meaningPointFor(car)) ≈ 0.92 ≥ 0.5`).
Run: `npx vitest run --dir src translator` → all translator tests pass (the lookup cascade still grounds the same way at gen 0, since unglided `meaningPointFor` = the static point).

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/grounding.ts src/engine/semantics/embeddings.ts src/engine/lexicon/lookup.ts src/engine/__tests__/translator_semantic_grounding.test.ts
git commit -m "refactor(grounding): relocate nearestLexicalisedMeaning + ground by current position (Track A plan 9)"
```

---

## What this completes
- Translator, drift, and Dictionary now all read the **same** living point-space (`meaningPointFor`). Track A is complete bar the deferred `spread` (→ Track D).

## Self-review notes
- **Spec coverage:** delivers the §5 "translator grounds by current point" consumer; `spread` is the documented deferral.
- **Determinism:** the grounding/lookup cascade is never in `sim.step()` → no re-baseline; at gen 0 (no glides) `meaningPointFor` = the static point, so grounding results are unchanged → translator tests pass without reconciliation.
- **Type consistency:** `nearestLexicalisedMeaning(lang, meaning, threshold?): GroundedMeaning | null` is unchanged in signature; only its module moved and its distance metric switched to `cosineFixed(meaningPointFor(...))`.
- **No-cycle:** `grounding.ts` imports `meaningPoint` + `vec` + `access`; none import `grounding.ts`, so no cycle is introduced.
