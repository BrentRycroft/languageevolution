# Preset Authentic Vocabulary — Sub-project M (Mechanism) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop every catalog preset from being padded with randomly-generated ("made-up") words by removing the 1000-word enrichment floor and the random `default` preset, pointing the app's boot/selection at a real preset (PIE), and locking the authored-only invariant with a guard test.

**Architecture:** The user-facing catalog (`PRESETS` in `presets/index.ts`) currently wraps every build in `withEnrichedLexicon(...)`, which pads the curated authentic seed up to 1000 entries with `generateForm` gibberish. This sub-project removes that wrapper, deletes the enrichment machinery (`lexicon/enrichPreset.ts`), drops the synthetic `default` preset from the catalog, and repoints the app boot config + picker fallback to PIE. The determinism baseline (`meaning_layer_baseline.test.ts`) uses the **bare** `presetX()` builders, so this change is **baseline-neutral** — no re-bake. The runtime gap-coinage path uses semantically-coherent compounding (`composeForGap`), not `generateForm`, so concepts without a seed word still fill principled.

**Tech Stack:** TypeScript, Vitest, Zustand (UI store), React (preset picker). Engine under `src/engine`, UI under `src/ui`, state under `src/state`.

**Scope note:** This plan is sub-project **M only**. The per-language authentic-vocabulary expansions (E1–E6) are separate plans that follow after M lands. Do **not** expand any preset's vocabulary here.

**Reference spec:** `docs/superpowers/specs/2026-06-13-preset-authentic-vocabulary-design.md`

---

## File structure

| File | Change | Responsibility after change |
|---|---|---|
| `src/engine/presets/index.ts` | Modify | Catalog of 6 authored presets; each `build()` returns the bare `presetX()` (no enrichment); no `default` entry |
| `src/engine/lexicon/enrichPreset.ts` | **Delete** | (removed — random floor machinery) |
| `src/engine/__tests__/preset_floor.test.ts` | **Delete** | (removed — asserted the ≥1000 floor) |
| `src/engine/__tests__/preset_authenticity.test.ts` | **Create** | Guard: catalog builds == bare builders; no `default`; IPA clean |
| `src/state/store.ts` | Modify | Boot a fresh session into PIE (real lexicon), not random `defaultConfig()` |
| `src/ui/PresetPicker.tsx` | Modify | Current-selection fallback points at `pie`, not removed `default` |
| `docs/planning/ROADMAP.md` | Modify | Status rows reflect 6 authored-only presets, floor removed |

**Kept unchanged on purpose:** `src/engine/lexicon/basic240.ts` (`generateForm`/`fillMissing`) and `src/engine/lexicon/defaults.ts` (`DEFAULT_LEXICON`) — still used by `defaultConfig()` for tests + engine internals. `defaultConfig()` itself stays.

---

## Task 1: Replace the floor test with an authenticity guard, then drop enrichment + repoint boot/picker

**Files:**
- Delete: `src/engine/__tests__/preset_floor.test.ts`
- Create: `src/engine/__tests__/preset_authenticity.test.ts`
- Modify: `src/engine/presets/index.ts`
- Modify: `src/state/store.ts:234`
- Modify: `src/ui/PresetPicker.tsx:47`

- [ ] **Step 1: Delete the old floor test**

```bash
git rm src/engine/__tests__/preset_floor.test.ts
```

(It asserts each catalog preset opens with ≥1000 words and unit-tests `enrichToFloor`/`derivePhonology` — both invariants are being removed.)

- [ ] **Step 2: Write the new authenticity-guard test (failing)**

Create `src/engine/__tests__/preset_authenticity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PRESETS } from "../presets";
import { presetPIE } from "../presets/pie";
import { presetGermanic } from "../presets/germanic";
import { presetRomance } from "../presets/romance";
import { presetBantu } from "../presets/bantu";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { validatePresetIpa } from "../presets/validatePreset";
import type { SimulationConfig } from "../types";

/**
 * Authored-only invariant (replaces the Lane E ≥1000-word floor). Every catalog
 * preset must load EXACTLY its bare `presetX()` seed lexicon — no synthetic
 * `generateForm` padding — and the random `default` preset must be gone. This
 * locks the "no made-up words" guarantee.
 */
const BARE: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  germanic: presetGermanic,
  romance: presetRomance,
  bantu: presetBantu,
  tokipona: presetTokipona,
  english: presetEnglish,
};

describe("preset authenticity — catalog presets are authored-only", () => {
  it("the catalog no longer contains the random 'default' preset", () => {
    expect(PRESETS.find((p) => p.id === "default")).toBeUndefined();
  });

  it("every catalog preset maps to a known authentic builder", () => {
    for (const p of PRESETS) {
      expect(BARE[p.id], `no bare builder registered for catalog preset "${p.id}"`).toBeDefined();
    }
  });

  for (const p of PRESETS) {
    it(`${p.id}: build().seedLexicon equals its bare builder (no enrichment layer)`, () => {
      const built = p.build().seedLexicon ?? {};
      const bare = BARE[p.id]!().seedLexicon ?? {};
      expect(Object.keys(built).sort()).toEqual(Object.keys(bare).sort());
      for (const k of Object.keys(bare)) expect(built[k]).toEqual(bare[k]);
    });

    it(`${p.id}: no blocking IPA issues`, () => {
      const blocking = validatePresetIpa(p.build()).filter(
        (i) => i.code === "unknown_phoneme" || i.code === "empty_form",
      );
      expect(blocking).toEqual([]);
    });
  }
});
```

- [ ] **Step 3: Run the new test to verify it fails**

Run: `npx vitest run --dir src preset_authenticity`
Expected: FAIL — the catalog still has `default` (first `it` fails) and enriched builds have ~1000 keys vs. the bare builders' curated counts (the per-preset deep-equal fails).

- [ ] **Step 4: Drop enrichment + remove `default` from the catalog**

Edit `src/engine/presets/index.ts`. Remove the `withEnrichedLexicon` and now-unused `defaultConfig` imports, delete the `default` descriptor, and make every `build` return the bare builder. The full file becomes:

```ts
import type { SimulationConfig } from "../types";
import { presetPIE } from "./pie";
import { presetGermanic } from "./germanic";
import { presetRomance } from "./romance";
import { presetBantu } from "./bantu";
import { presetTokipona } from "./tokipona";
import { presetEnglish } from "./english";

/**
 * index.ts
 *
 * Built-in language seeds (PIE, Germanic, Romance, Bantu, Toki Pona, English). Key exports: PresetDescriptor, PRESETS, findPreset.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export interface PresetDescriptor {
  id: string;
  label: string;
  description: string;
  build: () => SimulationConfig;
}

// Every catalog preset loads its curated, hand-authored seed lexicon verbatim —
// no synthetic padding. (The former `withEnrichedLexicon` 1000-word floor coined
// random `generateForm` words; it was removed so the dictionary only ever shows
// authentic vocabulary. Concepts a language lacks a seed word for are filled at
// runtime by semantically-coherent compounding, not random forms.)
export const PRESETS: readonly PresetDescriptor[] = [
  {
    id: "pie",
    label: "Proto-Indo-European",
    description: "Laryngeals, 8 cases, 3 genders, SOV. Classic reconstructed starting point.",
    build: () => presetPIE(),
  },
  {
    id: "germanic",
    label: "Proto-Germanic",
    description: "PIE after Grimm's Law. Voiceless stops spirantized, voiced stops devoiced.",
    build: () => presetGermanic(),
  },
  {
    id: "romance",
    label: "Latin / Proto-Romance",
    description: "Late Latin with 5 cases shifting toward Romance SVO.",
    build: () => presetRomance(),
  },
  {
    id: "bantu",
    label: "Proto-Bantu",
    description: "CV syllables, noun-class prefixes, tone already on.",
    build: () => presetBantu(),
  },
  {
    id: "tokipona",
    label: "Toki pona",
    description:
      "Minimal conlang: 120 root words, 9 consonants + 5 vowels, SVO, no inflection. A minimalist starting point.",
    build: () => presetTokipona(),
  },
  {
    id: "english",
    label: "Modern English",
    description:
      "General-American English in narrow IPA: SVO, no case, articles, -s plural, -ed past, -ing progressive. Drift it forward to see what English becomes.",
    build: () => presetEnglish(),
  },
];

export function findPreset(id: string | undefined): PresetDescriptor | undefined {
  return PRESETS.find((p) => p.id === id);
}
```

- [ ] **Step 5: Boot a fresh session into PIE instead of the random default config**

Edit `src/state/store.ts`. At the top of the file, ensure `findPreset` is imported from the presets module (add it to the existing presets import, or add a new import). Then change the boot config at line 234.

Find:

```ts
  const cfg = defaultConfig();
```

Replace with:

```ts
  // Boot a fresh session into a real, fully-authentic preset (PIE) rather than
  // the bare random defaultConfig() lexicon, so first load never shows made-up
  // words. defaultConfig() is retained as a defensive fallback.
  const cfg = findPreset("pie")?.build() ?? defaultConfig();
```

Add the import near the other engine imports at the top of `store.ts`:

```ts
import { findPreset } from "../engine/presets";
```

(Keep the existing `defaultConfig` import — it is still used for the fallback above and by the reset path elsewhere in the file.)

- [ ] **Step 6: Repoint the picker's current-selection fallback**

Edit `src/ui/PresetPicker.tsx:47`. Find:

```ts
  const current = config.preset ?? "default";
```

Replace with:

```ts
  const current = config.preset ?? "pie";
```

- [ ] **Step 7: Run the guard test + typecheck**

Run: `npx vitest run --dir src preset_authenticity`
Expected: PASS — `default` is gone, and each catalog build equals its bare builder.

Run: `npx tsc --noEmit`
Expected: clean (no unused-import errors; `enrichPreset.ts` is now orphaned but still compiles — it is deleted in Task 2).

- [ ] **Step 8: Commit**

```bash
git add src/engine/presets/index.ts src/engine/__tests__/preset_authenticity.test.ts src/state/store.ts src/ui/PresetPicker.tsx
git commit -m "$(printf 'feat(presets): drop random floor, authored-only catalog, boot into PIE\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

(The `git rm` from Step 1 is included in this commit.)

---

## Task 2: Delete the now-orphaned enrichment machinery

**Files:**
- Delete: `src/engine/lexicon/enrichPreset.ts`

- [ ] **Step 1: Confirm nothing imports it**

Run: `git grep -n "enrichPreset\|enrichToFloor\|withEnrichedLexicon\|derivePhonology\|PRESET_LEXICON_FLOOR" -- 'src/**'`
Expected: no matches under `src/` (all importers removed in Task 1; the only remaining hits are in `docs/`).

- [ ] **Step 2: Delete the file**

```bash
git rm src/engine/lexicon/enrichPreset.ts
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(printf 'refactor(presets): remove orphaned enrichToFloor floor machinery\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Update the ROADMAP status rows

**Files:**
- Modify: `docs/planning/ROADMAP.md:67-68`

- [ ] **Step 1: Update the two stale preset status rows**

In `docs/planning/ROADMAP.md`, find the row (line ~67):

```
| **Presets — coverage** | partial | 7 (default Swadesh + pie/germanic/romance/bantu/tokipona/english); families typologically authentic. |
```

Replace with:

```
| **Presets — coverage** | partial | 6 authored-only (pie/germanic/romance/bantu/tokipona/english); the random `default` Swadesh preset and the 1000-word enrichment floor were removed (2026-06-13). |
```

Find the next row (line ~68):

```
| **Presets — word count** | partial | ~240-concept ceiling (basic240 fillMissing); Bantu ~220 hand-authored, default 44 core + filled. Expanding the concept registry is the lever for "more words". |
```

Replace with:

```
| **Presets — word count** | partial | Authored-only since the floor removal (2026-06-13). Curated seeds: english ~720, pie ~410, romance/germanic/bantu ~270-290, tokipona ~135. Per-language authentic expansion (sub-projects E1-E6) in progress; runtime compounding fills unlexicalised concepts. |
```

- [ ] **Step 2: Commit**

```bash
git add docs/planning/ROADMAP.md
git commit -m "$(printf 'docs(roadmap): reflect authored-only catalog (floor + default removed)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Baseline-neutrality verification gate

This is the sub-project's done-check: prove M removed the made-up words **without** perturbing any preset's evolution (no re-bake).

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Run the authenticity guard + IPA validation**

Run: `npx vitest run --dir src preset_authenticity preset_ipa`
Expected: PASS — authored-only invariant holds and all six presets are IPA-clean.

- [ ] **Step 3: Prove baseline-neutrality (no re-bake)**

Run: `npx vitest run --dir src meaning_layer_baseline`
Expected: PASS — the GEN0 fast tests still match the locked hashes (`pie 8e1e516d`, `bantu cb709a71`, `romance 28661e99`, `germanic 442a10cb`, `tokipona 963106db`, `english baf6d800`). These use the **bare** `presetX()` builders, which M did not touch, confirming M changed nothing for the six languages' evolution. **Do not edit any baseline hash in this sub-project.**

- [ ] **Step 4: Sanity-check the UI boot path compiles**

Run: `npx vitest run --dir src store`
Expected: PASS (or "no tests" if there is no store test) — confirms the `findPreset("pie")` boot edit and import resolve. If there is no store test, skip; the `tsc --noEmit` in Step 1 already covers type-resolution of the new import.

---

## Self-review

**Spec coverage (against the design's "Sub-project M" section):**
- Drop `withEnrichedLexicon` wrapper → Task 1 Step 4. ✓
- Remove `default` from `PRESETS` → Task 1 Step 4 + guard test. ✓
- Delete `enrichPreset.ts` → Task 2. ✓
- Replace `preset_floor.test.ts` with authenticity guard → Task 1 Steps 1-2. ✓
- Keep `generateForm`/`fillMissing`/`DEFAULT_LEXICON` → untouched (file-structure note). ✓
- Update ROADMAP prose → Task 3. ✓
- Frontend seams (boot config, picker fallback) → Task 1 Steps 5-6. ✓
- Baseline-neutral, no re-bake → Task 4 Step 3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content; exact commands with expected output. ✓

**Type/name consistency:** `BARE` map keys (`pie`/`germanic`/`romance`/`bantu`/`tokipona`/`english`) match the `PRESETS` ids exactly; `findPreset` is the real export from `presets/index.ts`; `validatePresetIpa` codes (`unknown_phoneme`, `empty_form`) match `validatePreset.ts`. ✓

**Out of scope (correctly excluded):** No vocabulary expansion, no concept-registry growth, no baseline re-bake — those are E1–E6. ✓
