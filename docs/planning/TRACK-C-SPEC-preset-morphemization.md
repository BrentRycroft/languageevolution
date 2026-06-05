# Track C — Preset Morphemization (per-preset morpheme FORM inventory)

> Spec for Track C of the Vector-Space-Native Overhaul
> (`docs/planning/VECTOR-SPACE-OVERHAUL-2026-06.md` §5). Wave 2. Depends on Track A (done).
> **Sequencing note (2026-06-05):** the user chose to run **Track C before Track B** — Track B's
> compositional coinage needs per-preset morphemes *with forms*, which only Track C produces.

Status: **DECISIONS LOCKED (2026-06-05).** Ready to decompose into plans (C0 backend → C1–C6
agent-per-preset → C-final).

---

## 0. Goal

Give **every preset** a first-class **morpheme inventory carrying phonological FORMS**, so a
word's surface can be expressed as a composition of morpheme forms in *that language*. This is
the foundation Track B consumes (its gap-driven coiner picks morphemes by **point**, then builds
the surface word from their **forms**), and it makes each preset's etymology explicit
(`computer` = *work*+*know* in Toki Pona, *carry*+*leaf* "wallet" in Romance, …).

Success (roadmap §11 C): every preset's vocabulary is morpheme-encoded; recomposed forms stay
phonotactically legal and match the seeded surface for fossilized entries (within tolerance);
Toki Pona stays consistent (it is already heavily morphemic); **determinism is unchanged.**

---

## 1. Locked decisions (2026-06-05)

- **C-point-model → OPTION A: FORMS-ONLY.** A concept's *meaning point* is universal (meaning
  keys are shared English concepts across all presets; only forms differ). Track C does **not**
  change `lexPoint`, drift, grounding, or any determinism-affecting path. It **adds** a per-preset
  morpheme inventory whose entries carry a shared **point** (root = concept anchor; affix =
  operation vector) plus a per-preset **form**. Existing words compose **forms**; point-additivity
  is reserved for Track B's *newly coined* words (where the coiner defines meaning = composition).
  → **Zero determinism re-baseline.** No locked GENN/meaning-layer hash moves.

- **C-authoring-depth → ENRICH EACH PRESET (agents).** One agent per preset adds
  etymologically-faithful decompositions (compounds + affixal derivations) over the shared concept
  keys, using that language's real morphology, so each language has a rich morpheme inventory for
  Track B. This is the parallelizable bulk work the roadmap flagged for agents.

---

## 2. What is UNCHANGED (the determinism firewall)

Track C must not move any locked hash. Concretely, it **does not touch**:

- `meaningPoint.ts` (`lexPoint` / `meaningPointFor` / `glideMeaningPoint`) — points stay global.
- `morphemeSpaceData.ts`'s **point data** for the English entry (the bytes `lexPoint` reads via
  `loadMorphemeSpace().wordPoints`). The English morpheme/word **points** stay byte-identical;
  English morphemes only *gain* a `form` field (additive — `lexPoint` never reads `form`).
- `drift.ts`, `grounding.ts`, the simulation step, genesis — none read the new form inventory.

A test asserts the English point data is byte-identical pre/post (§6). If any locked hash moves,
the change is wrong by construction.

---

## 3. Architecture

### 3.1 The per-preset morpheme inventory (the new artifact Track B consumes)

A baked, per-preset structure. Reusing the existing `MORPHEME_SPACE` schema, generalized to a
map keyed by preset and with a `form` on each morpheme:

```ts
// morphemeSpaceData.ts (generalized; AUTO-GENERATED)
export const MORPHEME_SPACES: Record<string, {
  morphemes: Array<{
    id: string;                 // concept key for roots, affix tag for affixes
    type: "root" | "prefix" | "suffix" | "infix";
    point: number[];            // shared semantic point (root = concept anchor; affix = op-vector)
    form: string[];             // THIS language's IPA form for the morpheme  ← NEW
  }>;
  words: Array<{
    meaning: string;            // concept key
    parts: string[];            // ordered morpheme ids whose FORMS compose this word's surface
    point: number[];            // composition point (English entry: byte-identical to today)
  }>;
}>;
```

- The **English** entry keeps today's `morphemes[].point` and `words[].point` **byte-identical**,
  and adds `morphemes[].form`. `loadMorphemeSpace()` (no arg) keeps returning the English entry,
  so `lexPoint` is unchanged.
- The other five presets (pie, germanic, romance, bantu, tokipona) are **new** entries.

### 3.2 Loader

```ts
// morphemeSpaceLoader.ts
export function loadMorphemeSpace(): LoadedMorphemeSpace;          // English, points only — UNCHANGED signature & result for lexPoint
export function loadMorphemeForms(preset: string): MorphemeFormInventory;  // NEW: per-preset {morphemes with forms, word part-recipes}
```

`MorphemeFormInventory` = `{ morphemes: Morpheme[] /* with real form */, wordParts: Map<meaning, string[]> }`.
`Morpheme` is the existing `morphemeSpace.ts` type `{ id, form, point, type }` — Track C finally
populates `form` (Track A baked `form: []`).

### 3.3 Where the data comes from (per preset, all from seed config)

For preset `P` with `cfg = preset<P>()`:

- **Root morphemes** = every concept that is (a) a recorded constituent of some
  `cfg.seedCompounds`/`cfg.seedDerivations`, plus (b) optionally every monomorphemic content word
  (so a word can reference itself as a 1-morpheme root). `point = lexPoint(concept)` (shared
  anchor); `form = cfg.seedLexicon[concept]`.
- **Affix morphemes** = `cfg.seedBoundMorphemes`. `form = cfg.seedLexicon[affixId]`. `point` =
  **operation vector** factored per-preset from `P`'s own `seedDerivations` (base+affix=word) via
  the existing `factorizeMorphemes` residual-mean recipe; **if `P` declares no derivation using
  that affix, its point = the zero vector** (a pure form affix — adds form, no semantic shift).
  This ties affix-vector richness to the agent enrichment (more derivations → real op-vectors).
- **Word recipes** = `cfg.seedCompounds[w].parts` and `[base, affix]` from `cfg.seedDerivations[w]`.

### 3.4 Bake pipeline

Generalize `scripts/build-morpheme-space.ts` to loop over all six presets and emit
`MORPHEME_SPACES`. Per preset it runs the §3.3 derivation. Out-of-vocab anchors (`embed()` hash
fallback) are deterministic and acceptable for v1 (a root whose concept has no GloVe token gets a
meaningless-but-stable point; Track B gap-filling near it is degenerate but harmless — flag in a
comment). The English entry's point rows must serialize byte-identically to the current file
(same sort order, same `factorizeMorphemes` inputs) so §2 holds.

---

## 4. Data flow

```
preset config (seedLexicon, seedCompounds, seedDerivations, seedBoundMorphemes)
        │  scripts/build-morpheme-space.ts  (offline bake)
        ▼
MORPHEME_SPACES[preset]  (morphemes {id,type,point,FORM} + words {meaning,parts,point})
        │  loadMorphemeForms(preset)
        ▼
MorphemeFormInventory   ──►  Track B coiner (nearestComposition over points → build form)
        │                ──►  Dictionary "morphemes" row (show composition with FORMS, per active language)
        ▼
   (English entry's POINT rows also feed lexPoint — UNCHANGED path)
```

---

## 5. Plan breakdown

### Plan C0 — Backend: generalize the schema + bake + loader to per-preset, with forms  *(serial)*
- Generalize `morphemeSpaceData.ts` → `MORPHEME_SPACES: Record<preset, …>`; add `form` to morphemes.
- Generalize `scripts/build-morpheme-space.ts` to emit all six presets (per-preset affix-vector
  factorization + zero-vector fallback; root form from `seedLexicon`).
- Add `loadMorphemeForms(preset)` to `morphemeSpaceLoader.ts`; keep `loadMorphemeSpace()` returning
  the English entry unchanged for `lexPoint`.
- Add the **determinism-firewall test**: English `morphemes[].point` + `words[].point` byte-identical
  to a frozen snapshot; a fast meaning-layer hash unchanged.
- Add a **per-preset bake-legality test**: every preset bakes without throw; every word recipe's
  parts resolve to inventory entries with non-empty forms.
- **Verify:** `npx tsc --noEmit`; `npx vitest run --dir src` morpheme + meaning-layer tests green;
  re-run the bake and confirm English point rows are byte-identical.

### Plans C1–C6 — Enrich one preset each  *(AGENT-DELEGABLE, one agent per preset)*
Presets: **english, pie, germanic, romance, bantu, tokipona.**
Each agent:
1. Adds etymologically-faithful `seedCompounds`/`seedDerivations` over the shared concept keys,
   using the language's real morphology (cite the attested etymology in a comment, as the existing
   entries do). English + Toki Pona are already rich → mostly verify + add forms.
2. Re-bakes (`npx tsx scripts/build-morpheme-space.ts`).
3. Verifies for that preset: recomposed compound forms are **phonotactically legal**
   (`isFormLegal`/`langPhonotacticScore`); for *fossilized* entries declared in `seedLexicon`, the
   recomposition matches the seeded surface within tolerance (or the entry is intentionally
   transparent); existing preset tests stay green; **no English point row changes** (determinism).
4. Stays within `seedConfig` — no engine logic, no `lexPoint` change.

> Bound the bulk: a sensible target is ~8–20 decompositions per preset (the family of transparent
> compounds + the productive derivational affixes the language already declares). Do **not**
> force-decompose genuinely monomorphemic roots.

### Plan C-final — Dictionary surface + cross-preset verification  *(serial)*
- Dictionary "morphemes" row reads `loadMorphemeForms(activePreset)` so it shows the **active
  language's** composition with forms (today it reads the English-only `morphemeBreakdown`).
- Cross-preset test: all six presets bake; all recipes legal; determinism firewall intact.
- Confirms §11 C success criteria. Hands off to **Track B**.

---

## 6. Invariants & verification

- **Determinism firewall (hard):** English point data byte-identical; no locked GENN/meaning-layer
  hash moves. (`meaning_layer_baseline.test.ts` unchanged.)
- **Phonotactic legality:** every recomposed compound form passes the preset's phonotactic profile.
- **Resolvability:** every word recipe's parts resolve to inventory entries with non-empty forms.
- **Agnosticism:** shared concept keys are fine; no preset privileges English structure; forms and
  decomposition patterns are the language's own.
- **Toki Pona consistency:** its rich existing compounds bake unchanged; no regression.

---

## 7. Deferred / out of scope

- **Per-preset semantic points** (Option B) — explicitly rejected (§1). A concept's meaning is
  universal; per-language points are a future track if ever needed, at the cost of a full re-baseline.
- **Affix stacking** (>1 affix per word) — `factorizeMorphemes` still throws on it (Track A v1
  limit). If a preset needs a stacked derivation, lift the factorizer in C0; otherwise leave it.
- **Runtime fossilization drift** of compound forms — Track C bakes from *seed* config (birth-time
  morphemization). Runtime drift of fossilized compounds is the existing engine behavior, untouched.
- **Track B wiring** — Track C only produces the inventory; Track B consumes it next.

---

## 8. Risks

- **Accidental point drift.** Any change to `factorizeMorphemes` inputs or sort order for English
  moves `lexPoint` → re-baseline. Mitigation: the byte-identity test in C0; English bake inputs
  frozen.
- **Bundle size.** Six preset entries grow `morphemeSpaceData.ts`. Mitigation: forms are short
  arrays; points are already int32 rows. Monitor against the 6 MiB PWA cap; quantize later if needed.
- **Agent etymology quality.** Enrichment must be attested/plausible, not invented. Mitigation: the
  spec-compliance review checks each decomposition has a cited rationale and a legal recomposition.
