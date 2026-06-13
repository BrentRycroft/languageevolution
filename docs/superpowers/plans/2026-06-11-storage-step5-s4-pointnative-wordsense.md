# Storage step 5 — S4: point-native WordSense identity + `meaningPoints` re-key — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-key the `meaningPoints` drift-override map gloss→`LexemeId`, give every `WordSense` a `lexemeId` identity, and make the sense read path (`sensePoint`/`senseGloss`/`effectiveGloss`) reflect drift — so the dictionary/anchor index finally track a word's current point — while retiring the vestigial `sense.point`/`.spread` fields.

**Architecture:** A lexeme's position becomes two clearly-roled id-keyed layers: the **birth point** stays on `lang.lexemes[id].point` (static); the **drift override** stays in `lang.meaningPoints[id]` (sparse, written by `glideMeaningPoint`). `meaningPoints` is routed through the existing S2a satellites seam (`satGet`/`satSet`, mint-free `resolveKey`). `WordSense` gains `lexemeId?: LexemeId` and the three sense accessors become `lang`-aware, reading the current point via `currentPointForId(lang, id) = meaningPoints[id] ?? lexemes[id].point`.

**Tech Stack:** TypeScript, Vitest. Branch `auto/storage-pointnative`, **local commits only — never push/PR**. Determinism is the gate: same config → byte-identical output.

**Critical determinism context (read before starting):**
- The sense-based trio `effectiveGloss`/`senseGloss`/`sensePoint` (in `meaningPoint.ts`) has **no RNG-coupled consumers**. Production consumers are only `anchorIndex.ts` (itself consumed solely by `DictionaryView.tsx` + tests) and `DictionaryView.tsx:81`. The engine's sim path uses the **different** id-native `effectiveGlossFor` from `evolvable.ts` (reads the static birth point) — **DO NOT change `effectiveGlossFor` or any `evolvable.ts` sim-path resolver; that is out of scope and would force a real re-bake.**
- Therefore S4 is **expected to be byte-identical (GEN0 + GENN) on `meaning_layer_baseline`**. The S2b re-bake protocol is authorized as a safety margin: GEN0 byte-identical + reproducibility are mandatory; GENN hashes are edited **only if a preset actually diverges**, and only after root-causing the divergence. Do **not** edit baseline hashes speculatively.
- `meaning_layer_baseline` checks lexicon + word **forms**, which never read the sense-based trio — so even the drift-relabel behavior change is invisible to it.

**Determinism commands (PowerShell on win32; bash equivalent in comments):**
- Fast targeted: `npx vitest run --dir src <file…>`
- Fast baseline canary (~15s, pie fails fast): `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline -t "pie"`  *(bash: `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline -t "pie"`)*
- Full baseline (12 tests, ~9–10 min): `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline`
- Type check: `npx tsc --noEmit`
- **After any RUN_SLOW run in the same PowerShell session, clear the flag** so later fast runs don't accidentally run slow tests: `$env:RUN_SLOW=$null`

> **Long-run safety net (saved preference):** whenever you kick off the full baseline (~10 min) or the full FAST suite, arm a recurring `ScheduleWakeup` (~5 min) and re-arm on each wake until the run returns; stop arming once it reports back.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/engine/lexicon/satellites.ts` | Typed satellite-map seam | Add `meaningPoints: number[]` to `SatelliteTypes` |
| `src/engine/lexicon/store.ts` | Load-time satellite migrator | Add `"meaningPoints"` to `SATELLITE_FIELDS` |
| `src/engine/perMeaningFields.ts` | Per-meaning field registry | Flip `meaningPoints` `keyedBy: "gloss"` → `"lexemeId"` |
| `src/engine/semantics/meaningPoint.ts` | Point accessors | Route `meaningPointFor`/`glideMeaningPoint` through seam; add `currentPointForId`; make `sensePoint`/`senseGloss`/`effectiveGloss` `lang`-aware; delete `senseSpread`/`DEFAULT_SPREAD` |
| `src/engine/types.ts` | `WordSense` type | Add `lexemeId?`; remove `point?`/`spread?` |
| `src/engine/lexicon/word.ts` | Word/sense creation | Thread `lexemeId` into `addSenseToWord`, `addWord`, `syncWordsFromLexicon`; add `backfillSenseLexemeIds` |
| `src/engine/simulation.ts` | `restoreState` rehydration | Call `backfillSenseLexemeIds` for old saves |
| `src/engine/semantics/anchorIndex.ts` | Emergent-gloss index (read-side) | Thread `lang` into `glossOfWord`; pass `lang` to `effectiveGloss` |
| `src/ui/DictionaryView.tsx` | Dictionary UI | Update `glossOfWord(word)` → `glossOfWord(lang, word)` |
| `src/engine/utils/clone.ts` | Deep clone | Drop the `sense.point` clone branch |
| Test files | — | `meaningPoint.test.ts` (sensePoint/senseSpread block), `anchorIndex.test.ts` (lang-thread + drift-relabel lock test), delete `clone_sense_point.test.ts`, new `sense lexemeId round-trip` test |

---

## Task A — `meaningPoints` re-key (gloss → `LexemeId`), byte-identical

**Files:**
- Modify: `src/engine/lexicon/satellites.ts:31` (add to `SatelliteTypes`)
- Modify: `src/engine/semantics/meaningPoint.ts:84-95` (`meaningPointFor`, `glideMeaningPoint`)
- Modify: `src/engine/perMeaningFields.ts:181-186` (`keyedBy`)
- Modify: `src/engine/lexicon/store.ts:84-87` (`SATELLITE_FIELDS`)
- Test (gate, existing): `src/engine/semantics/__tests__/meaningPoint.test.ts`, `drift`, `grounding`, `gapComposition`, `semantic_gap`

This task is a pure re-key with **no behavior change** — `meaningPoints` is reached only via `meaningPointFor`/`glideMeaningPoint`, and no code iterates it by key. No new test; the existing `meaningPoint.test.ts` + the baseline are the gate (byte-identical).

- [ ] **Step 1: Add `meaningPoints` to the satellite type registry**

In `src/engine/lexicon/satellites.ts`, inside the `SatelliteTypes` interface, add a line after `etymology: Meaning[];` (currently line 31):

```ts
  etymology: Meaning[];
  /** S4: glided meaning positions (fixed-point ints as number[]). Sparse drift override. */
  meaningPoints: number[];
```

- [ ] **Step 2: Route `meaningPointFor`/`glideMeaningPoint` through the seam**

In `src/engine/semantics/meaningPoint.ts`, add the seam import near the top (after the existing `import { glossOf } from "./anchors";` on line 13):

```ts
import { satGet, satSet } from "../lexicon/satellites";
```

Replace `meaningPointFor` and `glideMeaningPoint` (lines 84-95) with:

```ts
/** A meaning's CURRENT point: its glided override if any, else the static default. Lang-aware. */
export function meaningPointFor(lang: Language, meaning: Meaning): Vec {
  const o = satGet(lang, "meaningPoints", meaning);
  return o ? Int32Array.from(o) : lexPoint(meaning);
}

/** Nudge `meaning` a fixed 1/GLIDE_DENOM toward `toward`'s current point; record the override. */
export function glideMeaningPoint(lang: Language, meaning: Meaning, toward: Meaning): void {
  const from = meaningPointFor(lang, meaning);
  const target = meaningPointFor(lang, toward);
  const step = roundDivVec(subVecs(target, from), GLIDE_DENOM);
  satSet(lang, "meaningPoints", meaning, Array.from(sumVecs([from, step])));
}
```

(The seam's mint-free `resolveKey` maps a seeded gloss to its existing id; for a gloss with no record/id — e.g. an unlexicalised drift target — it passes the gloss through, exactly as the old direct `lang.meaningPoints[meaning]` did. Read-after-write stays consistent.)

- [ ] **Step 3: Flip the registry `keyedBy` discriminator**

In `src/engine/perMeaningFields.ts`, the `meaningPoints` entry (lines 180-186) currently reads `keyedBy: "gloss"`. Change it to `keyedBy: "lexemeId"`:

```ts
  {
    key: "meaningPoints",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    keyedBy: "lexemeId",
    description: "Track A plan 7 glided meaning positions (S4: LexemeId-keyed)",
  },
```

- [ ] **Step 4: Add `meaningPoints` to the load-time migrator**

In `src/engine/lexicon/store.ts`, the `SATELLITE_FIELDS` array ends (lines 85-87) with `"suppletion", "etymology",`. Add `"meaningPoints"`:

```ts
  "nounDeclensionClass", "ablautClassAssignment", "grammaticalizationStage",
  "suppletion", "etymology", "meaningPoints",
] as const;
```

(The migrator re-keys the outer gloss key → id and carries the value verbatim — correct here, since the value is a point array, not a gloss-valued array.)

- [ ] **Step 5: Type-check and run targeted tests**

Run: `npx tsc --noEmit`
Expected: 0 errors.

Run: `npx vitest run --dir src meaningPoint drift grounding gapComposition semantic_gap`
Expected: all pass (the `meaningPointFor`/`glideMeaningPoint` tests in `meaningPoint.test.ts` still pass — `bareLang()` has no `lexemes`/`lexemeIds`, so glosses pass through unchanged).

- [ ] **Step 6: Run the byte-identical baseline canary, then the full baseline**

Run: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline -t "pie"`
Expected: pie passes (byte-identical).

Run: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline`
Expected: **12/12 pass, byte-identical, no hash edits.** Then clear the flag: `$env:RUN_SLOW=$null`

- [ ] **Step 7: Commit**

```bash
git add src/engine/lexicon/satellites.ts src/engine/semantics/meaningPoint.ts src/engine/perMeaningFields.ts src/engine/lexicon/store.ts
git commit -m "refactor(storage): S4 A — re-key meaningPoints gloss->LexemeId (byte-identical)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B1 — Add `WordSense.lexemeId` (additive, byte-identical)

**Files:**
- Modify: `src/engine/types.ts:1019-1054` (`WordSense`)
- Modify: `src/engine/lexicon/word.ts:352-365` (`addSenseToWord`), `373-436` (`addWord`), `712-722` (`syncWordsFromLexicon` senses), + new `backfillSenseLexemeIds`
- Modify: `src/engine/lexicon/word.ts:1022` (polysemy `addSenseToWord` caller)
- Modify: `src/engine/simulation.ts:508-509` (`restoreState`)
- Modify: `src/engine/__tests__/words_phase21a.test.ts:122-130` (`addSenseToWord` test caller)
- Test (new): `src/engine/__tests__/sense_lexeme_id.test.ts`

The field is written but **not yet read** → byte-identical.

- [ ] **Step 1: Add the optional field to `WordSense`**

In `src/engine/types.ts`, inside `interface WordSense`, add after `meaning: Meaning;` (line 1020):

```ts
  meaning: Meaning;
  /**
   * Storage step 5 (S4): the LexemeId of the lexeme record this sense
   * belongs to — the sense's POINT-NATIVE identity. Optional for
   * back-compat with pre-S4 saves; readers fall back to
   * `idForGloss(lang, meaning)` and `backfillSenseLexemeIds` populates
   * it on load.
   */
  lexemeId?: LexemeId;
```

(`LexemeId` is already imported in `types.ts:2`.)

- [ ] **Step 2: Make `addSenseToWord` `lang`-aware and stamp `lexemeId`**

In `src/engine/lexicon/word.ts`, replace `addSenseToWord` (lines 352-365) with:

```ts
export function addSenseToWord(
  lang: Language,
  word: Word,
  sense: Omit<WordSense, "weight" | "lexemeId"> & { weight?: number },
): void {
  if (word.senses.some((s) => s.meaning === sense.meaning)) return;
  word.senses.push({
    meaning: sense.meaning,
    lexemeId: idForGloss(lang, sense.meaning),
    weight: sense.weight ?? 0.4,
    register: sense.register,
    bornGeneration: sense.bornGeneration,
    origin: sense.origin,
    synonym: sense.synonym,
  });
}
```

- [ ] **Step 3: Update `addWord`'s two sense-creation sites**

In `src/engine/lexicon/word.ts`, in `addWord`: update the `addSenseToWord` call (currently line 405) to pass `lang`:

```ts
    addSenseToWord(lang, existing, {
      meaning,
      weight: opts.weight,
      register: opts.register,
      bornGeneration: opts.bornGeneration,
      origin: opts.origin,
      synonym: opts.synonym,
    });
```

And add `lexemeId` to the fresh-word sense literal (currently lines 418-426):

```ts
    senses: [
      {
        meaning,
        lexemeId: idForGloss(lang, meaning),
        weight: opts.weight ?? 0.4,
        register: opts.register,
        bornGeneration: opts.bornGeneration,
        origin: opts.origin,
        synonym: opts.synonym,
      },
    ],
```

- [ ] **Step 4: Update the polysemy-commit `addSenseToWord` caller**

In `src/engine/lexicon/word.ts`, the call at line 1022 (inside the polysemy-commit function, which has `lang` in scope) becomes:

```ts
  addSenseToWord(lang, existing, {
    meaning,
    weight: opts.weight,
    register: opts.register,
    bornGeneration: opts.bornGeneration,
    origin: opts.origin ?? "polysemy",
  });
```

- [ ] **Step 5: Stamp `lexemeId` in the `syncWordsFromLexicon` rebuild**

In `src/engine/lexicon/word.ts`, in `syncWordsFromLexicon`, the sense `.map` (lines 713-722) gains `lexemeId`:

```ts
    const senses: WordSense[] = meanings.map((meaning) => ({
      meaning,
      lexemeId: idForGloss(lang, meaning),
      weight: satGet(lang, "wordFrequencyHints", meaning) ?? 0.4,
      register: satGet(lang, "registerOf", meaning),
      bornGeneration,
      origin:
        typeof satGet(lang, "wordOrigin", meaning) === "string"
          ? satGet(lang, "wordOrigin", meaning)
          : undefined,
    }));
```

- [ ] **Step 6: Add `backfillSenseLexemeIds` for old saves**

In `src/engine/lexicon/word.ts`, add this exported function (place it just after `syncWordsFromLexicon`, before the `WordMergerEvent` interface near line 745):

```ts
/**
 * S4 back-compat: stamp `lexemeId` onto any persisted sense that predates the
 * field. Idempotent (only fills `undefined`); a gloss with no minted id is left
 * undefined and readers fall back to `idForGloss` lazily.
 */
export function backfillSenseLexemeIds(lang: Language): void {
  if (!lang.words) return;
  for (const w of lang.words) {
    for (const s of w.senses) {
      if (s.lexemeId === undefined) s.lexemeId = idForGloss(lang, s.meaning);
    }
  }
}
```

- [ ] **Step 7: Wire the backfill into `restoreState`**

In `src/engine/simulation.ts`, add `backfillSenseLexemeIds` to the import from `./lexicon/word` (line 41 currently imports `rebuildFormKeyIndex`):

```ts
import { rebuildFormKeyIndex, backfillSenseLexemeIds } from "./lexicon/word";
```

Then in `restoreState`, immediately after `if (lang.words) rebuildFormKeyIndex(lang);` (line 509), add:

```ts
        if (lang.words) rebuildFormKeyIndex(lang);
        backfillSenseLexemeIds(lang);
```

- [ ] **Step 8: Update the `addSenseToWord` test caller**

In `src/engine/__tests__/words_phase21a.test.ts`, the `addSenseToWord(w, {…})` call (around line 127) now needs `lang`. The test builds a sim; pass its `lang`:

```ts
    addSenseToWord(lang, w, {
      meaning: "fire",
      bornGeneration: 0,
    });
```

(Confirm the surrounding test already has a `lang` binding — it constructs a simulation; if the variable is named differently, use that name.)

- [ ] **Step 9: Write the `lexemeId` round-trip test**

Create `src/engine/__tests__/sense_lexeme_id.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { idForGloss } from "../lexicon/access";
import { cloneLanguage } from "../utils/clone";

describe("S4 — WordSense.lexemeId identity", () => {
  it("every sense carries its lexeme's id at seed", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    expect(lang.words!.length).toBeGreaterThan(0);
    for (const w of lang.words!) {
      for (const s of w.senses) {
        expect(s.lexemeId).toBe(idForGloss(lang, s.meaning));
      }
    }
  });

  it("lexemeId survives a deep clone (tree split)", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const clone = cloneLanguage(lang);
    for (let i = 0; i < clone.words!.length; i++) {
      expect(clone.words![i]!.senses[0]!.lexemeId).toBe(lang.words![i]!.senses[0]!.lexemeId);
    }
  });
});
```

(Confirmed exports: `presetEnglish` from `src/engine/presets/english.ts`, `cloneLanguage` from `src/engine/utils/clone.ts`, `idForGloss` from `src/engine/lexicon/access.ts`.)

- [ ] **Step 10: Type-check, test, baseline**

Run: `npx tsc --noEmit` → 0 errors.
Run: `npx vitest run --dir src sense_lexeme_id words_phase21a clone_sense_point` → all pass.
Run: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null` → 12/12 byte-identical.

- [ ] **Step 11: Commit**

```bash
git add src/engine/types.ts src/engine/lexicon/word.ts src/engine/simulation.ts src/engine/__tests__/words_phase21a.test.ts src/engine/__tests__/sense_lexeme_id.test.ts
git commit -m "feat(storage): S4 B1 — WordSense.lexemeId point-native identity (additive)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B2 — Thread `lang`, unify drift (the behavioral change; expected baseline byte-identical)

**Files:**
- Modify: `src/engine/semantics/meaningPoint.ts:38-78` (`sensePoint`, `senseGloss`, `effectiveGloss`; add `currentPointForId`)
- Modify: `src/engine/semantics/anchorIndex.ts:35-69` (thread `lang`)
- Modify: `src/ui/DictionaryView.tsx:81` (`glossOfWord` call)
- Modify: `src/engine/semantics/__tests__/meaningPoint.test.ts:29-44`, `src/engine/semantics/__tests__/emergentGloss.test.ts`, `src/engine/semantics/__tests__/anchorIndex.test.ts`
- Test (new lock): drift-relabel assertion in `anchorIndex.test.ts`

- [ ] **Step 1: Add `currentPointForId` and make the sense accessors `lang`-aware**

In `src/engine/semantics/meaningPoint.ts`, add the imports needed (the file already imports `satGet`/`satSet` from Task A; add `idForGloss` and the `LexemeId` type):

```ts
import { satGet, satSet } from "../lexicon/satellites";
import { idForGloss } from "../lexicon/access";
import type { LexemeId } from "../lexicon/lexemeIdentity";
```

Add `currentPointForId` (place it just below `meaningPointFor`):

```ts
/** A lexeme's CURRENT point: its glided override (meaningPoints[id]) if any, else its birth point. */
export function currentPointForId(lang: Language, id: LexemeId): Vec {
  const o = satGet(lang, "meaningPoints", id);
  if (o) return Int32Array.from(o);
  const rec = lang.lexemes?.[id];
  if (rec) return Int32Array.from(rec.point);
  return lexPoint(id); // degenerate fallback: id with no record — treat key as a bare meaning
}
```

Replace `sensePoint` (lines 38-41) and `senseGloss` (lines 55-57) and `effectiveGloss` (lines 74-78) with `lang`-aware forms:

```ts
/** This sense's CURRENT point — its lexeme's glided override if any, else its birth point. */
export function sensePoint(lang: Language, sense: WordSense): Vec {
  const id = sense.lexemeId ?? idForGloss(lang, sense.meaning);
  return id !== undefined ? currentPointForId(lang, id) : lexPoint(sense.meaning);
}
```

```ts
export function senseGloss(lang: Language, sense: WordSense): Meaning {
  return glossOf(sensePoint(lang, sense));
}
```

```ts
export function effectiveGloss(lang: Language, sense: WordSense): Meaning {
  const id = sense.lexemeId ?? idForGloss(lang, sense.meaning);
  const hasDrift = id !== undefined && satGet(lang, "meaningPoints", id) !== undefined;
  return hasDrift || hasEmbedding(sense.meaning) ? senseGloss(lang, sense) : sense.meaning;
}
```

(GEN0 byte-identity: at gen 0 `meaningPoints` is empty, so `currentPointForId` returns the birth point `lexemes[id].point` === `lexPoint(meaning)`, and `effectiveGloss`'s condition reduces to `hasEmbedding(meaning) ? senseGloss : meaning` — identical to today.)

- [ ] **Step 2: Thread `lang` through `anchorIndex.ts`**

In `src/engine/semantics/anchorIndex.ts`:
- Line 40 (`anchorIndexOf`, has `lang`): `const gloss = effectiveGloss(lang, sense);`
- Replace `glossOfWord` (lines 53-56) to take `lang`:

```ts
/** A word's effective gloss: emergent (nearest anchor) where its point is real/drifted, else its authored key. */
export function glossOfWord(lang: Language, word: Word): Meaning {
  const sense = word.senses[word.primarySenseIndex] ?? word.senses[0]!;
  return effectiveGloss(lang, sense);
}
```

- Line 67 (`findWordByEmergentGloss`, has `lang`): `return sense !== undefined && !sense.synonym && effectiveGloss(lang, sense) === concept;`

- [ ] **Step 3: Update the `DictionaryView` caller**

In `src/ui/DictionaryView.tsx`, line 81 (where `lang` is in scope, used on line 80): change `glossOfWord(word)` to `glossOfWord(lang, word)`:

```tsx
      const emergentGloss = word ? glossOfWord(lang, word) : m;
```

- [ ] **Step 4: Update `meaningPoint.test.ts` sensePoint block to `lang`-aware + drift**

In `src/engine/semantics/__tests__/meaningPoint.test.ts`, the `bareLang()` helper returns a `Language` with no `lexemes`. `sensePoint` now needs `lang`. Replace the `per-lexeme sensePoint / senseSpread` describe block (lines 29-44) with (note `senseSpread`/`DEFAULT_SPREAD` are removed in B3 — leave them out of the imports update until then; here only fix sensePoint):

```ts
describe("meaningPoint — per-lexeme sensePoint", () => {
  const base = { weight: 1, bornGeneration: 0 } as const;
  it("sensePoint falls back to the meaning's static point when nothing has drifted", () => {
    const s: WordSense = { meaning: "water", ...base };
    expect(Array.from(sensePoint(bareLang(), s))).toEqual(Array.from(lexPoint("water")));
  });
  it("sensePoint reflects the drifted point once the meaning has glided", () => {
    const lang = bareLang();
    lang.meaningPoints = { water: Array.from(lexPoint("fire")) };
    const s: WordSense = { meaning: "water", ...base };
    expect(Array.from(sensePoint(lang, s))).toEqual(Array.from(lexPoint("fire")));
  });
});
```

Update the import on line 2 to drop `senseSpread, DEFAULT_SPREAD` (removed in B3) — but since B3 hasn't run yet, keep them imported until B3 if the `senseSpread` describe block still references them. **Simplest:** in B2, keep `senseSpread`/`DEFAULT_SPREAD` import and leave the `senseSpread` test (old line 40-43) intact; only rewrite the sensePoint cases above. B3 removes the senseSpread test + import.

(`bareLang()` has no `lexemes`/`lexemeIds`, so `idForGloss` returns undefined and `sensePoint` resolves via the gloss-key `meaningPoints["water"]` set in the test — exercising the drift path through the seam's gloss passthrough.)

- [ ] **Step 5: Update `emergentGloss.test.ts` to pass `lang`**

In `src/engine/semantics/__tests__/emergentGloss.test.ts`, `senseGloss(s)` calls (lines 38-50) now need `lang`. These tests construct bare senses; add a bare lang. Replace the `senseGloss` calls to pass a minimal lang, e.g. define `const lang = { } as unknown as Language;` in the describe scope and call `senseGloss(lang, s)`. Match the existing test's construction; the assertions (`"water"`, `"fire"`) stay the same because with no `meaningPoints` override `senseGloss` returns `glossOf(birth point)` exactly as before.

- [ ] **Step 6: Add the drift-relabel lock test**

Append to `src/engine/semantics/__tests__/anchorIndex.test.ts` (it already imports `anchorIndexOf`, `glossOfWord`, `findWordByEmergentGloss` and builds a sim `lang`). Add:

```ts
  it("glossOfWord relabels to the drifted nearest-anchor after a glide (S4 unify-drift)", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    // Pick a seeded anchor word and glide its meaning fully onto another anchor.
    const w = lang.words!.find((x) => x.senses[0]!.meaning === "water")!;
    expect(glossOfWord(lang, w)).toBe("water"); // pre-drift: labels to itself
    lang.meaningPoints = { ...(lang.meaningPoints ?? {}) };
    const id = w.senses[0]!.lexemeId!;
    lang.meaningPoints[id] = Array.from(lexPoint("fire")); // hard override onto 'fire' anchor
    expect(glossOfWord(lang, w)).toBe("fire"); // post-drift: relabels via the override
  });
```

(Import `createSimulation` from `../../simulation`, `presetEnglish` from `../../presets/english`, and `lexPoint` from `../meaningPoint` at the top of `anchorIndex.test.ts` if not already present. English seeds both `water` and `fire` as direct GloVe anchors, so the relabel is deterministic; if the find returns undefined, confirm the anchor name against `lang.words` in a scratch run.)

- [ ] **Step 7: Type-check and run targeted tests**

Run: `npx tsc --noEmit` → 0 errors (this surfaces every remaining un-threaded caller — fix any the plan missed by passing `lang`).
Run: `npx vitest run --dir src meaningPoint emergentGloss anchorIndex sense_lexeme_id` → all pass, including the new relabel lock test.

- [ ] **Step 8: Verify GEN0 + GENN byte-identical (the expected outcome)**

Run: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline -t "pie"` → pie byte-identical.
Run (arm a ~5-min wakeup first): `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null`
Expected: **12/12 byte-identical, no hash edits.** If any preset diverges, STOP — do not edit hashes; root-cause first (the most likely cause would be an accidental change to a sim-path resolver like `effectiveGlossFor`, which must be reverted), then re-run. Genuine divergence is handled in Task B4.

- [ ] **Step 9: Commit**

```bash
git add src/engine/semantics/meaningPoint.ts src/engine/semantics/anchorIndex.ts src/ui/DictionaryView.tsx src/engine/semantics/__tests__/meaningPoint.test.ts src/engine/semantics/__tests__/emergentGloss.test.ts src/engine/semantics/__tests__/anchorIndex.test.ts
git commit -m "feat(storage): S4 B2 — unify drift into the sense read path (lang-aware)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B3 — Retire vestigial `sense.point`/`.spread` (byte-identical cleanup)

**Files:**
- Modify: `src/engine/types.ts:1046-1053` (remove `point?`/`spread?`)
- Modify: `src/engine/semantics/meaningPoint.ts:35-46` (remove `DEFAULT_SPREAD`, `senseSpread`)
- Modify: `src/engine/utils/clone.ts:151-154` (drop `point` clone branch)
- Modify: `src/engine/semantics/__tests__/meaningPoint.test.ts` (drop `senseSpread` test + import)
- Delete: `src/engine/__tests__/clone_sense_point.test.ts`

- [ ] **Step 1: Remove the vestigial fields from `WordSense`**

In `src/engine/types.ts`, delete the `point?` and `spread?` members (lines 1046-1053, the two JSDoc-commented optional fields at the end of `WordSense`). The interface now ends with `synonym?: boolean;` plus the `lexemeId?` added in B1.

- [ ] **Step 2: Remove `DEFAULT_SPREAD` and `senseSpread`**

In `src/engine/semantics/meaningPoint.ts`, delete `export const DEFAULT_SPREAD = 1;` (line 36) and the entire `senseSpread` function (lines 43-46). Nothing in production references them (verified).

- [ ] **Step 3: Drop the `sense.point` clone branch**

In `src/engine/utils/clone.ts`, the sense map (lines 151-154) becomes a plain spread (which still copies `lexemeId`):

```ts
          senses: w.senses.map((s) => ({ ...s })),
```

- [ ] **Step 4: Remove the `senseSpread` test and stale import**

In `src/engine/semantics/__tests__/meaningPoint.test.ts`:
- Update the import on line 2 to drop `senseSpread, DEFAULT_SPREAD`:

```ts
import { lexPoint, sensePoint, meaningPointFor, glideMeaningPoint, GLIDE_DENOM } from "../meaningPoint";
```

- Delete the `senseSpread` `it(...)` block (the old lines 40-43) left over from B2.

- [ ] **Step 5: Delete the obsolete clone test**

The test `src/engine/__tests__/clone_sense_point.test.ts` exercises `sense.point` clone independence — a now-deleted field. Remove it:

```bash
git rm src/engine/__tests__/clone_sense_point.test.ts
```

(The `lexemeId`-survives-clone case in `sense_lexeme_id.test.ts` replaces its useful coverage.)

- [ ] **Step 6: Type-check, test, baseline**

Run: `npx tsc --noEmit` → 0 errors (a leftover `sense.point`/`senseSpread` reference anywhere will surface here).
Run: `npx vitest run --dir src meaningPoint sense_lexeme_id clone` → all pass.
Run: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null` → 12/12 byte-identical.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/semantics/meaningPoint.ts src/engine/utils/clone.ts src/engine/semantics/__tests__/meaningPoint.test.ts
git rm src/engine/__tests__/clone_sense_point.test.ts
git commit -m "refactor(storage): S4 B3 — retire vestigial sense.point/.spread

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B4 — Final determinism verification (expect byte-identical; re-bake only if forced)

**Files:**
- Possibly modify (only on genuine divergence): `src/engine/__tests__/meaning_layer_baseline.test.ts` (GENN expected hashes)
- Modify: `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md` (ledger), memory files

- [ ] **Step 1: Full FAST suite**

Arm a ~5-min `ScheduleWakeup` safety net (re-arm on each wake). Run the full fast suite:

Run: `npx vitest run --dir src`
Expected: green (no new failures vs. the pre-S4 baseline count). Investigate any failure before proceeding.

- [ ] **Step 2: Full RUN_SLOW baseline + reproducibility (run twice)**

Run: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline`
Run again: `$env:RUN_SLOW="1"; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null`
Expected: **both runs 12/12, byte-identical, identical to pre-S4 — no hash edits.** Identical across the two runs = reproducible.

- [ ] **Step 3: ONLY if a preset genuinely diverged**

Do not reach this step unless Step 2 shows a real divergence whose root cause is an *intended* S4 behavior change (not an accidental sim-path edit). If so:
1. Confirm reproducibility (the two runs in Step 2 agree with each other).
2. Update only the diverged presets' GENN expected hashes in `meaning_layer_baseline.test.ts` to the new reproduced values.
3. Re-run the full baseline → 12/12 green with the new hashes.
4. Record exactly which presets re-baked and the old→new hashes in the ledger (Step 4).

- [ ] **Step 4: Update the ledger and memory**

In `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md`, add an S4-DONE entry under the sub-project list (mirroring the S3 entry style): note the commit chain (A → B1 → B2 → B3), that `meaningPoints` is now LexemeId-keyed, `WordSense` is point-native via `lexemeId`, the sense read path unifies drift, vestigial `sense.point`/`.spread` retired, and the determinism outcome (byte-identical, or the re-baked presets). Change "Sub-projects 4-6 REMAIN" → "Sub-projects 5-6 REMAIN" and note **S5 NEXT**.

Update the memory file `vector-native-lexicon-flip-active.md` (S4 → DONE; S5 NEXT) and its `MEMORY.md` index line. (The controller does this, not a subagent.)

- [ ] **Step 5: Commit the ledger/docs**

```bash
git add docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md
# include meaning_layer_baseline.test.ts ONLY if Step 3 re-baked
git commit -m "docs(storage): mark storage step-5 sub-project S4 DONE

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (run against the spec)

**Spec coverage:**
- §1 two-layer point model → `currentPointForId` (B2 Step 1), birth point untouched on the record, drift override id-keyed (Task A). ✓
- §2 Half A re-key (4 changes: SatelliteTypes, accessors, registry keyedBy, SATELLITE_FIELDS) → Task A Steps 1-4. ✓
- §3.1 `WordSense.lexemeId` + 3 creation sites + backfill → Task B1. ✓
- §3.2 lang-aware `sensePoint`/`senseGloss`/`effectiveGloss` + `currentPointForId` + anchorIndex callers + DictionaryView → Task B2. ✓
- §3.3 retire vestigial fields → Task B3. ✓
- §4 determinism (GEN0 byte-identical, reproducibility, re-bake only diverged presets) + lock tests (drift-relabel B2 Step 6; lexemeId round-trip B1 Step 9) → covered. ✓
- §5 batch decomposition A/B1/B2/B3/B4 + final gate → matches Tasks. ✓

**Placeholder scan:** The only deferred-to-runtime items are (a) the exact preset names in the drift-relabel test (the engineer verifies which anchors tokipona seeds) and (b) whether B4 Step 3 fires — both are genuine "verify against the running code" instructions with a concrete fallback, not vague placeholders. No "TBD/handle edge cases/add validation" remain.

**Type consistency:** `addSenseToWord(lang, word, sense)` (new 3-arg form) is used consistently in B1 Steps 2-4 and 8. `currentPointForId(lang, id)`, `sensePoint(lang, sense)`, `senseGloss(lang, sense)`, `effectiveGloss(lang, sense)`, `glossOfWord(lang, word)` signatures match between definition (B2 Step 1-2) and all call sites (B2 Steps 2-6, B1, DictionaryView). `satGet(lang, "meaningPoints", key)` / `satSet(...)` match the `SatelliteTypes.meaningPoints: number[]` added in Task A. ✓
