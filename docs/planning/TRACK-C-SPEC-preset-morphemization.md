# Track C — Preset Morphemization (per-language, point-carrying morpheme inventory)

> Spec for Track C of the Vector-Space-Native Overhaul
> (`docs/planning/VECTOR-SPACE-OVERHAUL-2026-06.md` §5). Wave 2. Depends on Track A (done).
> **Sequencing note (2026-06-05):** the user chose to run **Track C before Track B** — Track B's
> compositional coinage needs per-language morphemes *with forms*, which Track C produces.

Status: **DECISIONS LOCKED (2026-06-05).** Architecture = **runtime, not baked** (revised 2026-06-05;
see §3.0). Ready to decompose into plans (C0 backend → C1–C6 agent-per-preset → C-final).

---

## 0. Goal

Give **every preset** a first-class **morpheme inventory carrying both a semantic POINT and a
live phonological FORM**, so a word's surface can be expressed as a composition of morpheme forms
in *that language at its current stage of evolution*. This is the substrate Track B consumes (its
gap-driven coiner picks morphemes by **point**, then builds the surface word from their **forms**),
and it makes each preset's etymology explicit (`computer` = *work*+*know* in Toki Pona,
*carry*+*leaf* "wallet" in Romance, …).

Success (roadmap §11 C): every preset's vocabulary is morpheme-encoded; recomposed forms stay
phonotactically legal and match the seeded surface for fossilized entries; Toki Pona stays
consistent (already heavily morphemic); **determinism is unchanged.**

---

## 1. Locked decisions (2026-06-05)

- **C-point-model → OPTION A: FORMS-ONLY.** A concept's *meaning point* is universal (meaning keys
  are shared English concepts across all presets; only forms differ). Track C does **not** change
  `lexPoint`, drift, grounding, or any determinism-affecting path. Existing words compose **forms**;
  point-additivity is reserved for Track B's *newly coined* words (where the coiner defines
  meaning = composition). → **Zero determinism re-baseline.**

- **C-authoring-depth → ENRICH EACH PRESET (agents).** One agent per preset adds
  etymologically-faithful decompositions (compounds + affixal derivations) over the shared concept
  keys, using that language's real morphology. The parallelizable bulk work the roadmap flagged.

---

## 2. What is UNCHANGED (the determinism firewall)

Track C must not move any locked hash. It **adds runtime accessors** and **enriches preset
configs**; it does **not** touch:

- `meaningPoint.ts` (`lexPoint` / `meaningPointFor` / `glideMeaningPoint`) — points stay global.
- `morphemeSpaceData.ts` and its loader path into `lexPoint` (the baked English meaning-point space
  from Track A) — **not read or modified.** No new baked data is introduced at all.
- `drift.ts`, `grounding.ts`, the simulation step, genesis — none change behavior.

Because Track C introduces **no baked data and no `lexPoint` change**, the determinism firewall is
structural: there is nothing on the meaning-point path to move. A test still asserts the
meaning-layer baseline is unchanged (§6).

---

## 3. Architecture

### 3.0 Runtime, not baked (the key revision)

Track A baked an *English* morpheme **point** space offline (`morphemeSpaceData.ts`) because the
affix-vector factorization is a one-time fit and meaning points don't drift. **Forms are different:
they evolve every generation via sound change.** The engine already builds a per-language morpheme
inventory from the **live** lexicon at init (`lang.morphemeInventory = buildMorphemeInventory(lang)`
in `steps/init.ts`), reading forms via `lexGet`. Track C therefore **extends the runtime inventory
with points**, rather than baking a stale-by-gen-1 forms table. A word coined at generation N
composes the generation-N morpheme forms — correct by construction.

### 3.1 The composable morpheme set (what Track B consumes)

A new accessor yields the language's composable morphemes in the `Morpheme` shape
(`semantics/morphemeSpace.ts`: `{ id, form, point, type }`) that `nearestComposition` already expects:

```ts
// semantics/languageMorphemes.ts  (NEW)
import type { Vec } from "./vec";
import type { Morpheme } from "./morphemeSpace";

/** The language's composable morphemes, with LIVE forms + semantic points. */
export function languageMorphemes(lang: Language): Morpheme[];

/** A word's ordered morpheme composition (live forms + points), or null if monomorphemic. */
export function wordMorphemes(lang: Language, meaning: Meaning): Morpheme[] | null;
```

- **Root morphemes** = every content lexeme (`posOf(meaning)` ∈ content; bound morphemes excluded).
  `id = meaning`, `form = lexGet(lang, meaning)` (**live**), `point = lexPoint(meaning)` (shared
  anchor — derived, not stored), `type = "root"`.
- **Affix morphemes** = `lang.boundMorphemes`. `id = affix`, `form = lexGet(lang, affix)` (live),
  `type = prefix|suffix` (from position), **`point = zeroVec` for v1** (a pure form affix — adds
  form, no semantic shift). Real affix operation-vectors are **deferred** (§7) — they are a Track B
  composition-richness feature, not needed to unblock root composition (firewater = fire+water).
- **Word composition** (`wordMorphemes`) = the recorded parts (`recordedParts(lang, meaning)`),
  each resolved to a root/affix morpheme; null if the word has no recorded decomposition.

Points are **derived on read** (`lexPoint` is cached + cheap), never stored on `lang` — so no
clone/persist/state-schema change, and no risk to determinism serialization.

### 3.2 Dictionary surface

`DictionaryView` currently shows composition via the English-only baked `morphemeBreakdown`. Track C
switches the "morphemes" row to `wordMorphemes(activeLang, meaning)` so it shows the **active
language's** composition with that language's **live** forms.

---

## 4. Data flow

```
preset config (seedCompounds / seedDerivations)
        │  steps/init.ts: addCompound / addDerivation  →  lang.compounds / records
        ▼
lang (live lexicon, evolves each gen via sound change)
        │  languageMorphemes(lang) / wordMorphemes(lang, m)     ← derive points (lexPoint) + live forms (lexGet)
        ▼
Morpheme[] {id, form(live), point, type}
        ├──►  Track B coiner (nearestComposition over points → build surface from live forms)
        └──►  Dictionary "morphemes" row (active language's composition, live forms)
```

---

## 5. Plan breakdown

### Plan C0 — Backend: point-carrying, live-form morpheme accessors  *(serial)*
- `semantics/languageMorphemes.ts`: `languageMorphemes(lang)` + `wordMorphemes(lang, meaning)` per
  §3.1 (roots = content lexemes with `lexPoint` + live form; affixes = bound morphemes, zero point;
  composition from `recordedParts`).
- Switch `DictionaryView`'s morphemes row to `wordMorphemes(activeLang, meaning)`.
- Tests (`semantics/__tests__/languageMorphemes.test.ts` + a UI test): for **each** preset the
  inventory builds; content roots are present with live forms; a known compound decomposes to the
  right ordered morphemes with that language's forms; bound morphemes are excluded from roots;
  monomorphemic words return null from `wordMorphemes`.
- **Verify (controller, myself):** `npx tsc --noEmit`; `npx vitest run --dir src` semantics + UI
  morpheme tests green; `meaning_layer_baseline.test.ts` unchanged (firewall).

> **Determinism finding (2026-06-05, plan 0b):** enrichment must NOT route through
> `seedCompounds`/`seedDerivations`. A word's "has recorded parts" status (`lang.compounds`)
> changes ~7 simulation subsystems (derivation eligibility, taboo, obsolescence, reanalysis,
> neighbour + frequency bootstrap, coinage), which shifts the RNG stream and **re-baselines the
> preset** (verified empirically — one recorded decomposition diverged all forms over 25 gens).
> Enrichment instead uses the new **`seedEtymologies`** config field → the engine-INERT
> `lang.etymology` (read only by `wordMorphemes`), which is **determinism-neutral by construction**.

### Plans C1–C6 — Enrich one preset each  *(AGENT-DELEGABLE, one agent per preset, parallel-safe)*
Presets: **english, pie, germanic, romance, bantu, tokipona.** Each agent:
1. Adds etymologically-faithful entries to that preset's **`seedEtymologies`** (`{ word: { parts:
   [...] } }`) over the shared concept keys, using the language's real morphology, **with a cited
   rationale comment**. Both the word and every part must be in the preset's `seedLexicon`. English +
   Toki Pona are already rich in `seedCompounds` → lighter. Target ~8–20 etymologies per preset; do
   **not** force-decompose genuinely monomorphemic roots, and skip words that already have a real
   `seedCompounds`/`seedDerivations` entry (`recordedParts` wins in `wordMorphemes`).
2. Verifies for that preset: `wordMorphemes(rootLang, word)` returns the intended ordered parts;
   the bare preset still builds + its existing tests stay green; the determinism firewall holds
   (guaranteed by the inert-field mechanism — no per-preset re-bake needed).
3. Stays within preset `seedConfig` — no engine logic, no `lexPoint` change, no baked data.

> Parallel-safe: each agent edits only its own preset file, and `seedEtymologies` is
> determinism-neutral, so there is no shared baseline to race (independent domains).

### Plan C-final — Cross-preset verification + Dictionary polish  *(serial)*
- Cross-preset test: all six presets build a morpheme inventory; every recorded decomposition
  resolves via `wordMorphemes`; all recomposed forms are phonotactically legal; determinism firewall
  intact.
- Confirms §11 C success criteria. Hands off to **Track B**.

---

## 6. Invariants & verification

- **Determinism firewall (hard):** no baked data, no `lexPoint` change → `meaning_layer_baseline.test.ts`
  and all locked GENN hashes unchanged.
- **Evolution correctness:** forms read live via `lexGet`, so a composition reflects the language's
  current stage.
- **Phonotactic legality:** every recomposed compound form passes the preset's phonotactic profile.
- **Resolvability:** every recorded decomposition resolves through `wordMorphemes`.
- **Agnosticism:** shared concept keys are fine; forms + decomposition patterns are the language's own.
- **Toki Pona consistency:** its rich existing compounds resolve unchanged; no regression.

---

## 7. Deferred / out of scope

- **Affix operation-vectors** — v1 affixes carry a zero point (form-only). Real learned op-vectors
  (factorized from each preset's derivations) are a Track B composition-richness feature; add them
  when Track B needs affixal *meaning* composition, not just root composition.
- **Per-preset semantic points** (Option B) — rejected (§1). Meaning is universal; per-language
  points would cost a full re-baseline.
- **Affix stacking** (>1 affix per word) — out of scope; the existing single-affix recording stands.
- **Track B wiring** — Track C only produces the inventory; Track B consumes it next.

---

## 8. Risks

- **Content-root breadth vs. noise.** Including every content lexeme as a composable root gives Track
  B rich material but also lets it compose semantically odd forms. Acceptable — Track B's
  necessity/gap scoring (not Track C) decides *what* to coin; Track C only supplies the inventory.
- **Agent etymology quality.** Enrichment must be attested/plausible, not invented. Mitigation: the
  spec-compliance review checks each decomposition has a cited rationale and a legal recomposition.
- **Stale cached inventory.** `lang.morphemeInventory` is built once at init; Track C's accessors
  derive from the **live** lexicon (not the cached snapshot) so they stay current. (Whether Track B
  rebuilds the cached snapshot on coinage is a Track B decision.)
