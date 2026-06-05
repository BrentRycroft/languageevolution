# Track C · Plan 0 (backend) — Point-carrying, live-form morpheme accessors

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use
> checkbox (`- [ ]`) syntax.

**Goal:** Give every language a composable morpheme set carrying a semantic **point** + a **live**
phonological form, derived at read-time from the live lexicon (no baked data, no `lexPoint` change).
This is the substrate Track B consumes and the Dictionary surfaces per active language.

**Architecture:** A new module `semantics/languageMorphemes.ts` with two pure read accessors:
`languageMorphemes(lang)` (all composable morphemes) and `wordMorphemes(lang, meaning)` (a word's
ordered composition). Roots = open-class content lexemes (`point = lexPoint(id)`, `form = live
lexGet`); affixes = `lang.boundMorphemes` (zero point for v1). The Dictionary's "morphemes" row
switches from the English-only baked `morphemeBreakdown` to `wordMorphemes(activeLang, meaning)`.

**Determinism:** no baked data, no `lexPoint`/drift change → `meaning_layer_baseline.test.ts`
unchanged (firewall). Accessors never run inside `sim.step()`.

**Tech Stack:** TypeScript, Vitest, React.

---

### Task 1: `languageMorphemes` + `wordMorphemes` accessors

**Files:**
- Create: `src/engine/semantics/languageMorphemes.ts`
- Create: `src/engine/semantics/__tests__/languageMorphemes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/semantics/__tests__/languageMorphemes.test.ts
import { describe, it, expect } from "vitest";
import { languageMorphemes, wordMorphemes } from "../languageMorphemes";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import { presetTokiPona } from "../../presets/tokipona";
import { lexPoint } from "../meaningPoint";
import { distanceSq } from "../vec";

function rootLang(cfg: ReturnType<typeof presetEnglish>) {
  const sim = createSimulation(cfg);
  const s = sim.getState();
  return s.tree[s.rootId]!.language;
}

describe("languageMorphemes — composable morpheme set", () => {
  const lang = rootLang(presetEnglish());

  it("includes open-class content roots with live forms + lexPoint points", () => {
    const ms = languageMorphemes(lang);
    const water = ms.find((m) => m.id === "water");
    expect(water).toBeTruthy();
    expect(water!.type).toBe("root");
    expect(water!.form.length).toBeGreaterThan(0);            // live form
    expect(distanceSq(water!.point, lexPoint("water"))).toBe(0); // shared anchor
  });

  it("excludes bound morphemes from roots and lists them as affixes (zero point)", () => {
    const ms = languageMorphemes(lang);
    const ness = ms.find((m) => m.id === "-ness");
    expect(ness).toBeTruthy();
    expect(ness!.type).toBe("suffix");
    expect(ness!.point.every((x) => x === 0)).toBe(true);     // v1: zero point
    // a bound morpheme is never also a root
    expect(ms.filter((m) => m.id === "-ness" && m.type === "root")).toHaveLength(0);
  });

  it("excludes closed-class function words from roots", () => {
    const ms = languageMorphemes(lang);
    expect(ms.find((m) => m.id === "the" && m.type === "root")).toBeFalsy();
  });
});

describe("wordMorphemes — a word's ordered composition (live, per language)", () => {
  it("decomposes a recorded English derivation with the active language's forms", () => {
    const lang = rootLang(presetEnglish());
    const parts = wordMorphemes(lang, "behind");                // be- + hind
    expect(parts).not.toBeNull();
    expect(parts!.map((m) => m.id)).toEqual(["hind", "be-"]);
    expect(parts!.every((m) => m.form.length > 0)).toBe(true);
  });

  it("decomposes a Toki Pona compound with Toki Pona forms (agnostic)", () => {
    const lang = rootLang(presetTokiPona());
    const parts = wordMorphemes(lang, "computer");              // work + know (pali + sona)
    expect(parts).not.toBeNull();
    expect(parts!.map((m) => m.id)).toEqual(["work", "know"]);
  });

  it("returns null for a monomorphemic word", () => {
    const lang = rootLang(presetEnglish());
    expect(wordMorphemes(lang, "water")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run --dir src src/engine/semantics/__tests__/languageMorphemes.test.ts` → FAIL (`languageMorphemes is not a function`).

- [ ] **Step 3: Implement the accessors**

```ts
// src/engine/semantics/languageMorphemes.ts
/**
 * languageMorphemes.ts — Track C: a language's composable morpheme set with a semantic POINT and
 * a LIVE phonological form. Derived at read-time from the live lexicon (no baked data, no lexPoint
 * change) so a composition reflects the language's CURRENT stage of sound-change evolution.
 *
 * Roots = open-class content lexemes (point = the shared meaning anchor via lexPoint; form = live
 * lexGet). Affixes = lang.boundMorphemes (v1: zero point — a pure form affix; real operation
 * vectors are deferred to Track B per the Track C spec §7). The Morpheme shape matches
 * morphemeSpace.ts so nearestComposition (Track B) and the Dictionary consume it directly.
 */
import type { Language, Meaning } from "../types";
import type { Morpheme, MorphemeType } from "./morphemeSpace";
import { type Vec, zeroVec } from "./vec";
import { lexGet, lexKeys } from "../lexicon/access";
import { recordedParts } from "../lexicon/word";
import { posOf, isClosedClass } from "../lexicon/pos";
import { lexPoint } from "./meaningPoint";

function boundSet(lang: Language): ReadonlySet<string> {
  return lang.boundMorphemes ? new Set(lang.boundMorphemes) : new Set();
}

function affixType(affix: string): MorphemeType {
  return affix.endsWith("-") && !affix.startsWith("-") ? "prefix" : "suffix";
}

/** One morpheme entry (root or affix) with a LIVE form, or null if it has no usable form. */
function morphemeFor(lang: Language, id: string, bound: ReadonlySet<string>): Morpheme | null {
  const form = lexGet(lang, id);
  if (!form || form.length === 0) return null;
  if (bound.has(id)) {
    return { id, form: form.slice(), point: zeroVec(), type: affixType(id) };
  }
  return { id, form: form.slice(), point: lexPoint(id), type: "root" };
}

/** The language's composable morphemes: open-class content roots + bound affixes, live forms. */
export function languageMorphemes(lang: Language): Morpheme[] {
  const bound = boundSet(lang);
  const out: Morpheme[] = [];
  for (const id of lexKeys(lang)) {
    if (bound.has(id)) continue; // affixes added below, not as roots
    if (isClosedClass(posOf(id))) continue; // function words aren't composable content roots
    const m = morphemeFor(lang, id, bound);
    if (m) out.push(m);
  }
  for (const affix of bound) {
    const m = morphemeFor(lang, affix, bound);
    if (m) out.push(m);
  }
  return out;
}

/** A word's ordered morpheme composition (live forms + points), or null if monomorphemic. */
export function wordMorphemes(lang: Language, meaning: Meaning): Morpheme[] | null {
  const parts = recordedParts(lang, meaning);
  if (!parts || parts.length === 0) return null;
  const bound = boundSet(lang);
  const out: Morpheme[] = [];
  for (const p of parts) {
    const m = morphemeFor(lang, p, bound);
    if (!m) return null; // a missing part means we can't faithfully show the composition
    out.push(m);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS.
- [ ] **Step 5: Confirm `zeroVec` exists** in `vec.ts` (it does). If `recordedParts`' option signature differs, call it as `recordedParts(lang, meaning)`.
- [ ] **Step 6: Commit**

```bash
git add src/engine/semantics/languageMorphemes.ts src/engine/semantics/__tests__/languageMorphemes.test.ts
git commit -m "feat(semantics): languageMorphemes + wordMorphemes — point+live-form morpheme accessors (Track C plan 0)"
```

---

### Task 2: Dictionary morphemes row reads the active language's composition

**Files:**
- Modify: `src/ui/DictionaryView.tsx`
- Test: `src/ui/__tests__/dictionary_morphemes_agnostic.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/__tests__/dictionary_morphemes_agnostic.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";
import { presetTokiPona } from "../../engine/presets/tokipona";

/**
 * Track C plan 0: the Dictionary's "morphemes" row shows the ACTIVE language's composition.
 * Toki Pona "computer" = work + know — the row must list those parts (not the English baked set).
 */
describe("DictionaryView — per-language morpheme composition", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().loadConfig(presetTokiPona());
  });

  it("shows Toki Pona computer = work + know", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("computer")[0]!);
    expect(screen.getByText("morphemes")).toBeTruthy();
    expect(screen.getAllByText("work").length).toBeGreaterThan(0);
    expect(screen.getAllByText("know").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run --dir src/ui src/ui/__tests__/dictionary_morphemes_agnostic.test.tsx` → FAIL (English baked breakdown returns null for Toki Pona "computer").

- [ ] **Step 3: Swap the import + the breakdown computation**

In `src/ui/DictionaryView.tsx`, replace the import
`import { morphemeBreakdown } from "../engine/semantics/morphemeSpaceLoader";`
with
`import { wordMorphemes } from "../engine/semantics/languageMorphemes";`

and change the `breakdown` line in `SemanticProfile`'s `useMemo` from
```ts
    const breakdown = morphemeBreakdown(meaning);
```
to
```ts
    const breakdown = wordMorphemes(lang, meaning)?.map((m) => m.id) ?? null;
```
(The render block at `data.breakdown.map(...)` is unchanged — it already resolves each part's gloss
+ form via `lexGet(lang, p)`, which is exactly the live form. `breakdown` stays `string[] | null`.)

- [ ] **Step 4: Run to verify it passes** — same command → PASS.
- [ ] **Step 5: Run the UI morpheme/dictionary suite + typecheck** —
  `npx vitest run --dir src/ui` (existing `dictionary_*` tests still green — the English ones now
  read `wordMorphemes(englishLang, …)`, which returns the same `["hind","be-"]` / `["day","light"]`
  parts for the English preset); `npx tsc --noEmit` → no output.
- [ ] **Step 6: Commit**

```bash
git add src/ui/DictionaryView.tsx src/ui/__tests__/dictionary_morphemes_agnostic.test.tsx
git commit -m "feat(ui): Dictionary morphemes row reads the active language's composition (Track C plan 0)"
```

---

### Task 3: Determinism firewall confirmation

**Files:** none (verification only).

- [ ] **Step 1:** Run `npx vitest run --dir src src/engine/__tests__/meaning_layer_baseline.test.ts`
  → unchanged / green (Track C added no baked data and did not touch `lexPoint`).
- [ ] **Step 2:** Run `npx tsc --noEmit` → no output.

---

## What this completes
- The runtime, point-carrying, live-form morpheme substrate for **all** presets. Track B can now
  `nearestComposition` over `languageMorphemes(lang)` and build surfaces from live forms; the
  Dictionary shows per-language composition. Enrichment (C1–C6) flows in automatically via
  `seedCompounds`/`seedDerivations` → `recordedParts` → `wordMorphemes`.

## Self-review notes
- **Spec coverage:** delivers §3.1 (accessors) + §3.2 (Dictionary). Affix op-vectors deferred (§7).
- **Determinism:** no baked data, no `lexPoint` change; firewall test asserted in Task 3.
- **Agnosticism:** roots/affixes/composition come from the active language's own records + forms.
- **Type consistency:** both accessors return the `Morpheme` type from `morphemeSpace.ts`
  (`{id, form, point, type}`); `breakdown` stays `string[] | null` so the render block is untouched.
