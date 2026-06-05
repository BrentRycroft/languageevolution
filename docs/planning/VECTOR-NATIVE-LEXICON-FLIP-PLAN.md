# Vector-Native Lexicon Flip — Comprehensive Plan

> The foundational change the roadmap calls *"the largest data-model change in the project's history
> and the largest determinism re-baseline"* (`VECTOR-SPACE-OVERHAUL-2026-06.md` §1/§3/§10). This is
> **Directive 1**: the lexicon is no longer concept-keyed. Words become **points in vector space**;
> English concepts become a **fixed anchor coordinate system** the translator reads against.

Status: **PLAN — awaiting review.** Decisions locked (2026-06-05, below). Built to **delegate heavily
to subagents** (Wave 2 is one subagent per subsystem; bakes + UI + per-preset migration also delegate).

---

## 0. Locked decisions

- **D-identity → POINT-NATIVE LEXEMES.** A word's identity is its **position** in the space (+ its
  form), not an English concept key. (User directive 1.)
- **D-anchors → ENGLISH CONCEPTS ARE A FIXED ANCHOR SET.** The English concepts are keyed points in
  the space — the coordinate system the translator reads against — and belong to **no preset**. They
  do not evolve. (User: "anchors in vector space… not part of any preset.")
- **D-knowledge → RE-EXPRESS CONCEPT KNOWLEDGE DIMENSIONALLY.** Concept knowledge lives **in the
  dimensional space**, not in discrete gloss tables. Two forms, both dimensional:
  **(a) categorical** facts (POS, animacy, abstractness, register, taboo-ness, basic-ness) become
  **LABELED, interpretable dimensions** — reserved axes you can name and read off directly (the user:
  *"we can keep labeled dimensions… but they should be represented in a dimensional space"*);
  **(b) relational** facts (clusters, neighbours, colexification) become **geometry** (cosine /
  proximity) over the points. The curated tables survive only as the **seed coordinates** (the values
  on the labeled axes + the anchor positions). (User Q1 + the labeled-dimension refinement.)
- **D-gloss → EMERGENT.** A lexeme's English label = its **current nearest anchor**; a word that
  drifts into a new region re-labels. (User Q2.)
- **D-coinage → POINT-NATIVE + NOISY ALLOWED.** Coinage places a lexeme at a point (keyless coinage
  now possible — Track B's deferred half); not gated on tidy relatedness. (User directive 2.)
- **D-archive → KEEP THE OLD SYSTEM.** The concept-keyed implementation is archived (code + docs),
  not deleted, so we can revert. (User directive 2.)

---

## 1. Target data model

### 1.1 The anchor space (fixed coordinate system)
```
Anchor { concept: string; point: Vec }   // Vec = Int32Array: lexical (GloVe-50) + LABELED feature dims
ANCHORS: Anchor[]                          // ≈ today's EMBED_TABLE, EXTENDED with labeled dims
```
- The **lexical dims** are the shipped GloVe-50 (exists). The **labeled feature dims** carry the
  categorical concept knowledge as named, interpretable axes — POS (noun/verb/adj/…), animacy,
  abstractness, valence (a valence readout axis already exists), register/formality, taboo-ness,
  basic-ness. They live in the reserved grammatical-dims region (`vec.ts` GRAMMATICAL_DIMS, currently
  8 and zero — **may widen** to fit the labeled set; see §8). Anchors are **baked** so each axis holds
  the curated value (POS one-hot/score, etc.); POS/register/taboo become a *readout of the relevant
  labeled axis*, not a noisy distributional inference. Anchors never evolve; they are the frame.

### 1.4 Labeled vs lexical dims (the representation)
- **Labeled dims** = interpretable, named axes for categorical knowledge (you can ask "what's this
  word's POS?" = read the POS axis). Baked from the curated tables; orthogonal to the lexical dims so
  they don't pollute the GloVe semantics or the nearest-anchor readout.
- **Lexical dims** = the GloVe-50 distributional meaning; relational queries (clusters/neighbours)
  are cosine geometry over these (optionally weighted with the labeled dims).
- A lexeme's point spans **both**; drift can move it along lexical dims (meaning shift) and, where
  modelled, along labeled dims (e.g. a noun→verb conversion nudges the POS axis).

### 1.2 The lexeme (per-language, point-native)
```
Lexeme {
  id:        stable id              // identity — NOT a gloss
  point:     Vec                    // position (lexical + grammatical); drifts
  spread:    number                 // breadth / polysemy radius [roadmap A2]
  form:      WordForm               // phonemes; sound-changes
  morphs:    MorphRef[]             // composition (root + affixes) [A1]
  frequency: number                 // Zipfian usage (a scalar attribute, not concept-key)
  register, wordOrigin, bornGeneration, suppletion?, …
}
```
- **Gloss is emergent:** `glossOf(lexeme) = nearestAnchor(lexeme.point).concept`.
- The existing form-centric `lang.words` / `WordSense` table (senses already carry optional
  `point`/`spread` from Track A Plan 6) is the **seed** of this entity — Wave 1 promotes the point to
  first-class identity rather than introducing a parallel structure.

### 1.3 What stays a scalar/attribute (not geometry)
Frequency (usage, orthogonal to meaning), suppletion (irregular surface forms), register, and
born-generation are **lexeme attributes**, not concept-knowledge — they stay as fields, not vectors.
"Re-express in vector space" applies to **concept knowledge** (what a word means / how it relates),
not these bookkeeping scalars.

---

## 2. Re-expressing the gloss-keyed subsystems as geometry (the Wave-2 delegable units)

Each gloss-keyed table is replaced by a **dimensional** form: **categorical** knowledge → a read of a
**labeled axis**; **relational** knowledge → **geometry** over the points. The curated knowledge is
baked into anchor coordinates once, then read dimensionally. **Each row below is one subagent unit.**

| Subsystem (today) | Vector-native form | Kind | Bake (one-time) |
|---|---|---|---|
| `posOf(gloss)` (POS sets) | `posOfPoint(point)` = read the **labeled POS axis/axes** | labeled | bake each anchor's POS axis from the curated POS sets |
| taboo dangerous-referent set | `isTaboo(point)` = read the **labeled taboo axis** above threshold | labeled | bake a taboo-ness axis on dangerous anchors |
| register / `BASIC_240` / tier | read the **labeled register / basic-ness axis** | labeled | bake those axes from the curated flags |
| `SEMANTIC_CLUSTERS` (gloss groups) | `clusterRegionOf(point)` = anchors within radius `r` / nearest centroid | geometry | derive centroids from member anchor points |
| `neighborsOf(gloss)` (`SEMANTIC_NEIGHBORS`) | `nearestAnchors(point, k)` by cosine | geometry | none (pure geometry) |
| `DERIVATION_TARGETS` + affixes | derivation = `base.point + affixOpVector`; targets = reachable points | geometry | factor affix operation-vectors (Track C machinery) |
| colexification / merge | two lexemes whose points are within `ε` colexify | geometry | none (geometry) |

**Principle:** the curated linguistic knowledge is not thrown away — it is **projected into the
anchor coordinates** (grammatical dims, region flags, affix vectors) once, then every runtime query
is geometric. This is the purist re-expression that still preserves attested typology.

> **Honest risk (logged):** GloVe-50 is low-dimensional and noisy; geometry will sometimes disagree
> with the curated tables (e.g. POS readout misclassifies a noun). Mitigations: the 8 grammatical
> dims give POS a *clean orthogonal* signal (baked, not distributional), so POS stays reliable;
> lexical-semantic queries (clusters/neighbours) accept the noise per directive 2.

---

## 3. Staging (waves) — with delegation tags

`[S]` = serial backend (controller / one careful subagent). `[D]` = delegable (parallel subagents).

### Wave 0 — Anchor space + geometric primitives  *(foundation)*
- **0a [S]** `semantics/anchors.ts`: the `ANCHORS` table (wrap `EMBED_TABLE`) + `nearestAnchor(point)`,
  `anchorsWithin(point, r)`, `kNearestAnchors(point, k)`. Pure, deterministic, no engine change yet.
- **0b [D]** Bake the **grammatical dims** of every anchor from the curated POS sets (+ a coarse
  animacy/abstractness axis if cheap). One subagent: emit `anchorGrammaticalData.ts`.
- **0c [D]** `posOfPoint`, `clusterRegionOf`, `nearestConcepts` geometric queries + unit tests
  (golden: each returns the SAME answer as today's gloss table for the seeded anchors). One subagent.
- *Determinism: none (additive, not wired).*

### Wave 1 — Lexeme entity + emergent gloss + read seam  *(serial, the storage flip)*
- **1a [S]** Promote `point` to first-class lexeme identity on the `lang.words`/sense entity; add
  `glossOf(lexeme)=nearestAnchor(point)`; build a `point→lexeme` / `anchor→lexeme` index.
- **1b [S]** Re-implement the access seam (`lexGet`/`lexKeys`/`lexHas`/`lexSet`/order contracts) on
  the lexeme entity + anchor index, **preserving the order contract** (determinism footgun — §5).
  Glosses become emergent (nearest-anchor) rather than stored keys.
- **1c [S]** Persistence: read old ConceptId/gloss saves → lexeme entities (migration, §4).
- *Determinism: FULL re-baseline (storage + order). Deliberate; documented.*

### Wave 2 — Re-express each subsystem as geometry  *(HEAVILY DELEGABLE — one subagent per row of §2)*
- **2a [D]** clusters → `clusterRegionOf`
- **2b [D]** neighbours → `kNearestAnchors`
- **2c [D]** POS → `posOfPoint` (grammatical dims)
- **2d [D]** derivation → affix operation-vectors
- **2e [D]** taboo → flagged regions
- **2f [D]** colexification/merge → ε-proximity
- Each: swap the gloss-table consumers to the geometric query; golden-test parity on seeded anchors;
  per-subsystem determinism re-bake. *Parallel-safe (different modules); serialize only the shared
  determinism-baseline updates.*

### Wave 3 — Drift / coinage / merge in point-space  *(serial backend)*
- **3a [S]** Drift moves the lexeme point (extends Track A glide); the **gloss re-labels** when the
  nearest anchor changes (emergent — D-gloss).
- **3b [S]** Coinage places a lexeme at a point — **including keyless points** (Track B's deferred
  half: coin into genuinely empty regions, noisy abstracts allowed — directive 2). Re-home Track B's
  `composeForGap` onto point-targets.
- **3c [S]** Merge/colexification = points converging within ε.
- *Determinism: re-baseline.*

### Wave 4 — Migration, UI, archive, final re-baseline  *(serial + delegable)*
- **4a [S]** Save-file migration finalised + round-trip tests (§4).
- **4b [D]** UI: Dictionary + translator show **emergent glosses** + the point/region; homonyms =
  same form, distant points (already surfaced). One subagent.
- **4c [S]** **Archive** the concept-keyed system: move the old `access.ts`/`conceptIdentity.ts`
  implementation + the gloss-keyed tables to `src/engine/_archived/concept-keyed/` (kept, not
  deleted; excluded from the build) + a note in `docs/planning/archive/`. (D-archive.)
- **4d [S]** Full determinism re-baseline of all locked hashes; realism scorecard is the gate.

---

## 4. Migration & persistence

- Old saves are **ConceptId/gloss-keyed**. A migration pass reads each entry, assigns it a lexeme
  with `point = meaningPointFor(old gloss)` (the gloss becomes the seed point), then drops the
  gloss-key. New saves are point-native. **Round-trip + old-save-load tests gate this.**
- Reproducibility-determinism (same config → identical output) is preserved throughout;
  byte-identity-vs-old-baseline is **not** (dropped by the user) — every locked hash is re-baked
  deliberately, wave by wave, with a justification comment (the established procedure).

## 5. Determinism footguns (must-read for every wave)

- **Order contract:** several RNG-coupled sites iterate the lexicon and draw per-word, so a word's
  draw position depends on iteration order (`access.ts` ORDER CONTRACT). The lexeme-entity seam MUST
  preserve a deterministic order (insertion + a canonical sorted order) or every form diverges
  uncontrollably. Port the existing `orderedLexiconKeys`/`orderedConceptIds` contract to lexeme ids.
- **No `Math.random`**; thread the seeded Rng; new draws appended after existing ones where a wave
  intends partial byte-identity.
- **Emergent gloss is a read-time function** — never stored as RNG-affecting state; the nearest-anchor
  lookup must not draw RNG.

## 6. Risks

- **Scale.** Larger than the entire overhaul so far; a multi-wave, multi-session arc. Stage hard;
  ship + re-baseline per wave.
- **POS reliability in 50-dim space** — mitigated by the **baked orthogonal grammatical dims** (POS is
  not left to noisy distributional inference).
- **Order-contract regressions** (§5) — the single most likely determinism break; golden order tests.
- **Bundle size** — anchor grammatical-dim data + affix vectors add data; quantize/lazy-load if needed.
- **Emergent-gloss churn** — many lexemes near an anchor boundary could flip labels noisily; `spread`
  + hysteresis on re-labeling may be needed (Wave 3 tuning).

## 7. Delegation summary (the subagent map)

- **Parallel now (after Wave 0a):** 0b, 0c (bakes + geometric primitives).
- **Parallel in Wave 2:** 2a–2f — one subagent per subsystem, the bulk of the work.
- **Parallel in Wave 4:** 4b (UI).
- **Serial (controller / one careful subagent):** Wave 1 (storage flip + seam + order contract),
  Wave 3 (drift/coinage), 4a/4c/4d (migration, archive, re-baseline). These touch determinism and the
  shared seam, so they are NOT parallelised.

## 8. Open questions (resolve before/early in execution)
- **Anchor set scope:** exactly which English concepts are anchors — the full `EMBED_TABLE`, or the
  curated `CONCEPTS` registry? (Affects readout granularity.)
- **Labeled-dimension set + width:** which categorical features get a labeled axis (POS, animacy,
  abstractness, valence, register, taboo, basic-ness) and how many dims total — the reserved
  grammatical region is 8 today and likely **widens** to fit them. POS may want several dims
  (one-hot per major class) vs a single ordinal axis. (Wave 0b — the first thing to pin down.)
- **Lexical vs labeled weighting** in relational geometry: do clusters/neighbours run on the lexical
  dims only, or the full point (so the POS axis pulls same-POS words closer)? (Wave 2a/2b.)
- **Re-label hysteresis:** does an emergent gloss flip immediately at the anchor boundary, or need a
  margin (use `spread`) so display doesn't flicker? (Wave 3.)
