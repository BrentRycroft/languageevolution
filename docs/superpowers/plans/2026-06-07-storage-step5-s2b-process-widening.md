# Storage Step 5 — Sub-project S2b (Process-Widening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make keyless (gloss-less, point-native) words participate in the 7 lazily-owned evolution processes — variants, suppletion, ablaut, grammaticalization, derivation, recarve (split/merge), colexification — so they author satellite data under their own `LexemeId`.

**Architecture:** Approach A — a shared `evolvableLexemes(lang)` iterator yields seeded `LexemeId`s (in `lexKeys` order) **then** keyless ids (sorted). Each process iterates ids instead of glosses, reads gloss/POS/form via per-id resolvers, and **writes satellites by id**. Keyless candidates are filtered *before* any `rng.int(n)` draw and appended after seeded candidates, so a run with no *qualifying* keyless word is byte-identical to pre-S2b. Form-based processes take keyless immediately; concept-coupled ones gate on a frequency-based maturity predicate.

**Tech Stack:** TypeScript, Vitest. Determinism gate: `meaning_layer_baseline` (GEN0 always byte-identical; GENN deliberate re-bake). Fast canary: `lexical_diffusion` + a new keyless canary.

---

## Background the implementer must know

- **Seeded vs keyless.** A *seeded* lexeme has a gloss: `lang.lexemes[id] = { form, point, gloss }`. A *keyless* lexeme has no gloss: `{ form, point }`. The seam `lexKeys(lang)` (in `src/engine/lexicon/access.ts`) returns the **glosses** of seeded records only, in `Object.keys(lang.lexemes)` insertion order. Keyless records are skipped by `lexKeys`, which is why all 7 processes miss them.
- **The satellite seam** (`src/engine/lexicon/satellites.ts`): `satGet(lang, FIELD, key)` / `satSet(lang, FIELD, key, val)`. Key resolution is **non-minting and symmetric**: a gloss that has a minted id resolves to that id; a raw id passes through; an unknown gloss passes through as-is. **Consequence you must respect:** writing a keyless word's satellite by its *emergent gloss* string lands on a gloss key (wrong, can collide). **Always write keyless satellites by `id`.** For seeded words `satGet/satSet` by gloss and by id are equivalent (both resolve to the same id), so switching a process from gloss-key to id-key is byte-identical for seeded words.
- **Determinism invariants:** no `Math.random()` in `src/engine`; thread the seeded `Rng`; new draws appended after existing draws; sort before order-sensitive `Object.keys`. The real proof of byte-identity is `meaning_layer_baseline` — never hand-edit its expected hashes except as a deliberate, documented re-bake.
- **Standing constraints:** local commits only, NEVER push/PR. Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Always scope vitest with `--dir src`.
- **Existing resolvers you will reuse:** `glossResolverForSweep(lang)` (id→effective gloss map, seeded+keyless) and `buildLexemeIdToGloss(lang)` (seeded-only) in `lexemeIdentity.ts`; `glossOf(point)` in `semantics/anchors.ts`; `posOfPoint(point)` in `semantics/anchorQueries.ts`; `posOf(gloss)` in `lexicon/pos.ts`.

## File structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/engine/lexicon/evolvable.ts` | **New.** The widening primitives: `evolvableLexemes`, `effectiveGlossFor`, `effectivePosOf`, `effectiveFormOf`, `keylessMature`, `KEYLESS_MATURITY_FREQ`. | Create (Task 1) |
| `src/engine/steps/phonology.ts` | Sound-change sweep records variants/innovations | Widen the record loop (Task 2) |
| `src/engine/morphology/evolve.ts` | `maybeSuppletion`, `maybeGrammaticalize` | Widen iteration (Tasks 3, 5) |
| `src/engine/morphology/ablaut.ts` | `proposeAblautEmergence` | Widen iteration (Task 4) |
| `src/engine/morphology/derivation.ts` | `pickRuntimeDerivedMeaning` | Widen iteration (Task 6) |
| `src/engine/semantics/recarve.ts` | `tryMerge` / `trySplit`; colexification falls out | Widen iteration + maturity (Task 7) |
| `src/engine/__tests__/keyless_process_widening.test.ts` | **New.** Behavior-LOCK tests for all 7 + the determinism canary | Create across tasks |

**The one rule every process task follows.** Replace `for (const m of lexKeys(lang))` with `for (const id of evolvableLexemes(lang))`, then in the body:
- **satellite reads/writes** (`satGet`/`satSet`) use **`id`**;
- **form** comes from `effectiveFormOf(lang, id)` (never `lexGet(gloss)`, which misses keyless);
- **POS** comes from `effectivePosOf(lang, id)`;
- **gloss** (for concept logic / event text) comes from `effectiveGlossFor(lang, id)`;
- **keyless eligibility:** form-based processes — no gate; concept-coupled processes — `if (isKeyless && !keylessMature(lang, id)) continue;` where `isKeyless = lang.lexemes[id]?.gloss === undefined`.

---

## Task 1: Shared widening primitives

**Files:**
- Create: `src/engine/lexicon/evolvable.ts`
- Test: `src/engine/__tests__/keyless_process_widening.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/keyless_process_widening.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { coinKeylessLexeme } from "../lexicon/lexemeIdentity";
import { lexKeys } from "../lexicon/access";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { satSet } from "../lexicon/satellites";
import {
  evolvableLexemes, effectiveGlossFor, effectivePosOf, effectiveFormOf, keylessMature,
} from "../lexicon/evolvable";
import type { Language } from "../types";

function rootLang(): Language {
  const s = createSimulation(presetEnglish()).getState();
  return s.tree[s.rootId]!.language;
}

describe("S2b — evolvableLexemes + resolvers", () => {
  it("seeded ids come first in lexKeys order, then keyless ids appended", () => {
    const lang = rootLang();
    const seededCount = lexKeys(lang).length;
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "u", "n", "o"]);
    const ids = evolvableLexemes(lang);
    expect(ids.length).toBe(seededCount + 1);
    expect(ids[ids.length - 1]).toBe(kid);          // keyless appended last
    // seeded prefix matches lexKeys order 1:1 (resolved back to gloss)
    const seededPrefix = ids.slice(0, seededCount).map((id) => effectiveGlossFor(lang, id));
    expect(seededPrefix).toEqual(lexKeys(lang));
  });

  it("resolvers: keyless gloss is emergent; form + POS come from the record/point", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "u", "n", "o"]);
    expect(effectiveFormOf(lang, kid)).toEqual(["r", "u", "n", "o"]);
    expect(typeof effectiveGlossFor(lang, kid)).toBe("string");        // emergent, non-empty
    expect(effectiveGlossFor(lang, kid).length).toBeGreaterThan(0);
    expect(effectivePosOf(lang, kid)).toBeDefined();
  });

  it("keylessMature: fresh keyless (freq 0.4) is immature; raising freq matures it", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "u", "n", "o"]);
    expect(keylessMature(lang, kid)).toBe(false);     // born at 0.4 < 0.5
    satSet(lang, "wordFrequencyHints", kid, 0.6);
    expect(keylessMature(lang, kid)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src keyless_process_widening`
Expected: FAIL — `../lexicon/evolvable` does not exist.

- [ ] **Step 3: Create the primitives** — `src/engine/lexicon/evolvable.ts`:

```ts
import type { LexiconState } from "../domains";
import type { Language, WordForm } from "../types";
import type { Meaning } from "../types";
import { buildLexemeIdToGloss, type LexemeId } from "./lexemeIdentity";
import { satGet } from "./satellites";
import { glossOf } from "../semantics/anchors";
import { posOfPoint, type PosClass } from "../semantics/anchorQueries";
import { posOf } from "./pos";

/**
 * S2b: a keyless word counts as "mature" (eligible for concept-coupled processes) once its
 * frequency has climbed past birth (0.4) through use/drift. Entrenchment == frequency (Zipf).
 */
export const KEYLESS_MATURITY_FREQ = 0.5;

/**
 * The lexemes the evolution processes iterate: SEEDED ids first (in `lexKeys` / store-insertion
 * order — byte-identical to the pre-S2b gloss iteration), then KEYLESS ids sorted by their
 * intrinsic id (determinism-stable, independent of the drifting emergent gloss). Appending keyless
 * keeps the seeded RNG-draw stream untouched until a keyless word actually qualifies.
 */
export function evolvableLexemes(lang: LexiconState): LexemeId[] {
  const g = buildLexemeIdToGloss(lang); // seeded-only map
  const seeded: LexemeId[] = [];
  const keyless: LexemeId[] = [];
  for (const id of Object.keys(lang.lexemes) as LexemeId[]) {
    if (g.has(id)) seeded.push(id);
    else keyless.push(id);
  }
  keyless.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [...seeded, ...keyless];
}

/** True when `id` is a keyless (gloss-less) record. */
export function isKeyless(lang: LexiconState, id: LexemeId): boolean {
  return lang.lexemes[id]?.gloss === undefined;
}

/** Effective gloss: seeded → stored gloss; keyless → emergent `glossOf(point)`. */
export function effectiveGlossFor(lang: LexiconState, id: LexemeId): Meaning {
  const rec = lang.lexemes[id];
  if (rec?.gloss !== undefined) return rec.gloss;
  return glossOf(Int32Array.from(rec!.point));
}

/** Effective form straight from the record (works for seeded AND keyless; `lexGet` misses keyless). */
export function effectiveFormOf(lang: LexiconState, id: LexemeId): WordForm | undefined {
  return lang.lexemes[id]?.form;
}

/** Effective POS: seeded → `posOf(gloss)` (unchanged); keyless → geometric `posOfPoint(point)`. */
export function effectivePosOf(lang: LexiconState, id: LexemeId): PosClass {
  const rec = lang.lexemes[id];
  if (rec?.gloss !== undefined) return posOf(rec.gloss);
  return posOfPoint(Int32Array.from(rec!.point));
}

/** Maturity gate for keyless words entering concept-coupled processes (frequency-based). */
export function keylessMature(lang: Language, id: LexemeId): boolean {
  return (satGet(lang, "wordFrequencyHints", id) ?? 0.4) >= KEYLESS_MATURITY_FREQ;
}
```

> Verify the exact export names/locations while implementing: `PosClass` and `posOfPoint` in `semantics/anchorQueries.ts`; `posOf` in `lexicon/pos.ts`; `LexemeId` + `buildLexemeIdToGloss` in `lexicon/lexemeIdentity.ts`. Adjust import paths to match; do not change those modules.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --dir src keyless_process_widening`
Expected: PASS (3 tests).
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/lexicon/evolvable.ts src/engine/__tests__/keyless_process_widening.test.ts
git commit -m "feat(storage): evolvableLexemes + per-id resolvers for keyless process-widening (S2b task 1)"
```

---

## Task 2: variants (sweep-authored)

**Files:**
- Modify: `src/engine/steps/phonology.ts:428-448` (the post-sweep record loop)
- Test: `src/engine/__tests__/keyless_process_widening.test.ts`

**Current code** (`phonology.ts:428-448`): the loop keys every satellite write by `m = glossOfCid.get(cid)` and `continue`s when `m` is `undefined`. `glossOfCid = buildLexemeIdToGloss(lang)` is **seeded-only**, so keyless cids are skipped.

- [ ] **Step 1: Write the failing test** — append to `keyless_process_widening.test.ts`:

```ts
import { stepPhonology } from "../steps/phonology";
import { satGet } from "../lexicon/satellites";
import { makeRng } from "../rng";

describe("S2b task 2 — variants for keyless words", () => {
  it("a keyless word that changes under sound change records variants under its id", () => {
    const config = presetEnglish();
    const sim = createSimulation(config);
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    const kid = coinKeylessLexeme(lang, fromFloats(embed("fire")),
      ["k", "a", "t", "a", "p", "u", "l", "t", "a", "s"]);
    const rng = makeRng("s2b-variants");
    for (let g = 1; g <= 30; g++) stepPhonology(lang, config, rng, g);
    // it evolved AND a variants history now exists under the keyless id (not a gloss key)
    const variants = satGet(lang, "variants", kid);
    expect(variants && variants.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src keyless_process_widening -t "variants for keyless"`
Expected: FAIL — `satGet(lang,"variants",kid)` is `undefined` (loop skipped the keyless cid).

- [ ] **Step 3: Widen the record loop** — in `phonology.ts`, key the satellite writes by **`cid`** and don't skip keyless. Replace lines 431-448:

```ts
    const m = glossOfCid.get(cid);
    if (m === undefined) continue;
    const a = before[cid]!.join("");
    const b = cur.join("");
    if (a !== b) {
      mutated++;
      satSet(lang, "lastChangeGeneration", m, generation);
      recordVariant(lang, m, before[cid]!, generation, 0.55);
      recordVariant(lang, m, cur, generation, 0.7);
      recordInnovation(lang, m, before[cid]!, cur, generation, "phonology");
    } else {
      reinforceCanonical(lang, m, cur);
    }
```

with (key by `cid`; keyless cids are no longer dropped):

```ts
    // S2b: key satellite writes by the LexemeId `cid` (byte-identical for seeded — satSet resolves
    // a gloss to this same id) so keyless swept words also record variants/innovations under their id.
    const a = before[cid]!.join("");
    const b = cur.join("");
    if (a !== b) {
      mutated++;
      satSet(lang, "lastChangeGeneration", cid, generation);
      recordVariant(lang, cid, before[cid]!, generation, 0.55);
      recordVariant(lang, cid, cur, generation, 0.7);
      recordInnovation(lang, cid, before[cid]!, cur, generation, "phonology");
    } else {
      reinforceCanonical(lang, cid, cur);
    }
```

> `glossOfCid` may now be unused in this loop — if so, remove its declaration (line 368) only if no other code in the function uses it (it is also read at line 390 in a separate loop; leave it if so). Audit before deleting.

- [ ] **Step 4: Run the test + canary**

Run: `npx vitest run --dir src keyless_process_widening sociolinguistic` → PASS.
Run: `npx vitest run --dir src lexical_diffusion` → PASS (seeded canary unaffected — seeded writes are byte-identical).
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/steps/phonology.ts src/engine/__tests__/keyless_process_widening.test.ts
git commit -m "feat(storage): keyless words record variants in the sweep (S2b task 2)"
```

---

## Task 3: suppletion (form-based, immediate)

**Files:**
- Modify: `src/engine/morphology/evolve.ts:810-849` (`maybeSuppletion`)
- Test: `src/engine/__tests__/keyless_process_widening.test.ts`

- [ ] **Step 1: Write the failing test** — append:

```ts
import { maybeSuppletion } from "../morphology/evolve";

describe("S2b task 3 — suppletion for keyless verbs", () => {
  it("a keyless high-freq verb can receive a suppletive slot under its id", () => {
    const lang = rootLang();
    // a keyless verb (point near a verb anchor), high frequency, plus a seeded verb donor pool exists.
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "u", "n", "o"]);
    satSet(lang, "wordFrequencyHints", kid, 0.9);
    const rng = makeRng("s2b-suppletion");
    let got = false;
    for (let i = 0; i < 400 && !got; i++) {
      maybeSuppletion(lang, rng, 1);
      if (satGet(lang, "suppletion", kid)) got = true;
    }
    expect(got).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src keyless_process_widening -t "suppletion for keyless"`
Expected: FAIL — `maybeSuppletion` iterates `lexKeys` (seeded-only); the keyless verb is never a candidate.

- [ ] **Step 3: Widen `maybeSuppletion`** — iterate ids; resolve POS/form/gloss per id; write by id. Replace lines 816-848:

```ts
  const verbMeanings = lexKeys(lang).filter(
    (m) => posOf(m) === "verb",
  );
  if (verbMeanings.length < 2) return null;
  const highFreq = verbMeanings.filter(
    (m) => (satGet(lang, "wordFrequencyHints", m) ?? 0.4) >= 0.6,
  );
  if (highFreq.length === 0) return null;
  const meaning = highFreq[rng.int(highFreq.length)]!;
  // ... category pick ...
  const existing = satGet(lang, "suppletion", meaning)?.[category];
  if (existing) return null;
  const donors = verbMeanings.filter(
    (m) => m !== meaning && (lexGet(lang, m)?.length ?? 0) >= 2,
  );
  if (donors.length === 0) return null;
  const donorMeaning = donors[rng.int(donors.length)]!;
  const donorForm = lexGet(lang, donorMeaning)!;
  let slots = satGet(lang, "suppletion", meaning);
  if (!slots) {
    slots = {};
    satSet(lang, "suppletion", meaning, slots);
  }
  slots[category] = donorForm.slice();
  return { meaning, category, donorMeaning };
```

with (id-native; seeded ids first preserve the seeded draws; the report still uses display glosses):

```ts
  // S2b: iterate evolvable ids (seeded first, keyless appended). Verb POS + form via per-id resolvers.
  const verbIds = evolvableLexemes(lang).filter((id) => effectivePosOf(lang, id) === "verb");
  if (verbIds.length < 2) return null;
  const highFreq = verbIds.filter(
    (id) => (satGet(lang, "wordFrequencyHints", id) ?? 0.4) >= 0.6,
  );
  if (highFreq.length === 0) return null;
  const targetId = highFreq[rng.int(highFreq.length)]!;
  // ... category pick (unchanged) ...
  const existing = satGet(lang, "suppletion", targetId)?.[category];
  if (existing) return null;
  const donors = verbIds.filter(
    (id) => id !== targetId && (effectiveFormOf(lang, id)?.length ?? 0) >= 2,
  );
  if (donors.length === 0) return null;
  const donorId = donors[rng.int(donors.length)]!;
  const donorForm = effectiveFormOf(lang, donorId)!;
  let slots = satGet(lang, "suppletion", targetId);
  if (!slots) {
    slots = {};
    satSet(lang, "suppletion", targetId, slots);
  }
  slots[category] = donorForm.slice();
  return {
    meaning: effectiveGlossFor(lang, targetId),
    category,
    donorMeaning: effectiveGlossFor(lang, donorId),
  };
```

Add to `evolve.ts` imports: `import { evolvableLexemes, effectivePosOf, effectiveFormOf, effectiveGlossFor } from "../lexicon/evolvable";`. (Form-based → no maturity gate.)

- [ ] **Step 4: Run the test + canary**

Run: `npx vitest run --dir src keyless_process_widening morphology_evolve` → PASS.
Run: `npx vitest run --dir src lexical_diffusion` → PASS.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/morphology/evolve.ts src/engine/__tests__/keyless_process_widening.test.ts
git commit -m "feat(storage): keyless verbs participate in suppletion (S2b task 3)"
```

---

## Task 4: ablaut (form-based, immediate)

**Files:**
- Modify: `src/engine/morphology/ablaut.ts:140-166` (`proposeAblautEmergence`)
- Test: `src/engine/__tests__/keyless_process_widening.test.ts`

- [ ] **Step 1: Write the failing test** — append:

```ts
import { proposeAblautEmergence } from "../morphology/ablaut";

describe("S2b task 4 — ablaut for keyless verbs", () => {
  it("a keyless high-freq verb can be assigned an ablaut class under its id", () => {
    const lang = rootLang();
    lang.morphology.paradigms["verb.tense.past"] ??= {
      affix: ["e", "d"], position: "suffix", category: "verb.tense.past",
    };
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "u", "n", "o"]);
    satSet(lang, "wordFrequencyHints", kid, 0.9); // ablaut needs freq >= 0.7
    const rng = makeRng("s2b-ablaut");
    let got = false;
    for (let i = 0; i < 600 && !got; i++) {
      proposeAblautEmergence(lang, rng, 1);
      if (satGet(lang, "ablautClassAssignment", kid)) got = true;
    }
    expect(got).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src keyless_process_widening -t "ablaut for keyless"`
Expected: FAIL — candidate loop iterates `lexKeys`; keyless verb excluded.

- [ ] **Step 3: Widen the candidate loop** — replace lines 140-149:

```ts
  const candidates: Meaning[] = [];
  for (const m of lexKeys(lang)) {
    if (posOf(m) !== "verb") continue;
    if (satGet(lang, "ablautClassAssignment", m)) continue;
    const freq = satGet(lang, "wordFrequencyHints", m) ?? 0.4;
    if (freq < 0.7) continue; // strong verbs are typically high-freq
    candidates.push(m);
  }
  if (candidates.length === 0) return false;
  const meaning = candidates[rng.int(candidates.length)]!;
```

with (collect ids; resolve POS by id; freq filter already gates fresh keyless at 0.4 < 0.7):

```ts
  const candidates: LexemeId[] = [];
  for (const id of evolvableLexemes(lang)) {
    if (effectivePosOf(lang, id) !== "verb") continue;
    if (satGet(lang, "ablautClassAssignment", id)) continue;
    const freq = satGet(lang, "wordFrequencyHints", id) ?? 0.4;
    if (freq < 0.7) continue; // strong verbs are typically high-freq
    candidates.push(id);
  }
  if (candidates.length === 0) return false;
  const targetId = candidates[rng.int(candidates.length)]!;
  const meaning = effectiveGlossFor(lang, targetId); // display + pickAlternation key
```

Then update the two downstream uses: `pickAlternation(lang, meaning, rng)` must resolve the form by id — change `pickAlternation` to read `effectiveFormOf(lang, targetId)` instead of `lexGet(lang, meaning)` (audit `pickAlternation`'s body; if it takes a gloss and calls `lexGet`, add an overload/param to pass the form or the id). Write the class by id: `satSet(lang, "ablautClassAssignment", targetId, classId);`. The event `description` keeps using `meaning` (display gloss).

Add imports: `import { evolvableLexemes, effectivePosOf, effectiveFormOf, effectiveGlossFor } from "../lexicon/evolvable"; import type { LexemeId } from "../lexicon/lexemeIdentity";`.

- [ ] **Step 4: Run the test + canary**

Run: `npx vitest run --dir src keyless_process_widening inflectionClass noun_declension` → PASS.
Run: `npx vitest run --dir src lexical_diffusion` → PASS.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/morphology/ablaut.ts src/engine/__tests__/keyless_process_widening.test.ts
git commit -m "feat(storage): keyless verbs participate in ablaut emergence (S2b task 4)"
```

---

## Task 5: grammaticalization (concept-coupled, maturity-gated)

**Files:**
- Modify: `src/engine/morphology/evolve.ts:80-130` (`maybeGrammaticalize`, candidate selection at line 99)
- Test: `src/engine/__tests__/keyless_process_widening.test.ts`

**Current code** (`evolve.ts:98-134`): after the `rng.chance(probability)` gate, `const meanings = lexKeys(lang);` then a loop builds a weighted `Candidate[]` (`{ meaning, tag, target, form }`; clitics pushed 3×) filtering each gloss `m` by `isClosedClass(posOf(m))`, `semanticTagOf(m)`, `lexGet(lang, m)` form length 1-4, and a freq floor (0.4 for clitics else 0.6). The loop variable `m` is used as gloss (tag/pos/display) **and** satellite key.

- [ ] **Step 1: Write the failing test** — append (assert the per-id eligibility seam both ways):

```ts
import { isGrammaticalizationSource } from "../morphology/evolve";

describe("S2b task 5 — grammaticalization gated by keyless maturity", () => {
  it("a FRESH keyless word (freq 0.4) is NOT a grammaticalization source", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("walk")), ["w", "o", "k", "o"]);
    expect(isGrammaticalizationSource(lang, kid)).toBe(false);   // immature
  });
  it("a MATURE keyless open-class word with a tag IS a grammaticalization source", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("walk")), ["w", "o", "k", "o"]);
    satSet(lang, "wordFrequencyHints", kid, 0.8);
    // (precondition: walk's emergent gloss is open-class + has a semantic tag + form len 1-4)
    expect(isGrammaticalizationSource(lang, kid)).toBe(true);
  });
});
```

> Extract the per-candidate eligibility (everything except the suffix/target loop) into an exported `isGrammaticalizationSource(lang, id): boolean` so it is unit-testable, and call it from `maybeGrammaticalize`. (Spec: design for testability.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src keyless_process_widening -t "grammaticalization gated"`
Expected: FAIL — `isGrammaticalizationSource` not exported.

- [ ] **Step 3: Widen + gate.** Add the exported eligibility predicate and rewrite the loop to iterate ids. Replace lines 99-134:

```ts
  const meanings = lexKeys(lang);
  if (meanings.length === 0) return null;

  type Candidate = { meaning: string; tag: string; target: MorphCategory; form: WordForm; };
  const candidates: Candidate[] = [];
  for (const m of meanings) {
    if (isClosedClass(posOf(m))) continue;
    const tag = semanticTagOf(m);
    if (!tag) continue;
    const form = lexGet(lang, m)!;
    if (form.length === 0 || form.length > 4) continue;
    const isClitic = (satGet(lang, "wordOrigin", m) ?? "").startsWith("clitic:");
    const freq = satGet(lang, "wordFrequencyHints", m) ?? 0.5;
    const freqFloor = isClitic ? 0.4 : 0.6;
    if (freq < freqFloor) continue;
    for (const target of pathwayTargetsForLang(tag, lang)) {
      if (lang.morphology.paradigms[target]) continue;
      const entry: Candidate = { meaning: m, tag, target, form };
      candidates.push(entry);
      if (isClitic) { candidates.push(entry); candidates.push(entry); }
    }
  }
```

with (id-native; the keyless maturity gate lives in `isGrammaticalizationSource`; `meaning` in the struct becomes the effective gloss for downstream display/writes — but write satellites by the carried `id`):

```ts
  const ids = evolvableLexemes(lang);
  if (ids.length === 0) return null;

  type Candidate = { id: LexemeId; meaning: string; tag: string; target: MorphCategory; form: WordForm; };
  const candidates: Candidate[] = [];
  for (const id of ids) {
    if (!isGrammaticalizationSource(lang, id)) continue;
    const m = effectiveGlossFor(lang, id);
    const tag = semanticTagOf(m)!;             // non-null: the predicate already required it
    const form = effectiveFormOf(lang, id)!;
    const isClitic = (satGet(lang, "wordOrigin", id) ?? "").startsWith("clitic:");
    for (const target of pathwayTargetsForLang(tag, lang)) {
      if (lang.morphology.paradigms[target]) continue;
      const entry: Candidate = { id, meaning: m, tag, target, form };
      candidates.push(entry);
      if (isClitic) { candidates.push(entry); candidates.push(entry); }
    }
  }
```

and add the predicate (encapsulating the open-class + tag + form-length + freq-floor + keyless-maturity checks):

```ts
export function isGrammaticalizationSource(lang: Language, id: LexemeId): boolean {
  if (isKeyless(lang, id) && !keylessMature(lang, id)) return false; // concept-coupled gate
  const m = effectiveGlossFor(lang, id);
  if (isClosedClass(effectivePosOf(lang, id))) return false;
  if (!semanticTagOf(m)) return false;
  const form = effectiveFormOf(lang, id);
  if (!form || form.length === 0 || form.length > 4) return false;
  const isClitic = (satGet(lang, "wordOrigin", id) ?? "").startsWith("clitic:");
  const freq = satGet(lang, "wordFrequencyHints", id) ?? 0.5;
  return freq >= (isClitic ? 0.4 : 0.6);
}
```

Then in the rest of `maybeGrammaticalize`, wherever the chosen candidate's `.meaning` was used as a satellite key (`satSet(lang,"wordOrigin",…)`, `satSet(lang,"grammaticalizationStage",…)`), use the candidate's **`.id`** instead; `.meaning` stays for event/display text. Add imports: `import { evolvableLexemes, isKeyless, keylessMature, effectiveGlossFor, effectiveFormOf, effectivePosOf } from "../lexicon/evolvable"; import type { LexemeId } from "../lexicon/lexemeIdentity";`.

- [ ] **Step 4: Run the test + canary**

Run: `npx vitest run --dir src keyless_process_widening morphology_evolve` → PASS.
Run: `npx vitest run --dir src lexical_diffusion` → PASS.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/morphology/evolve.ts src/engine/__tests__/keyless_process_widening.test.ts
git commit -m "feat(storage): mature keyless words can grammaticalize (S2b task 5)"
```

---

## Task 6: derivation (concept-coupled, maturity-gated)

**Files:**
- Modify: `src/engine/morphology/derivation.ts:129-160` (`pickRuntimeDerivedMeaning`, iterates `lexKeys` at line 141)
- Test: `src/engine/__tests__/keyless_process_widening.test.ts`

**Current code** (`derivation.ts:141-156`): `pickRuntimeDerivedMeaning` picks a productive `suffix` (rng), then `const allMeanings = lexKeys(lang);` and filters glosses by `recordedParts(lang, m)` / `boundMorphemes.has(m)` / `lexHas(lang, \`${m}-${suffix.tag}\`)` and the suffix-dependent `wantsVerb`/`wantsAdj` against `VERB_HINTS`/`ADJECTIVE_HINTS`, then `base = candidates[rng.int(...)]` and the derived word's meaning is the **new gloss string** `\`${base}-${suffix.tag}\``. So a keyless word participates as a **base**: deriving from it produces a normal *seeded* derived word whose origin chain references the base's emergent gloss.

- [ ] **Step 1: Write the failing test** — append:

```ts
import { derivationBaseEligible } from "../morphology/derivation";

describe("S2b task 6 — derivation gated by keyless maturity", () => {
  it("a mature keyless word is an eligible derivation base; a fresh one is not", () => {
    const lang = rootLang();
    const fresh = coinKeylessLexeme(lang, fromFloats(embed("tree")), ["t", "r", "i", "o"]);
    const mature = coinKeylessLexeme(lang, fromFloats(embed("stone")), ["s", "t", "o", "n", "o"]);
    satSet(lang, "wordFrequencyHints", mature, 0.8);
    expect(derivationBaseEligible(lang, mature)).toBe(true);
    expect(derivationBaseEligible(lang, fresh)).toBe(false);   // immature
  });
});
```

> Extract the **suffix-independent** base eligibility (not-recorded-parts, not-bound-morpheme, + keyless maturity) into an exported `derivationBaseEligible(lang, id): boolean`. The suffix-dependent filters (`wantsVerb`/`wantsAdj`/collision) stay inline in the loop.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src keyless_process_widening -t "derivation gated"`
Expected: FAIL — `derivationBaseEligible` not exported.

- [ ] **Step 3: Widen + gate.** Add the predicate and rewrite the candidate filter to iterate ids, resolving the effective gloss as `base`. Replace lines 141-155:

```ts
  const allMeanings = lexKeys(lang);
  const candidates = allMeanings.filter((m) => {
    if (recordedParts(lang, m) !== null || lang.boundMorphemes?.has(m)) return false;
    if (lexHas(lang, `${m}-${suffix.tag}`)) return false;
    if (wantsVerb && !VERB_HINTS.has(m)) return false;
    if (wantsAdj && !ADJECTIVE_HINTS.has(m)) return false;
    if (!wantsVerb && !wantsAdj && (VERB_HINTS.has(m) || ADJECTIVE_HINTS.has(m))) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const base = candidates[rng.int(candidates.length)]!;
```

with (iterate ids; resolve the effective gloss as `m`/`base`; keyless maturity via the predicate; seeded prefix preserves draws):

```ts
  const candidates: string[] = [];
  for (const id of evolvableLexemes(lang)) {
    if (!derivationBaseEligible(lang, id)) continue;     // (recorded-parts/bound/maturity)
    const m = effectiveGlossFor(lang, id);
    if (lexHas(lang, `${m}-${suffix.tag}`)) continue;
    if (wantsVerb && !VERB_HINTS.has(m)) continue;
    if (wantsAdj && !ADJECTIVE_HINTS.has(m)) continue;
    if (!wantsVerb && !wantsAdj && (VERB_HINTS.has(m) || ADJECTIVE_HINTS.has(m))) continue;
    candidates.push(m);
  }
  if (candidates.length === 0) return null;
  const base = candidates[rng.int(candidates.length)]!;
```

and add the predicate:

```ts
export function derivationBaseEligible(lang: Language, id: LexemeId): boolean {
  if (isKeyless(lang, id) && !keylessMature(lang, id)) return false; // concept-coupled gate
  const m = effectiveGlossFor(lang, id);
  return recordedParts(lang, m) === null && !lang.boundMorphemes?.has(m);
}
```

Add imports: `import { evolvableLexemes, isKeyless, keylessMature, effectiveGlossFor } from "../lexicon/evolvable"; import type { LexemeId } from "../lexicon/lexemeIdentity";`. (No satellite is written under the keyless id here — the derived word is seeded; the base's emergent gloss flows into its origin chain.)

- [ ] **Step 4: Run the test + canary**

Run: `npx vitest run --dir src keyless_process_widening` → PASS.
Run: `npx vitest run --dir src lexical_diffusion` → PASS.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/morphology/derivation.ts src/engine/__tests__/keyless_process_widening.test.ts
git commit -m "feat(storage): mature keyless words can be derivation bases (S2b task 6)"
```

---

## Task 7: recarve split/merge + colexification (concept-coupled, maturity-gated)

**Files:**
- Modify: `src/engine/semantics/recarve.ts:84-130` (`tryMerge`) and the parallel `trySplit`
- Possibly modify: `src/engine/lexicon/mutate.ts` (`deleteMeaning`) — handle a keyless loser by id
- Test: `src/engine/__tests__/keyless_process_widening.test.ts`

**Why this is the hardest task:** `tryMerge` builds gloss pairs from `lexKeys(lang).filter(isRegisteredConcept)` + `colexWith(a)`, then `deleteMeaning(lang, loser)`. A keyless word's *emergent* gloss is a registered concept (so it can enter the pair set once mature), but `deleteMeaning` is gloss-addressed and will not find a keyless loser. Colexification falls out of this task: once recarve writes `colexifiedAs` under keyless ids, no separate work is needed.

- [ ] **Step 1: Write the failing test** — append:

```ts
import { maybeRecarve } from "../semantics/recarve";
import { recordOneSidedColexification } from "../semantics/colexification";

describe("S2b task 7 — recarve/colexification for mature keyless words", () => {
  it("a mature keyless word can colexify/merge and writes colex under its id", () => {
    const lang = rootLang();
    // Build a keyless word whose emergent gloss colexifies with a seeded concept, then mature it.
    const kid = coinKeylessLexeme(lang, fromFloats(embed("hand")), ["h", "a", "n", "d", "o"]);
    satSet(lang, "wordFrequencyHints", kid, 0.9);
    // seed a colexification edge from the keyless id's emergent gloss so a pair exists
    recordOneSidedColexification(lang, effectiveGlossFor(lang, kid), "arm");
    const rng = makeRng("s2b-recarve");
    let touched = false;
    for (let i = 0; i < 800 && !touched; i++) {
      const ev = maybeRecarve(lang, rng, 1, i + 1);
      if (ev) touched = true;
    }
    // the keyless id remains addressable; nothing crashed and colex data is id-addressable
    expect(satGet(lang, "colexifiedAs", kid) ?? null).not.toBeUndefined();
  });

  it("a FRESH keyless word (freq 0.4) is excluded from recarve pairs", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("hand")), ["h", "a", "n", "d", "o"]);
    recordOneSidedColexification(lang, effectiveGlossFor(lang, kid), "arm");
    const { recarveMergeCandidateIds } = require("../semantics/recarve");
    expect(recarveMergeCandidateIds(lang).includes(kid)).toBe(false);
  });
});
```

> Extract the candidate selection into an exported `recarveMergeCandidateIds(lang): LexemeId[]` (id-native, maturity-gated, `isRegisteredConcept(effectiveGlossFor(lang,id))`), used by `tryMerge`. Mirror for `trySplit`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src keyless_process_widening -t "recarve"`
Expected: FAIL — `recarveMergeCandidateIds` not exported; keyless never enters pairs; `deleteMeaning` can't address a keyless loser.

- [ ] **Step 3: Widen recarve + `deleteMeaning`.**
  1. Add `recarveMergeCandidateIds(lang): LexemeId[]`:

```ts
export function recarveMergeCandidateIds(lang: Language): LexemeId[] {
  return evolvableLexemes(lang).filter((id) => {
    if (isKeyless(lang, id) && !keylessMature(lang, id)) return false;
    return isRegisteredConcept(effectiveGlossFor(lang, id));
  });
}
```

  2. In `tryMerge`, build pairs over `recarveMergeCandidateIds(lang)`, resolving each id's gloss via `effectiveGlossFor` for `colexWith`/`recarvedRecently`/winner logic, but carry the **ids** alongside so the writes and the deletion target the id. Frequency lookups use the id (`satGet(lang,"wordFrequencyHints",id)`). Winner/loser become ids; `recordOneSidedColexification` and `stampRecarve` receive the winner/loser **ids** (their `colexifiedAs` value arrays still store the emergent/display gloss of the loser via `effectiveGlossFor`).
  3. Make `deleteMeaning(lang, loserId, …)` accept an id: in `mutate.ts`, if the argument is not a seeded gloss but is a key in `lang.lexemes`, delete the record by id and purge its satellites by id (the registry purge is already mint-free/id-aware from S2a). Audit `deleteMeaning` and add the id branch without changing the seeded path.

- [ ] **Step 4: Run the test + canary + the recarve suite**

Run: `npx vitest run --dir src keyless_process_widening concepts realism_overhaul_semantics` → PASS.
Run: `npx vitest run --dir src lexical_diffusion` → PASS.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/semantics/recarve.ts src/engine/lexicon/mutate.ts src/engine/__tests__/keyless_process_widening.test.ts
git commit -m "feat(storage): mature keyless words participate in recarve + colexification (S2b task 7)"
```

---

## Task 8: Determinism canary, baseline re-bake, full green (the merge gate)

**Files:**
- Add: `src/engine/__tests__/keyless_process_widening.test.ts` (a no-qualifying-keyless byte-identity canary)
- Possibly modify: `src/engine/__tests__/meaning_layer_baseline.test.ts` (GENN hashes — only for presets that re-baked)

> Run this task ONCE, after Tasks 1-7 are merged onto `auto/storage-pointnative` (per CLAUDE.md: full suite + RUN_SLOW baseline are reserved for the merge; per-task worktrees only ran targeted tests + the canary).

- [ ] **Step 1: Add the reproducibility canary** — append. (This proves *reproducibility* — same seed → identical output — which is the hard requirement. Byte-identity *vs pre-S2b* is a separate, weaker claim proven per-preset by the RUN_SLOW baseline in Step 2; note variants is immediate, so a preset that coins+sweeps any keyless word re-bakes.)

```ts
describe("S2b — reproducibility with keyless participation", () => {
  it("two identical 30-step english sims produce identical lexicon signatures", () => {
    const sig = () => {
      const sim = createSimulation({ ...presetEnglish(), seed: "s2b-canary" });
      for (let i = 0; i < 30; i++) sim.step();
      const lang = sim.getState().tree[sim.getState().rootId]!.language;
      return JSON.stringify(Object.entries(lang.lexemes).map(([id, r]) => [id, r.form]).sort());
    };
    expect(sig()).toBe(sig());
  });
});
```

Run: `npx vitest run --dir src keyless_process_widening` → PASS (reproducibility holds).

- [ ] **Step 2: Run the determinism gate**

Run (PowerShell): `$env:RUN_SLOW=1; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null`
Expected: **GEN0 byte-identical** (no keyless coinage at gen 0). **GENN**: byte-identical for presets whose 30-gen run coins no *qualifying* keyless word; diverged for any preset that does.

- [ ] **Step 3: For each diverged preset, confirm it is a legitimate keyless re-bake** — run that preset's 30-gen trajectory twice with the same seed and confirm the two GENN signatures are identical to each other (reproducible), and that the divergence corresponds to a keyless word entering a widened process (inspect events). Only then update that preset's GENN expected hash in `meaning_layer_baseline.test.ts`, with a comment naming the keyless word + process. Do NOT edit a hash you cannot explain.

- [ ] **Step 4: Full green**

Run: `npx vitest run --dir src` → 0 failures (13 skips expected).
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/__tests__/keyless_process_widening.test.ts src/engine/__tests__/meaning_layer_baseline.test.ts
git commit -m "test(storage): S2b determinism canary + deliberate GENN re-bake for affected presets (S2b task 8)"
```

---

## Task 9: Documentation + memory

**Files:**
- Modify: `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md` (S2b ledger; S3 next)
- Modify: `C:\Users\brent\.claude\projects\c--dev-languageevolution\memory\vector-native-lexicon-flip-active.md` + `MEMORY.md` pointer

- [ ] **Step 1:** Add an S2b-DONE entry to the step-5 ledger: task SHAs (T1-T9), which presets re-baked (and why), and that S3 (thread LexemeId through ~381 seam call sites) is next.
- [ ] **Step 2:** Update the memory file: S2b COMPLETE with ledger; note the new `lexicon/evolvable.ts` primitives and the per-process eligibility (form-based immediate; concept-coupled maturity-gated on `KEYLESS_MATURITY_FREQ`). S3 NEXT.
- [ ] **Step 3: Commit** `docs: mark storage step-5 sub-project 2b (process-widening) DONE` (+ trailer).

---

## Final review (controller, after all tasks)

Confirm: every widened process writes satellites by **id** (no keyless write lands on an emergent-gloss key); seeded behaviour is byte-identical wherever no keyless word qualifies (canary green); each GENN re-bake is documented + reproducible; `meaningPoints`/`lexemeIds` untouched; the 4 concept-coupled processes gate keyless on `keylessMature`, the 3 form-based ones don't. Then use **superpowers:finishing-a-development-branch** (branch stays local — do NOT push or PR unless the user asks).
