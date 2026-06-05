# Track B — Gap-Driven Compositional Word Generation

> Spec for Track B of the Vector-Space-Native Overhaul
> (`docs/planning/VECTOR-SPACE-OVERHAUL-2026-06.md` §4). Wave 2. Depends on Track A (done) +
> Track C (done — supplies `languageMorphemes(lang)`).

Status: **COMPLETE (2026-06-05).** Shipped as B1 (`composeForGap`) + B4 (`MECHANISM_VECTOR_COMPOSITION`
wired into genesis, with a deliberate gen-30 re-baseline). B2 folded, B3 deferred (§7). Commits
`fad0749` → `121911b`. Full FAST suite green (1927 tests); RUN_SLOW GENN re-baked + reproduced.

---

## 0. Goal

Coin words by **composing morphemes in the vector space to fill semantic gaps** — the user's idea
#3 ("firewater = fire + water"): when a language needs a concept, build its form from the
morphemes whose **meaning points sum nearest** the concept's point, joined per the language's
morphology. Plus a **vector-density necessity** term (gaps in well-populated regions feel more
salient) and a **rare new-morpheme** path (mint a phonotactically-legal morpheme when no good
composition exists). This makes coinage emergent and compositional rather than opaque.

---

## 1. Architecture reality (read first) — what "gap-driven" means here

Roadmap §9 B1 says "pure gap-driven, **replace** concept-driven coinage," with coinage filling
*empty regions* of the space. That end-state assumes a **lexeme-entity lexicon** where a word's
identity is a POINT, so a word can exist at an arbitrary keyless point. **Track A did NOT flip the
lexicon** — it stays `Record<ConceptKey, Form>` (meaning points are a parallel layer). So coining
into a *keyless* empty point is not representable yet.

**Achievable, faithful Track B in the current architecture:** the "gap" is an **unlexicalised
concept key** that sits in a reachable region; necessity is **vector-density-aware**; and the
coinage **mechanism is vector-compositional** (`nearestComposition` over `languageMorphemes`). This
delivers the heart of idea #3 (compositional, gap-filling, rare new morpheme) without the lexeme
flip. The translator already never coins on demand (the grounding rung ships), satisfying the B1
consequence.

> **Deferred (with reason):** coining into *keyless* points (true "empty region" lexemes) needs the
> Track A lexeme-entity flip. Out of scope for Track B; logged as a future Track-A extension.

---

## 2. Mechanism

### 2.1 Vector-composition coinage (`composeForGap`) — the core

> **Additivity caveat (decided 2026-06-05).** `nearestComposition` (Plan-1) minimises squared
> distance to the **sum** of morpheme points. That is correct for the *additive-by-construction*
> baked space (affixes solved as residuals so `Σ = word`), but **raw GloVe root anchors are not
> additive** — `lava`'s anchor ≠ `fire + stone`. Greedy sum-search therefore overshoots the target's
> magnitude and almost always returns a single part. So v1 composes from the **nearest *related*
> morphemes** (individually closest in *direction* — cosine), which is the realistic kenning model
> (water-eye = tear, fire-stone = lava) and robust. `nearestComposition` stays the right tool for
> additive/affixal composition (a later track), not arbitrary-root coinage.

For a target concept `m`:
1. `target = meaningPointFor(lang, m)` (its current point).
2. `roots` = `languageMorphemes(lang)` filtered to open-class **roots**, excluding `m` itself.
3. Rank roots by `cosineFixed(target, root.point)` descending; keep those clearing
   `GAP_RELATEDNESS_COS` (genuinely related); deterministic tie-break by id.
4. **Accept** iff ≥2 qualify: take the top-2 (`partA` = nearest = head, `partB` = next). Assemble
   the form by concatenating their **live forms** (modifier+head order, head-final default).
5. **Reject** (→ `null`, falls to the rare new-morpheme path) if <2 related roots, the form exceeds
   `GAP_MAX_FORM_LEN`, or it fails the language's phonotactic floor (`langPhonotacticScore`).
6. Return `{ form, parts: [partA.id, partB.id] }` or `null`. Deterministic (no RNG) — same lang +
   meaning → same parts.

### 2.2 Rare new-morpheme (`coinNovelMorpheme`)
With low probability, OR when `composeForGap` finds no acceptable ≥2 composition: mint a brand-new
morpheme — sample a phonotactically-legal form from the language's syllable structure
(reuse the existing root/templatic samplers) and use it as one part, completing the rest by
composition. This grows the morpheme inventory organically (the new form becomes a real lexeme that
later coinages can reuse). v1: the novel morpheme's "meaning" is just the target's residual region;
we don't persist a separate morpheme-point store (the form enters the lexicon as the coined word).

### 2.3 Vector-density necessity (gap term in `lexicalNeed`)
Add a term to `lexicalNeed` for an **unlexicalised** concept `m`: `density(m)` = how many
lexicalised concepts sit within radius `r` of `meaningPointFor(lang, m)`. A gap in a *well-populated*
region is more salient (the language has the semantic neighbourhood to feel the hole) → higher need.
Scaled small so it nudges, not dominates, the existing cluster/sister/topic signals.

---

## 3. Wiring

A new genesis mechanism `MECHANISM_VECTOR_COMPOSITION` (in `genesis/mechanisms/`) wraps
`composeForGap` (+ the rare new-morpheme path) and is added to the `MECHANISMS` list consumed by
`tryCoin`. It returns `{ form, sources: { partMeanings } }` like `MECHANISM_COMPOUND`, so the
genesis loop records its etymology and the Dictionary shows the composition. It is weighted to be a
*primary* compositional path (high `baseWeight`), biased up where the language has a rich morpheme
inventory.

**Determinism:** adding the mechanism + the necessity term changes coinage → the `GENN`
(gen-30 RUN_SLOW) trajectory shifts for presets that coin within 30 gens. **GEN0 is unchanged** (no
coinage at gen 0). This is a **deliberate, documented re-baseline** (the gate is realism, not
byte-identity — byte-identity-vs-old-baseline was dropped by the user). Re-bake procedure:
`RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline`, update the `GENN` hashes + a
justification comment. Reproducibility-determinism (same config → identical output) is preserved.

---

## 4. Plan breakdown

- **B1 — `composeForGap` (pure) + tests.** `semantics/gapComposition.ts`:
  `composeForGap(lang, meaning, seed)` per §2.1. Unit tests: a language with `fire`/`water`/`stone`
  composes a withheld target near their sum within tol; returns null when nothing composes; is
  deterministic (same seed → same parts); excludes the target itself. **No wiring → no re-baseline.**
- **B2 — rare new-morpheme.** `coinNovelMorpheme(lang, rng)` (reuse phonotactic/root samplers) +
  fold into `composeForGap`'s fallback. Tests: produces a legal form; deterministic. Still unwired.
- **B3 — vector-density necessity term** in `lexicalNeed`. Unit test on the term in isolation (a
  concept in a dense region scores higher than one in a sparse region). Unwired from the trajectory
  until B4 (or guard so B3 alone is GEN0-safe + only affects scoring).
- **B4 — wire `MECHANISM_VECTOR_COMPOSITION` into `MECHANISMS` + activate the necessity term;
  re-bake `GENN`.** Verify GEN0 byte-identical; re-bake GENN with a documented justification; run
  the full suite; confirm coined forms are legal + compositions surface in the Dictionary.
- **B-final — full-suite verification + completion record.** Confirm the realism gate (coined words
  are compositional, legal, gap-driven), determinism reproducible, planning docs updated.

---

## 5. Invariants & verification

- **Determinism:** GEN0 byte-identical (no seed/gen-0 change); GENN re-baked deliberately +
  documented; reproducibility preserved (re-run identical).
- **Agnosticism:** composition uses the language's own morphemes + morphology order; no English
  privilege (shared concept keys are fine).
- **Legality:** every coined form passes the language's phonotactic profile (reuse the existing
  `langPhonotacticScore` / epenthesis repair the genesis loop already applies).
- **Realism compass:** the principle is **compounding/“semantic transparency” word-formation** —
  new words built from existing morphemes whose meanings sum to the target (kennings, calques,
  "firewater"); the rare new morpheme models genuine lexical innovation.

## 6. Risks

- **Perf:** `nearestComposition` is O(maxParts²·|inventory|). Filter to roots + a small `MAX_PARTS`
  (2–3); if the full-suite run slows, pre-shortlist the K nearest roots to the target. Engine perf
  must stay reasonable (phonology dominates anyway).
- **Composition quality:** a vector sum can be semantically odd (the `GAP_COMPOSE_TOL` bar + the
  ≥2-part + legality gates filter the worst). Track B supplies the mechanism; necessity decides
  *what* to coin.
- **Re-baseline scope:** only `GENN` (and any other exact-form determinism lock) moves; audit for
  other snapshots during B4.

---

## 7. Completion record (2026-06-05)

**Delivered**
- **B1** (`ef18ce1`): `semantics/gapComposition.ts` — `composeForGap(lang, meaning)` composes a form
  from the two roots most *related* (cosine) to the concept's point (whale→fish+bird). Plus
  `hasEmbedding` (embeddings.ts) to gate out hash-vector targets/parts. Pure + deterministic.
- **B4** (`ea424fe`, `121911b`): `MECHANISM_VECTOR_COMPOSITION` added to the genesis mechanism list;
  parts restricted to real distributional concepts (`hasEmbedding`) + a 0.45 relatedness floor, so
  noisy abstracts decline to null and fall to other mechanisms. **All six presets re-baked at
  gen-30** (the mechanism fires within 30 gens for every preset — real, not inert). GEN0 unchanged.
- **B-final**: `vectorComposition_mechanism.test.ts` (wiring + behaviour). Full FAST suite green
  (249 files / 1927 tests); RUN_SLOW `meaning_layer_baseline` re-baked + reproduced (12/12).

**Scope decisions**
- **B2 (rare new morpheme) — folded.** The existing genesis cascade already mints novel forms
  (ideophone etc.) when composition fails, and `languageMorphemes` auto-includes coined words as
  future composable roots — so "grow the inventory organically" (§4 step 4) already holds.
- **B3 (vector-density necessity) — deferred.** Kept the re-baseline to one behavioral change for a
  clean, reviewable determinism diff. The existing `lexicalNeed` provides necessity; a vector-density
  gap term is a documented follow-up.

**Known limitation.** Composition quality is bounded by the GloVe-50 embedding's low-dimensional
noise; the `hasEmbedding` filter + 0.45 floor remove the worst (no grammatical/derived parts, noisy
abstracts decline), leaving sensible kennings (lion=bear+cat, coffee=wine+drink, island=lake+sea).

**Deferred (architecture).** Coining into *keyless* empty points (true "empty region" lexemes) needs
the Track A lexeme-entity flip; out of scope (§1).

**Next:** Track D (sound-change recalibration + prosody) — the last remaining overhaul track.
