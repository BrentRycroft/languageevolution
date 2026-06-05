# Track A — Vector-Space-Native Lexeme Model (Spec)

Status: **DRAFT for review.** Detailed design for Wave-1 Track A of the vector-space overhaul
(`VECTOR-SPACE-OVERHAUL-2026-06.md`). All 6 cross-cutting decisions are locked (§9 there);
this spec turns the foundational track into something an implementation plan can be written
against. Nothing implemented yet.

---

## 0. One-paragraph summary

Make a word's **meaning a point in a vector space** instead of an English concept key, and
make a word a **composition of morpheme-points** that sum to that point. We do *not* build a
new entity from scratch: the engine already has a form-keyed `Word` with multiple `senses`
and `morphStructure` (`types.ts`), and a meaning-keyed *view* over it behind the `access.ts`
seam. Track A (1) gives each sense a fixed-point **meaning vector + spread**, (2) adds a
**morpheme inventory** whose vectors compose additively to sense points, (3) keeps the
gloss→form access API **byte-identical** through a storage flip (the proven R2 playbook),
then (4) flips behaviour — drift moves points, homonyms become distinct lexemes — under one
deliberate, documented determinism re-baseline.

---

## 1. Scope boundary (what Track A is and is NOT)

**In scope**
- Promote `WordSense` to carry a **meaning vector (`point`) + `spread`** (A2). The existing
  `meaning: Meaning` field becomes a *denormalised nearest-anchor label* derived from `point`.
- The **additive-by-construction space** (A1): dimensionality, GloVe seeding, fixed-point
  representation, reserved (unused) grammatical dimensions (E1).
- A **morpheme inventory** + the composition invariant `sense.point ≈ Σ morpheme.point`.
- The **factorization solver** as offline tooling — built and validated **on one preset**.
- **Homonymy** (distinct lexemes, same form, distant points) and **polysemy** (one sense,
  point + spread).
- **Access seam**: keep `lexGet/lexHas/lexSet/lexKeys/…` byte-identical; add point-aware APIs.
- **Persistence + migration** (concept-keyed saves → lexeme entities) and the **re-baseline plan**.
- Minimal consumer updates: drift (moves points), translator (nearest-lexeme), UI (composition
  + homonym sets), persistence.

**Out of scope (later tracks)**
- Gap-driven generation — **Track B** (A only provides the substrate).
- Bulk per-preset morphemization — **Track C** (A builds + proves the *recipe* on one preset).
- Sound-change recalibration, the `frequency_direction` red, stress/prosody — **Track D**.
- Grammatical *composition behaviour* — **Track E** (A only *reserves* the dimensions).

---

## 2. Where we're starting from (the existing seam)

- `Language.lexicon: Record<ConceptId, WordForm>` is the canonical store; **every access goes
  through `access.ts`** (`lexGet/lexKeys/lexSet/…`). The "R2 re-key" already flipped this store
  from gloss-keyed to ConceptId-keyed **byte-identically** — call sites never noticed. Track A
  is the same kind of flip, one level deeper.
- `Language.words?: Word[]` already exists: `Word { form, formKey, senses: WordSense[],
  primarySenseIndex, morphStructure? }`, `WordSense { meaning, weight, register, bornGeneration,
  origin }`. **Form is already an index key (`formKey`), and a form already carries multiple
  senses.** Homonymy and polysemy are *almost* expressible today — what's missing is a
  *position* for each sense and a rule for which senses are "the same word."
- `WordMorphStructure { origin, parts?, base?, affix? }` already records decomposition by
  *meaning string*. Track A adds the *vector* layer on top of this.
- The embedding (`embeddingData.ts`) ships 2,244 int8-quantized GloVe-50 vectors keyed by
  concept; `embed(meaning)` resolves them. `nearestLexicalisedMeaning` / `readoutProfile`
  (shipped this session) are the point-distance + axis-readout primitives we reuse.

**Implication:** Track A is *extension*, not greenfield. The lexeme = a `WordSense` with a
position; the `Word` groups senses sharing a `formKey`.

---

## 3. Data model

### 3.1 Vector representation (determinism-critical)
- A vector is **fixed-point integers**: `Int16Array` of length `D`, each component = round(value
  × `SCALE`), `SCALE = 4096`. All vector arithmetic (sum, dot, distance) is integer → identical
  on every platform. (Extends the existing int8 embedding approach; int16 gives composition
  headroom so sums don't saturate.)
- `D = 50 (lexical, from GloVe) + G (grammatical, reserved for E)`, `G ≈ 8` and **zero-filled /
  unused in Track A**. Reserving them now means E adds no dimensionality migration later.

### 3.2 Lexeme = a positioned sense
Extend `WordSense`:
```
WordSense {
  meaning: Meaning        // DENORMALISED nearest-anchor label (derived from point) — display/back-compat
  point:   Vec            // NEW — the meaning position (the identity)
  spread:  number         // NEW — region radius (A2): broad vs narrow word
  weight, register, bornGeneration, origin   // unchanged
}
```
- **Identity = `point`.** `meaning` is recomputed as the nearest anchor to `point` (for the
  Dictionary, translation grounding, and every gloss-keyed satellite map that still exists).
- **Polysemy (A2):** one sense with a `spread` large enough to cover several anchors. Broadening
  grows `spread`, narrowing shrinks it, metaphor moves `point`.
- **Homonymy (#5):** two senses under the **same `formKey`** whose points are **far apart**
  (distance > a homonymy threshold `H`). They are distinct lexemes that merely share a form.
  *Rule:* senses of one `Word` whose points are within `H` are polysemy; beyond `H` they are
  homonyms. (This reuses the existing multi-sense structure — no new collection.)

### 3.3 Morpheme inventory
```
Language.morphemes?: Morpheme[]
Morpheme {
  id: string
  form: WordForm
  point: Vec                                   // its position in the SAME space
  type: "root" | "prefix" | "suffix" | "infix"
  bornGeneration: number
}
```
- `WordMorphStructure` keeps `parts/base/affix` but those now reference **morpheme ids**.
- **Composition invariant:** for a compositional sense,
  `sense.point == Σ over morphs of morpheme.point` (exact in fixed-point, by construction).
- **Escape hatch:** suppletive / non-compositional senses (`go/went`) carry `compositional:
  false` and store `point` directly; the invariant is not asserted for them.

---

## 4. The additive-by-construction space (A1)

### 4.1 Seeding
- A **root** morpheme's `point` = the fixed-point GloVe vector of its anchor concept.
- A single-root word composes trivially: `sense.point = root.point` (invariant holds for free).
  **Most migrated words start as single-root lexemes** — this makes the flip tractable.

### 4.2 Affix vectors via factorization (the solver, offline tooling)
- Where words decompose (authored: `behind=be+hind`, `firewater=fire+water`, PIE `*akʷ-`; later
  bulk: Track C), solve for affix `point`s minimising
  `Σ_words ‖ anchor(word) − Σ morphemes ‖²` (constrained least-squares; deterministic;
  fixed-point rounded). A consistent `v(-er)` emerges = the shared "agent-of" offset.
- Built as a **bake script** (`scripts/build-morpheme-space.ts`, mirroring `build-embedding.ts`)
  → emits a deterministic baked artifact. **Track A runs it for ONE preset** (recommend English
  or PIE) to validate end-to-end; **Track C** scales it to all presets via agents.

### 4.3 Composition + search primitives (used by B later, defined here)
- `compose(morphemeIds): Vec` = fixed-point Σ of points.
- `nearestComposition(target: Vec, inventory, maxParts): morphemeIds` — Track B's gap-filler;
  **defined and unit-tested in A, exercised in B.**

---

## 5. Access seam & new APIs

- `lexGet/lexHas/lexSet/lexKeys/lexValues/lexEntries/lexSize/lexDelete` — **signatures
  unchanged.** Behind them, resolve gloss → lexeme (`formKey`, sense) → form. The denormalised
  `sense.meaning` label keeps the gloss-keyed satellite maps (`wordFrequencyHints`, `registerOf`,
  `conceptIds`, …) working untouched.
- New point-aware helpers (additive, used by drift/translator/UI/B):
  - `lexPoint(lang, m): Vec` — the meaning point for a gloss.
  - `nearestLexemes(lang, point, k): SenseRef[]` — point-distance lookup over the lexicon.
  - `homonymsOf(lang, formKey): SenseRef[]` — senses sharing a form (split into poly/homonym by `H`).
  - `morphemesOf(lang, sense): Morpheme[]` and `compose(...)` from §4.3.

---

## 6. Determinism & re-baseline plan

> **REVISED 2026-06-04 (owner steer): byte-identity vs the old baseline is NOT a goal —
> pursue it only where it is free.** The earlier cautious "inert byte-identical storage flip
> (A.1) then behaviour flip (A.2)" split is dropped: keeping the whole flip byte-identical
> carries a real tradeoff (it forces the two-phase split and an artificially behavior-neutral
> implementation), so we don't. The flip is done directly and the locked hashes are
> re-baselined once, deliberately. **Reproducibility (same seed → identical output every run)
> remains a hard invariant** — guaranteed by fixed-point integer vectors — and is re-confirmed
> at each re-baseline.

The work is sequenced so the FREE (no-re-baseline) parts and the RE-BASELINE parts are
separated by *plan*, not by an artificial inert phase:

- **A.0 — Tooling (no engine change).** Bake script + validation-preset morpheme vectors.
  Pure offline. Zero test movement. *(Plans 1–2 — done.)*
- **The flip (one deliberate re-baseline).** `lexPoint` becomes the meaning's position and the
  drift hot-path navigates it; later, points become mutable (metaphor moves the point,
  broaden/narrow move `spread`) and homonyms surface as distinct lexemes. `meaning_layer_baseline`
  GENN + the affected determinism tier are re-baselined deliberately. *(Plan 3 = the drift flip;
  Plan 5 = mutable points + homonymy.)*
- **Read-only consumers (FREE — no re-baseline).** The Dictionary morpheme display and the
  translator grounding read `lexPoint` but never run inside `sim.step()`, so they stay
  byte-identical for free. *(Plan 4.)*

> The `frequency_direction` RUN_SLOW red is **NOT** addressed here — it is Track D's.

---

## 7. Migration

- **Presets:** each seed word → a `Word`/`WordSense` at its anchor point; authored decompositions
  populate `morphStructure` + the morpheme inventory. Bulk auto-factorization is Track C; in A,
  un-decomposed words are single-root lexemes (trivial composition).
- **Saves:** a **versioned persistence migration** (same pattern as prior save migrations) reads
  concept-keyed files and builds lexeme entities at anchor points; serialises vectors as
  fixed-point ints. Round-trip test added.

---

## 8. Consumers updated in Track A (kept minimal)

| Consumer | Change | Phase |
|---|---|---|
| `semantics/drift.ts` | move `point` / adjust `spread` instead of re-keying meanings | A.2 |
| `translator/*` (`lookup.ts`, grounding) | resolve by nearest **point**; extends the rung shipped this session | A.2 |
| `ui/DictionaryView.tsx` | show a word's **morpheme composition** + its **homonym set** (already shows nearest words + axes) | A.1/A.2 |
| `persistence/*` | versioned migration + fixed-point vector (de)serialisation | A.1 |

Genesis stays concept-driven until **Track B** replaces it (B1); A does not touch coinage
behaviour beyond keeping it working through the seam.

---

## 9. Testing & success criteria

- **A.0:** bake script is deterministic (same input → byte-identical artifact); composition
  invariant holds on the validation preset (`sense.point == Σ morphemes`, fixed-point exact).
- **A.1 (hard gate):** `meaning_layer_baseline` **byte-identical**, GEN0 + GENN; full fast tier
  green; tsc clean. New unit tests: lexeme model, point-aware access helpers, homonymy split by
  `H`, persistence round-trip.
- **A.2 (re-baseline gate):** deliberate, documented `meaning_layer_baseline` GENN re-baseline;
  homonyms exist as distinct lexemes in a run; broadening/narrowing visibly change `spread`;
  Dictionary shows composition + homonym sets; translation still resolves; reproducibility
  re-confirmed (same config → identical output).
- **Success = the substrate is real and inert-safe:** every word is a positioned, composable
  lexeme; the model is proven on one preset; nothing downstream is blocked from Tracks B/C/D.

---

## 10. Open questions (smaller than the roadmap's — resolve while spec'ing the plan)

1. **Homonymy threshold `H`** and **initial `spread`** for migrated words (seed from sense
   count / frequency?). Needs a quick empirical calibration on the validation preset.
2. **Validation preset choice** for A.0/A.1 — English (richest morphology, most authored
   decompositions) vs PIE (cleanest roots). Recommend **English**.
3. **`G` (grammatical dimension count)** to reserve now for E. Recommend **8** (room for
   tense/aspect/mood/number/case/person/gender/definiteness) — cheap, avoids a later remap.
4. **Bundle size**: int16 morpheme vectors + reserved dims grow the baked data past the current
   6 MiB PWA cap. Mitigation: lazy-load the morpheme artifact (the province-raster lazy-load
   follow-up applies here too). Confirm acceptable or schedule the lazy-load first.
```
