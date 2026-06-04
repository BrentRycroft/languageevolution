# MEGA OVERHAUL — Comprehensive Simulator Overhaul (2026-06)

Roadmap for the user's "MEGA UPDATE IDEAS" directive (2026-06-03) plus the
additional gaps found in a fresh code + UI investigation. Built on `auto/realism`
(HEAD 73abe86). This is the **design/spec**; execution follows after user approval
via worktrees + parallel Opus 4.8 agents, integrated back onto `auto/realism`.

> Status: DRAFT — awaiting user review. No implementation has started.

---

## 0. Two locked cross-cutting decisions (from the user, 2026-06-03)

### 0.1 Testing → one holistic **Simulation Scorecard**
- Collapse the ~235-file two-tier suite into **one scorecard** that measures *how
  properly the whole simulation works* — not just realism. Every check is a
  **diagnostic with a preferred/expected value** (soft band + target), printed as a
  report, not a brittle pass/fail lock.
- **Fold in** the current typology "locks" (word-order/case/agreement/negation
  axes) as diagnostics-with-preferred-values.
- **Fold in** the user-supplied translator test phrases (ROADMAP backlog
  "TRANSLATOR TEST CORPUS") as scorecard rows.
- **Byte-identity is demoted to a performance diagnostic** — no longer a gate.
  (Reproducibility within a seed/build is still expected — same seed ⇒ same output;
  we just stop gating on byte-equality vs a prior baseline.)
- Net: the scorecard is the day-to-day gate; redundant/fragile slow suites retire.

### 0.3 Scope decisions (user, 2026-06-03)
- **#16 word count → HARD 1000-word floor for all presets except Toki Pona.** Not a
  soft target. This is the largest content effort and a major determinism-rebaseline
  source; the registry expands to support it (Lane E).
- **#4/#8 meaning model → FULL many-to-many meaning↔word GRAPH rearchitecture.**
  Replace the ~1:1 `ConceptId→WordForm` store with first-class polysemy + synonymy.
  This is **foundational** — the lexicon shape Lanes B/D/E/F build on — so it is
  promoted to an early **serial** milestone (Lane C0), on the scale of the prior
  concept-rekey. Behavioral colex/synonymy/gloss work (Lane C1) follows it.
- **#1 Swadesh protection → removed entirely** (no GUI toggle kept); rely on emergent
  frequency retention.
- **Determinism:** same-seed reproducibility within a build stays REQUIRED; only
  byte-identity-vs-prior-baseline is demoted to a perf diagnostic.
- **Repo move target:** `C:\dev\languageevolution`.

### 0.2 Execution → **move the repo out of OneDrive**, then worktrees
- Last attempt at parallel worktree agents failed because the repo lives in
  OneDrive: sync cross-contaminated nested worktrees and they lacked
  `node_modules`, so agents collided in the main tree.
- **Fix:** relocate the project to a non-synced path (e.g. `C:\dev\languageevolution`)
  as execution step 0, then use normal git worktrees per lane.
- Agents are **Claude Opus 4.8**; each may spawn its own Opus sub-agents.
- Integration: I cherry-pick/merge each lane onto `auto/realism`, resolve conflicts
  by judgment, run the scorecard green-to-preferred, commit.

---

## 1. Execution model (detail)

**Wave 0 — Foundation (serial, me first).** Nothing parallelizes until these land,
because every lane gates on the scorecard and the relocated repo.
1. Move repo OneDrive → `C:\dev\languageevolution`; verify `npm ci` + `npm test` +
   `npm run build` from the new path; update any path-bound scripts.
2. Worktree helper: `git worktree add` per lane at `C:\dev\langsim-wt\<lane>` with a
   `node_modules` junction (or per-worktree `npm ci`).
3. Build the **Simulation Scorecard** (§0.1) — see Lane 0.
4. UI: max-speed Play (§Lane H) — small, lands here so play sessions during the
   overhaul run at full speed.

**Wave 1 — Engine internals (parallel agents).** Lanes A, B, C, D. B and C share
`semantics/` + `lexicon/frequency*` files → integrate B before C (or one combined
agent). A and D are largely independent.

**Wave 2 — Content + immersive (parallel).** Lane E (presets, depends on D + B/C),
Lane F (translator, depends on grammar being stable). Lane E sub-delegates one
Opus agent per preset.

**Wave 3 — Structural (serial / self-delegating, biggest).** Lane G (reason-driven
splits + province map). One lead agent that spawns Opus sub-agents for the
bitmap-parse, the split-trigger model, and the MapView wiring.

Each lane below tags **[parallel-safe]** or **[serial]** and its dependencies.

---

## 2. Lanes

### Lane 0 — Holistic Simulation Scorecard  [serial, foundation]
**Covers:** user testing directive (§0.1).
**Findings:** `realism_scorecard.test.ts` already evolves 7 presets as single
non-splitting lineages over 40/100/200 gens and bands metrics (Swadesh retention,
synthesis index, inventory size, antonym-drift, compound-decomp match, embedding
cosine). It is the natural spine. `meaning_layer_baseline.test.ts` is today's
byte-identity determinism gate. Typology locks are scattered across many
`*_agnosticism`, `*_typolog*`, narrative/translator test files.
**Changes:**
- Extend the scorecard into a **Simulation Scorecard**: add diagnostic rows with
  preferred values for (a) typology consistency (Greenberg axes, case/agreement),
  (b) translator phrase corpus (the 5 user phrases + the placeholder example),
  (c) lexicon lifecycle (size stationarity, birth/death balance), (d) phonology
  (rate parity across layers, inventory diversity, regular-vs-per-word share),
  (e) semantics (colexification rate, synonym/relevancy spread).
- Each row prints `actual / preferred / band` and PASS/WARN/FAIL **as a report**.
- Move byte-identity to a separate **perf diagnostic** (timing + optional hash
  drift report), non-gating.
- Retire redundant slow suites once their crucial assertions are folded in; keep a
  thin determinism-reproducibility check (same seed twice ⇒ identical) as a
  diagnostic.
**Principle:** measurement spine first; everything else proves itself against it.
**Risk:** must not lose genuine regression coverage silently — fold before delete;
keep a deprecation list in the doc.

### Lane A — Phonology realism  [parallel-safe]
**Covers:** #2 (slower sound change), #3 (rebalance toward grammar/morph/sem), #5
(stop "law-stacking"; allow counter-feeding/chain shifts), #6 (j↔y + inventory
diversity), #17 (audit hidden per-preset drivers).
**Findings (verified):**
- Two actuation paths both *append, never interact*: per-word (`apply.ts:494`,
  demoted by `PER_WORD_ACTUATION_SCALE=0.3` `steps/phonology.ts:61`) and the
  exceptionless regular sweep (`regular.ts:22`, `REGULAR_SWEEP_ATTEMPTS_PER_GEN=2`).
  Rule set is union-only & monotonic (`steps/helpers.ts:254`); **hand-written
  catalog rules never die**. No cross-generational feeding/bleeding/opacity.
- The opacity engine **exists but is unwired** (`stratal.ts:27-30`,
  `steps/phonology.ts:316`) and self-erases each gen under the default policy.
- Chain-shift/phonologization are **detection-only**; `chainShift.ts:120`
  `vowelShiftRateMultiplier` is **dead code** (computed, never consumed).
- **No j↔y / i↔j / u↔w glide rule exists** anywhere; `/j/` already romanizes to "y"
  (`orthography.ts:30,44`), so even existing jod rules are invisible.
- Phoneme **library is rich** (kʰ gʰ gʷ gʷʰ ɣ ejectives uvulars laryngeals present,
  `features.ts:74-255`). Diversity loss is **homeostasis** (tier cap 40
  `inventoryManagement.ts:44`, per-gen prune, markedness-rejection up to 0.85
  `apply.ts:737`, one-way lenition bias `apply.ts:317`), not a small library.
- `repairOutputMapByFeatures` corrupts generated rules' identity
  (`featureGeometry.ts:111`) — cheap fix, cascades.
**Changes:**
- Lower global sound-change rate further (#2) and re-trim the per-word vs regular
  balance so phonology stops out-firing other layers (#3, #5-calibration).
- Wire genuine cross-gen interaction (#5): either enable + fix the stratal UR/SR
  path (stop the each-gen erase) **or** inject real chain-shift follow-on rules from
  `detectChainShiftPressure` and consume `vowelShiftRateMultiplier`. Allow
  merger-then-conditioned-split and counter-feeding.
- Add i↔j and u↔w syllabicity alternations (#6) — cheap `contextSub` pairs.
- Relax inventory homeostasis / markedness suppression so diverse, marked
  inventories (incl. retained gʷʰ/gʰ/kʰ) persist (#6).
- Fix `repairOutputMapByFeatures` type-preservation.
- Audit each preset for hidden sound-change drivers (#17) and report; remove any
  that bias outcomes beyond legitimate inventory/typology seeding.
**Principle:** Neogrammarian regularity + lexical diffusion as *minority*; chain
shifts and opacity as the texture of real diachrony.
**Scorecard rows:** per-layer change-rate parity; realized inventory size/diversity;
regular-vs-per-word actuation share; presence of chain-shift/feeding events.

### Lane B — Lexicon lifecycle & word relevancy  [parallel-safe; integrate before C]
**Covers:** #1 (drop Swadesh protection), #7 (no ~1800 target; born from need / die
from disuse), #9 (word relevancy/usage signal).
**Findings (verified live):** word count climbed 751→1032 by gen 100 toward the
registry ceiling. `genesis/need.ts:98` adds `EXPANSION_NEED_BASELINE`
(`constants.ts`) to *every* non-basic registry concept until acquired → languages
fill the whole `CONCEPT_IDS` set. Death is thin (homophone-rivalry + a low-freq
channel in `steps/obsolescence.ts`). Frequency saturates (audit: top-50 all at the
0.95 cap, Zipf ratio ≈1.0) so "frequency" ≈ word age, not usage.
**Changes:**
- Replace constant-fill expansion with **communicative-need-driven birth** (topic
  pressure, sister-language presence, cultural tier) and a **per-preset cap** on how
  much of the universal registry a language fills (a minimalist culture stays small).
- Strengthen the **disuse-death** channel: low-relevancy words obsolesce and die,
  with no target size — birth/death reach a stationary distribution emergently.
- Add a **relevancy/usage signal** (#9): decay must dominate bumps so frequency
  tracks usage; expose it so `sunder`/`swarthy`-type words decay toward discard
  while `apart`/`black` stay core. Drives the death channel.
- Remove **Swadesh core-vocab protection** (#1): delete the gloss-keyed shield;
  rely on the (now-working) frequency-conditioned retention so core vocab is *more
  stable* emergently, not by an English wordlist.
**Principle:** Zipf + lexical replacement cycles; no exogenous target size.
**Risk:** interacts with glottochronology realism (Swadesh retention curve) — the
scorecard's retention diagnostic guards against over/under-erosion.
**Scorecard rows:** lexicon-size stationarity (ratio→~1.0), birth/death balance,
frequency→usage correlation, Swadesh retention still ~80%/millennium *emergently*.

### Lane C0 — Meaning↔word GRAPH rearchitecture  [serial, FOUNDATIONAL; Wave 0.5]
**Covers:** #4/#8 (full rearchitecture, per user decision §0.3).
**Why foundational:** B/D/E/F all read/write the lexicon; doing the graph flip first
avoids re-working every lane. Scale ≈ the prior concept-rekey (ROADMAP §258).
**Findings:** store is currently `Record<ConceptId, WordForm>` (one form per concept,
post concept-rekey). Colex graph + `recordedParts` + `glossLemma` exist but the data
model is 1:1.
**Changes:**
- Replace the 1:1 store with a **many-to-many meaning↔word graph**: a meaning can be
  expressed by multiple words (synonymy, each with a **relevancy** weight); a word can
  carry multiple meanings (polysemy/colexification) first-class.
- Thread the new shape through the determinism hot path (`apply.ts` lexicon access),
  the access seam (`lexicon/access.ts`), persistence/migration, and the UI.
- One reviewed determinism re-baseline; reproducibility preserved.
**Risk:** highest-blast-radius engine change in the overhaul. Serial; gated by the
scorecard + a reproducibility check. Likely self-delegating (Opus sub-agents for
store/access, hot-path, persistence, UI).

### Lane C1 — Colexification, synonymy behavior, glosses  [parallel-safe; after C0]
**Covers:** #4 (raise colexification + synonymy spread), #8 (fuzzy meaning↔word),
#10 (weird glosses).
**Findings (verified live):** the CLICS-aligned colex graph exists but is mostly
unused (audit B); embeddings are degenerate (antonyms cos≈0.99) so drift wanders to
opposites. Weird glosses are **raw concept-IDs** (`bear-ish`,
`answer-action`/`answer-noun`, `hoe-tool`, `date-fruit`, `ferment-v`, `mother-in-`)
from `expanded_concepts.ts` disambiguation suffixes leaking into the display. Clean
helpers (`glossLemma`/`peelDerivation`, `lexicon/word.ts`) exist but the
Dictionary/Lexicon UI bypasses them.
**Changes:** (on top of the C0 graph)
- Drive drift + coinage from the **colexification/neighbor graph**; raise
  colexification rate (#4) and **populate synonym sets with relevancy** so a meaning
  surfaces multiple competing words ranked by relevancy.
- Fix the embedding so drift has direction (polarity dimension; antonyms separate).
- **Glosses (#10):** (a) cheap display fix — a `prettyGloss(conceptId)` that strips
  `-ish/-v/-n/-action/-animal/-tool/-fruit/-time…` disambiguators and renders e.g.
  `bear-ish`→"bear (quality)", used by `DictionaryView.tsx`/`LexiconView.tsx`;
  (b) deeper — curate human-readable labels for the auto/odd concept IDs.
**Principle:** colexification + polysemy are the cross-linguistic norm; meanings are
fuzzy clusters, not 1:1 labels.
**Scorecard rows:** colexification rate, synonym-set spread, antonym-drift→0,
gloss-cleanliness (no raw disambiguator suffixes surfaced).

### Lane D — Morphology encoding (roots/prefixes/suffixes on the backend)  [parallel-safe; feeds E]
**Covers:** #11 (encode roots/prefixes/suffixes), underpins #12/#15 decomposability.
**Findings:** structure partially exists — `morphStructure`, `boundMorphemes`,
`lang.compounds`, `seedDerivations`/`seedCompounds` (Meaning-Layer Migration,
ROADMAP §104-342). `recordedParts(lang,m)` reads recorded structure. But seed-time
morphology doesn't always persist onto the `Word`, and there's no first-class
per-language **morpheme inventory** (a root + affix lexicon with meanings/forms).
**Changes:**
- Promote a per-language **morpheme inventory**: roots and bound affixes as
  first-class entries (form, meaning, category, productivity), so words reference
  their constituents and decomposition is read from records (not gloss strings).
- Ensure seed-time `morphStructure` persists onto `Word` (close the
  `syncWordsFromLexicon` gap noted at ROADMAP §144).
**Principle:** words are built from morphemes; etymology/decomposition is data.
**Scorecard rows:** % lexicon with recorded morphological structure; decomposition
round-trips (parts re-concatenate to form).

### Lane E — Preset enrichment & de-anglicization  [parallel, sub-delegated per preset; after D]
**Covers:** #12 (English decomposability: behind=be+hind, before=be+fore), #13
(interjections), #14 ("if it existed, it should be in there"), #15 (PIE
decomposition + an `*akʷ-` "aqua" root), #16 (≥1000 words/preset except Toki Pona).
**Findings:** ~240-concept ceiling (`basic240` fill); Bantu ~220 hand-authored. The
concept **registry size is the lever** for "more words." B1-Y makes append-only
enrichment byte-safe on the sound channel (isolated per-preset re-baseline).
**Changes:**
- **Expand the concept registry** substantially (toward supporting ~1000-word
  lexicons) — phased; presets fill what their culture/tier supports.
- Per preset (one Opus sub-agent each): author authentic vocabulary + **interjections**
  + transparent **decompositions** (English be+hind/be+fore; PIE `*wódr̥`=wet+er; add
  `*akʷ-eh₂` "water/aqua" as a synonymous root daughters can let overtake `*wódr̥`).
- De-anglicize via `seedColexification`/recorded structure (no relexified English).
**Principle:** authentic, family-calibrated material; no invented etymologies.
**Risk:** scale (≥1000 × presets) is large — see NEEDS DECISION on registry size.
Determinism: append-only, isolated per-preset scorecard re-baseline.
**Scorecard rows:** per-preset word count, interjection coverage, decomposable-word
share.

### Lane F — Translator rewrite (pivot / interlingua)  [parallel-safe]
**Covers:** #18 (rewrite on a "google-translate"/pivot basis; use the test phrases),
ROADMAP closed-class coinage bug ("no"→"ngich").
**Findings (verified live):** "I want to buy the egg" → **failed to parse**, fell to
word-by-word, **dropped the object "egg"**, scrambled to "i buy want to", left
"want" unresolved. ARCHITECTURE confirms the realiser is still on a **legacy English
NP/VP/PP IR** (role-IR migration incomplete). `abstraction.ts`/`roleFrame.ts` exist
as a pivot precursor.
**Changes:**
- Re-architect to a **pivot/interlingua**: parse source → language-neutral
  predicate-argument **role frame** (verb + roles + TAM + modifiers, control/raising
  for "want to buy") → generate from the **target language's own grammar** (order,
  case, agreement, adpositions). Replace the English-IR realiser path.
- Closed-class **no-coin**: numbers/interjections/prepositions/negators surface an
  existing lexeme or a clean "unknown" marker — never a fabricated form.
- Fold the user's **test phrases** into the scorecard (Lane 0).
**Principle:** translation = source-semantics → target-grammar generation, not
English-string reshuffling.
**Scorecard rows:** the phrase corpus (objects retained, order correct, no spurious
coinage, control verbs handled).

### Lane G — Reason-driven splits + province map  [serial / self-delegating, biggest; Wave 3]
**Covers:** #19 (splits for a reason, not chance), #20 (use `Provinces.png`; model
expansion/growth/splits geographically).
**Findings:** splits today are flat `splitProbabilityPerGeneration=0.012` gated by
`min-between/maxLeaves` (no split in 100 gens live); instantaneous multifurcations,
seed-variable timing (audit D). BUT a real **territory model already exists**:
`geo/territory.ts` (pop-scaled growth, conquest of weaker neighbors, BFS partition
at split, extinct reabsorption) over `geo/map.ts` Voronoi cells with a
`kind:"random"|"earth"` field. The random map is what the UI shows ("random"). The
imported `maps/Provinces.png` (equirectangular, unique color per province) is unused.
`geo.ts` is a *separate* synthetic radial layout for the tree view.
**Changes:**
- **Province substrate (sub-agent 1):** parse `Provinces.png` → cells (unique color =
  province), adjacency from shared borders, land/ocean classification → a
  `kind:"earth"` `WorldMap`; wire it as the territory substrate.
- **Reason-driven cladogenesis (sub-agent 2):** trigger splits from accumulated
  **internal divergence + geographic fragmentation** (territory separated by
  distance/ocean/another language) + population growth, as **successive binary**
  cladogenesis — not flat chance, not instant multifurcation. Death = speaker
  collapse/absorption by a stronger neighbor, not flat chance.
- **MapView wiring (sub-agent 3):** render the province map, language territories,
  spread/contact; replace the "random" prototype view.
**Principle:** languages diverge because populations separate and lose contact
(classic cladogenesis); geography drives contact, spread, and split.
**Risk:** largest blast radius (geo + tree + death + UI + determinism). Serial, with
the scorecard's phylogenetics diagnostics as the gate.
**Scorecard rows:** split timing realism, binary-vs-multifurcation, split tied to
divergence/geography, family-tree shape.

### Lane H — UI: max-speed Play  [small, Wave 0]
**Covers:** #21 (remove the playback "steps/sec" time slider; Play = max speed,
continuous, no skipped beats).
**Findings (verified live):** the **Playback → "Speed (steps/sec)" slider** (4/s) in
`ControlsPanel.tsx` drives the play loop in `App.tsx`. Distinct from the **"Evolution
speed"** picker (per-step change magnitude / Romance-from-Latin calibration) — that
one **stays**.
**Changes:** remove the steps/sec slider; Play runs a continuous max-rate loop
(rAF/idle-driven), reset/step/fast-forward unchanged. Keep "Evolution speed."
**Scorecard rows:** n/a (UI) — manual play-session check.

---

## 3. Additional improvements found in investigation (user ask #24)

- **Leverage what already exists:** `stratal.ts` opacity engine (Lane A), the
  `kind:"earth"` map hook + full territory model (Lane G), `glossLemma`/`peelDerivation`
  (Lane C), `abstraction.ts`/`roleFrame.ts` pivot precursor (Lane F). Several asks are
  "wire up the built-but-dormant feature," which lowers risk.
- **Dead code:** `chainShift.ts:120 vowelShiftRateMultiplier` computed but never
  consumed — wire it (Lane A) or remove.
- **Anglocentric gaps (backlog):** no `demonstrativePosition` axis (demonstratives
  hardcoded prenominal); narrative realiser can't do verb-final/initial reorder
  (ROADMAP backlog). Fold as scorecard diagnostics.
- **Benign UI console noise:** 17 "preventDefault inside passive listener" errors on
  tab interactions — harmless but worth silencing (a passive-listener fix).
- **Bundle size:** 944 kB main chunk (Vite >500 kB warning) — code-split, low
  priority.
- **Dictionary UX:** once synonymy/relevancy exists (Lane C), the Dictionary should
  show a meaning's competing words ranked by relevancy.

---

## 4. Decisions — RESOLVED (user, 2026-06-03)

1. **#16 word count → HARD 1000 floor, all presets except Toki Pona.** (Was: phased
   target.) Registry expands to support it; Lane E scope grows accordingly.
2. **#4/#8 meaning model → FULL many-to-many graph rearchitecture** (Lane C0,
   foundational/serial). (Was: lightweight first.)
3. **#1 Swadesh protection → removed entirely** (no GUI toggle kept).
4. **Determinism → same-seed reproducibility required**; byte-identity-vs-baseline
   demoted to perf diagnostic.
5. **Repo move → `C:\dev\languageevolution`.**

Remaining open question (low stakes, can decide during execution): whether C0's graph
re-baseline is taken once up front or incrementally per lane.

---

## 5. Sequencing summary

```
Wave 0   (serial):   repo move · worktree infra · Lane 0 scorecard · Lane H max-speed Play
Wave 0.5 (serial):   Lane C0 meaning↔word GRAPH rearchitecture (foundational, self-delegating)
Wave 1   (parallel): Lane A phonology · Lane B lexicon lifecycle · Lane D morphology
Wave 1.5 (parallel): Lane C1 colex/synonymy/glosses (after B+C0)
Wave 2   (parallel): Lane E presets — HARD 1000 floor (per-preset sub-agents) · Lane F translator
Wave 3   (serial):   Lane G reason-driven splits + province map (self-delegating)
```

C0 is the pivotal gate: it changes the lexicon data model, so B/D land on top of it
and E/F consume it. Sequenced serial-first to avoid re-working every lane.

Integration after every lane: cherry-pick/merge → resolve conflicts → run the
Simulation Scorecard to preferred values → commit to `auto/realism` (local only).
