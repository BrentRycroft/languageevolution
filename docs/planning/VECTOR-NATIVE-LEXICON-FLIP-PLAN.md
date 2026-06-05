# Vector-Native Lexicon Flip — Comprehensive Plan

> The foundational change the roadmap calls *"the largest data-model change in the project's history
> and the largest determinism re-baseline"* (`VECTOR-SPACE-OVERHAUL-2026-06.md` §1/§3/§10). This is
> **Directive 1**: the lexicon is no longer concept-keyed. Words become **points in vector space**;
> English concepts become a **fixed anchor coordinate system** the translator reads against.

Status: **IN EXECUTION (2026-06-05).** Decisions locked (below). Built to **delegate heavily to
subagents** (Wave 2 is one subagent per subsystem; bakes + UI + per-preset migration also delegate).

**Progress log:**
- **Wave 0 — DONE (2026-06-05).** 0a `anchors.ts` (anchor table + nearestAnchor/anchorsWithin/
  kNearestAnchors, `b7c5baa`); 0b `anchorLabeled.ts` (8 labeled dims baked from CONCEPTS + surgical
  `isTabooReferent` export, `613b39b`); 0c `anchorQueries.ts` (`posOfPoint` argmax over labeled POS
  dims — **POS golden parity 100%/2247**; `clusterRegionOf` lexical-geometry centroids — cluster
  parity 58.7%, `ae6ee3f`). Purely additive; determinism byte-identical (simulation.test green).
- **Wave 2b — neighbours DONE (2026-06-05, `7d39920`).** `neighborsOf` switched to geometry
  (`geometricNeighbors` = 3 nearest anchors) for grounded meanings; curated `SEMANTIC_NEIGHBORS` kept
  as ungrounded fallback + reversible source. Semantic drift + genesis coinage pools now vector-native.
  Re-baked all 6 GENN (GEN0 unchanged); 2 FAST tests updated (dog/cat now related → dog/stone;
  river→rain-water for the neighbor rung). FAST 1987 green; RUN_SLOW reproduces. Subagent-driven
  finalization (fix + re-bake), controller-verified.
- **Wave 2a — clusters switch ATTEMPTED + REVERTED (2026-06-05, NEEDS DECISION).** Switched
  `clusterOf` to hybrid geometry (`clusterRegionOf`) like neighbours; tsc clean, but the FAST suite
  showed **4 failures revealing a structural realism cost**: geometric clustering (59% parity)
  **scatters coherent semantic fields** — `taboo_clusters > "core body meanings cluster together"`
  fails because body-part GloVe vectors don't all sit nearest the `body` centroid; plus
  `cluster_expansion` (clusterOf-via-curated lock) and a `genesis` compound-parts assertion. Clusters
  are a CENTRAL typological scaffold (drift/coinage/abstraction/analogy/borrowing all read them), so
  scattering them is different in kind from the peripheral neighbour noise. **Reverted** to keep the
  tree green (`dfdda6a`). **OPEN: how to treat clusters/taboo (the field-coherence signals) —**
  (A) force the full geometric switch (accept field scattering, update/loosen the realism tests);
  (B) keep clusters+taboo CURATED (a deliberate typological scaffold) while the more peripheral
  signals (neighbours/drift) go geometric; (C) blend (geometry biases, curated backbone). The
  one-function switch is re-appliable instantly once decided.
- **Wave 1 — IN PROGRESS (2026-06-05).** 1a `glossOf`/`senseGloss` emergent-gloss primitives —
  seed parity `glossOf(lexPoint(c))===c` **99.6%/2247** (`0fa15a8`). 1b `anchorIndex.ts`
  (`anchorIndexOf`/`glossOfWord`/`findWordByEmergentGloss`) + hybrid `effectiveGloss` — point-native
  "what means X" lookup; seed lookup parity vs `findPrimaryWordForMeaning` **99.2%/637** English
  (`a75bb62`). Both additive, determinism byte-identical. Remaining 1b/1c: see below + §3.

> **⚠ FINDING — anchor-coverage gap (logged 2026-06-05; affects D-anchor-set).** The plan assumed
> the CONCEPTS registry (2,247) anchors *every* preset word. It does not: **24–39% of each preset's
> primary meanings have no GloVe anchor** (english 61% anchored, tokipona 66%, bantu 75%, pie 76%).
> Two kinds of orphan: **(1) closed-class function words** (`the`/`and`/`not`/`in`…) — these have no
> *lexical* anchor by nature; their identity is grammatical (the labeled POS=closed dim), correct to
> leave unanchored. **(2) basic content words missing from the curated registry** (`house`/`body`/
> `door`/`person`/`man`/`woman`/`feather`/`wing`/`horn`/`tail`/`ocean`/`time`/`city`/`window`…) —
> GloVe *has* these; they were simply never added to the 2,247 set, so they sit on a hash point that
> glosses to noise (`house`→`hypothesise`). **Interim resolution (shipped, green, lossless):** hybrid
> `effectiveGloss` — emergent gloss for direct anchors + placed points; compounds keep their
> structural key; orphans keep their authored key until placed. **OPEN DECISION (user):**
> **(A) Extend coverage** — regenerate `embeddingData.ts` (via `scripts/build-embedding.ts`) + register
> the missing *content* words so they get real anchors (a one-time data build + determinism
> re-baseline; makes the flip purer per the Q1 "everything in vector space" preference); vs
> **(B) keep the permanent hybrid** (function words stay grammatical-identity; content gaps keep their
> authored key). The waves proceed on the hybrid either way; (A) only *raises coverage* and is a clean
> drop-in later. Recommend **(A) for content words**, since the purity goal needs `house`/`body`/`door`
> to have anchors — but it is the user's call and is logged here rather than silently chosen.
>
> **USER DECISION (2026-06-05):** **(A) Extend embeddings** + **FULL switch**. Register the orphan
> *content* words (226 found across the 6 presets; ~150 genuine common words after excluding
> pronouns/adverbs + preset-internal compound keys) and regenerate `embeddingData.ts` from GloVe-50 so
> they get real anchors; closed-class function words stay unanchored (grammatical identity). The Wave 2+
> live-switches are **FULL** — consumers switch to pure geometry; the **realism scorecard is diagnostic
> only, NOT a gate** (noise accepted, old system archived/reversible). Sequencing: extend coverage FIRST
> (so geometry runs on good coverage, not hash points), then the full switch, then Wave 3/4.
>
> **Implementation (2026-06-05, byte-identity explicitly waived by user):** chose the LOW-RISK
> realization — `scripts/build-anchor-extras.ts` emits `anchorExtrasData.ts` (179 basic content words,
> real GloVe-50 vectors) as **anchor extras**, NOT registry concepts. `embed`/`hasEmbedding` fall back
> to them (the words get real points) and `ANCHORS` includes them (they become anchor targets), but the
> sim's coinable `CONCEPTS` pool is untouched — so tiering/frequency/capacity tests don't break; only
> the affected words' meaning POINTS change (a contained GENN re-baseline). `house`/`body`/`door`/
> `person`/`time` now anchor to themselves. (Registering them as full sim concepts is a possible future
> step if coinability is wanted.)
>
> **Re-baseline impact (2026-06-05):** FAST suite stayed green except 2 expectation updates —
> `translator_polish` ("angry" now GROUNDS via colexification instead of coin/quote: an improvement)
> and `syntactical_modules` (a seeded word-order module legitimately drifted over 30 gens → assert the
> wordOrder CATEGORY, not the specific value). RUN_SLOW: all 6 GENN gen-30 hashes re-baked (GEN0
> byte-identical); realism scorecard passes (diagnostic-only). **Accepted realism trade-off:**
> `frequency_direction` (Zipfian "high-freq content words drift LESS") softened from ~5/8 seeds to ~3/8
> — giving 179 mostly-high-frequency content words real semantic activity slightly raised their form
> drift, neutralising the few-percent conservatism margin (pooled high≈low, noise-level). Test
> downgraded from a strict directional vote to a pooled "no MATERIAL over-erosion (≤5%)" guard. Logged
> as accepted per the user's "willing to take the risk / reversible" direction.

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
- **D-anchor-set → THE CONCEPTS REGISTRY (2,247).** Anchors = the curated `CONCEPTS` registry; each
  anchor's **point** comes from `EMBED_TABLE` (2,244 have a real GloVe vector; the 3 without use the
  hash fallback) and its **labeled-dim values** from its `CONCEPTS` metadata. (EMBED_TABLE alone has
  positions but no POS/tier/etc. to bake the labeled dims; the registry is the only source of both.)
  (Locked 2026-06-05.)
- **D-labeled-dims → THE 8 RESERVED DIMS, ALLOCATED (no widening to start).** Baked from `CONCEPTS`:
  `[0..3]` **POS** one-hot (noun / verb / adjective / closed-class; `posOfPoint` = argmax),
  `[4]` **tier** (0–3 ordinal), `[5]` **valence** (good↔bad; the existing readout axis),
  `[6]` **taboo-ness** (dangerous-referent flag), `[7]` **basic/core** (`frequencyClass=basic` /
  `BASIC_240`). Animacy / abstractness / a register-axis are **deferred** (not curated today; register
  already lives per-lexeme as a scalar). (Locked 2026-06-05.)

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

## 8. Resolved + execution-time validations
**Resolved (§0):** anchor set = CONCEPTS registry (points from EMBED_TABLE); labeled dims = the
8-dim allocation. **Remaining items, to settle DURING the wave that hits them:**
- **POS granularity (Wave 0b/0c):** the golden test (`posOfPoint` vs `posOf`) shows whether the
  4-dim POS collapse loses a closed-class distinction that matters (preposition vs conjunction). If
  so, widen by a couple dims or keep a thin metadata fallback for closed-class subtypes.
- **Lexical vs labeled weighting (Wave 2a/2b):** do clusters/neighbours run on the lexical dims only,
  or the full point (so the POS axis pulls same-POS words closer)? Start lexical-only; revisit.
- **Re-label hysteresis (Wave 3):** does an emergent gloss flip immediately at the anchor boundary,
  or need a margin (use `spread`) so display doesn't flicker?

---

## 9. Execution entry point (post-compact pickup)

**This doc is the source of truth — start here after a compact.** Execute the waves in order, end to
end, **subagent-driven** (the saved `always-subagent-driven` preference + the user's explicit
instruction). For each wave's work:

1. **Use the skills.** `superpowers:writing-plans` to turn a wave into bite-sized task plans;
   `superpowers:subagent-driven-development` to execute each plan (implementer → spec review → code
   review per task); `superpowers:dispatching-parallel-agents` for the `[D]` units. When unsure how
   to proceed, check for an applicable skill first.
2. **Controller (me) keeps:** Wave 1 (storage flip + access seam + order contract), Wave 3
   (drift/coinage), and 4a/4c/4d (migration, archive, determinism re-baseline) — these touch the
   shared seam + determinism and are NOT parallelised. I verify every subagent claim myself
   (determinism footguns in §5; never trust an over-reported "pre-existing failure" — re-check with
   `npx vitest run --dir src <path>`).
3. **Delegate (subagents):** 0b, 0c, all of Wave 2 (2a–2f, one per subsystem), 4b (UI). Dispatch
   parallel `[D]` units in one batch where they touch disjoint files; serialize only the shared
   determinism-baseline updates.
4. **Per wave:** implement → golden-test parity against the current gloss tables → deliberate
   determinism re-bake (RUN_SLOW `meaning_layer_baseline` + realism scorecard gate) → commit (local,
   trailer; do not push) → update this doc's wave status.

**Immediate next action:** Wave 0a `[S]` — create `semantics/anchors.ts` (the CONCEPTS-registry
anchor table + `nearestAnchor` / `anchorsWithin` / `kNearestAnchors`), then dispatch 0b (bake the
8 labeled dims from CONCEPTS → `anchorLabeledData.ts`) and 0c (`posOfPoint` / `clusterRegionOf` +
golden parity tests) as parallel subagents.
