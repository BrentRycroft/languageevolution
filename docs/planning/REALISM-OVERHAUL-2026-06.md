# Realism Overhaul — Parallel-Lane Design & Agent Briefs

Date: 2026-06-03 · Branch: `auto/realism-overhaul` (off `auto/realism`)
Status: PLAN — approved design, pre-implementation.

## 0. Why

Realism is "much better than before" but still feels off. The user's diagnosis:
we under-model how words **form**, how their **structure** changes, and how
**meanings** change — and sound change is mis-balanced relative to those layers.
The fix is a coordinated pass across phonology, morphology, etymology, and
semantics, plus syllable structure as a first-class evolving feature, plus a
proper opt-in tonogenesis.

### The seven asks

1. How words **form** (derivation / compounding / affixation realism).
2. How word **structure changes** over time (paradigms, grammaticalization).
3. How **meanings change** over time (drift, broadening/narrowing, colexification, recarving).
4. **Syllable structure** as a real, evolving per-language feature that constrains sound change and word shape.
5. Sound change should happen at **roughly the same cadence** as the morphological / grammatical / semantic layers (cross-layer rate balance).
6. **Individual** (per-word / lexically-conditioned) sound changes should be **rarer**; **regular / global** sound changes should be **more common**.
7. **Tonogenesis** reintroduced **properly**, behind an **off-by-default toggle** (the old one fired far too often).

## 1. Execution model

Parallel agents for speed; the orchestrator (Claude, main session) owns merge,
conflict resolution by judgement, the single determinism re-baseline, and the
cross-layer calibration.

- **Branch:** `auto/realism-overhaul`, created off `auto/realism`. `auto/realism`
  stays green as the fallback / known-good stop point.
- **Foundation-first:** the orchestrator lands ONE foundation commit (shared
  contract) before any agent runs. This makes `types.ts`, `config.ts`, the UI
  config surface, and the scorecard **single-owner**. Agents only *read* them.
- **3 lane agents, each `model: "opus"` (Claude Opus 4.8 / `claude-opus-4-8`)**,
  spawned with `isolation: "worktree"` and `run_in_background: true`, branched off
  the foundation commit. Subagent type: `general-purpose`.
- **Integration:** orchestrator merges the three lane branches, resolves
  conflicts, does the single determinism re-baseline, then performs the #5
  cross-layer rate calibration, then the full fast suite + build test.
- Merge to `auto/realism` only on explicit user approval.

## 2. Foundation commit (orchestrator, serial, BEFORE fan-out)

The shared contract every lane reads. Kept deliberately small and additive so it
is byte-identical by default (no behaviour change until a lane opts in).

- **`config.ts` + `types.ts`:**
  - `config.modes.tonogenesis: boolean` (default `false`) — same pattern as the
    existing `swadeshProtection` toggle. Read via `?? false`.
  - Any new rate knobs needed for #5/#6 (e.g. separating the per-word vs
    regular/global change probabilities so #6 is a config ratio, not a magic
    number). Values stay at current behaviour; real calibration is integration.
  - Enriched **syllable-structure contract** on `Language`, layered onto the
    existing `phonotacticProfile { maxOnset, maxCoda, … }` ([types.ts:521]) — add
    the fields BOTH Lane A (constrains sound change) and Lane B (constrains word
    formation) must read. Exact field set finalised when the foundation is
    written; the principle is: cross-lane syllable state lives here, lane-private
    state stays in the lane.
- **UI:** a `Tonogenesis (experimental)` checkbox in `ControlsPanel` Modes,
  mirroring the Swadesh toggle.
- **`realism_scorecard`:** add the new metric COLUMNS (additive, report-only at
  first) so lanes can read them. The orchestrator owns re-baselining the soft
  bands / locks at integration.

Convention for lanes that discover they need a NEW shared per-language field:
append it in a clearly-commented `// LANE-x ADDED` block and flag it in the
agent's final report; the orchestrator reconciles at merge.

## 3. Determinism & working rules — EVERY agent

These are non-negotiable and copied into each brief. They are what keep the
three-way merge tractable.

1. **No `Math.random()`** anywhere in `src/engine/`. Thread the seeded `Rng`.
   Sort keys before any order-sensitive iteration (`Object.keys`, `Set`, `Map`).
2. **Append** new RNG draws AFTER existing draws within a step — never insert a
   draw mid-stream. This localises the inevitable byte-identity reshuffle.
3. **Do NOT edit** `src/engine/types.ts`, `src/engine/config.ts`,
   `src/engine/__tests__/realism_scorecard.test.ts`, or
   `src/engine/__tests__/meaning_layer_baseline.test.ts`. Read the foundation
   contract instead. If you truly need a new shared field, append it in a flagged
   block (see §2) and call it out in your report — do not redesign the shape.
4. **Do NOT re-baseline** any determinism / scorecard snapshot. If
   `meaning_layer_baseline` or `realism_scorecard` go red because of your
   behaviour change, that is EXPECTED — leave them red and note it; the
   orchestrator re-baselines once on the merged result. Verify YOUR lane with
   your own targeted behaviour tests + `npx tsc --noEmit`.
5. **Stay in your lane's directories.** Touching a shared/other-lane file is a
   merge cost — avoid it; if unavoidable, flag it.
6. **Language-agnostic.** Parameterise by typology axes; never privilege English
   structure (English meaning KEYS are fine; English BEHAVIOUR is not). Log any
   anglocentrism you must leave behind.
7. **Realism compass.** Name the linguistic principle each change serves
   (Greenberg / implicational hierarchy / attested sound-change or
   grammaticalisation pathway / Zipf / UG). If you can't name it, don't ship it —
   flag it as NEEDS DECISION.
8. **Commit green.** Each commit on your branch must pass `tsc` + your targeted
   tests. Never the full slow suite (too slow; orchestrator runs it). Recreate
   then DELETE any throwaway probe (default vitest collects `*_*.test.ts`).
9. Work on your assigned worktree branch; make focused commits with the
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer. Do not
   push, do not open PRs, do not merge.

## 4. Lane A — Phonology & sound change

**Asks:** #4 syllable structure, #6 individual-vs-global balance, #7 tonogenesis.
**Owns:** `src/engine/phonology/*` (esp. `syllable.ts`, `phonotactics.ts`,
`regular.ts`, `rate.ts`, `apply.ts`, `tone_spread.ts`, `sandhi.ts`),
`src/engine/steps/phonology.ts`, `src/engine/steps/phonotacticDrift.ts`.

**Read first:** `phonology/apply.ts` (per-word change engine), `phonology/regular.ts`
(regular/global change), `phonology/syllable.ts` + `phonotactics.ts`, the existing
`phonotacticProfile` / `directionVector` wiring in `types.ts`, and the tone
machinery (`tone_spread.ts`, `sandhi.ts`, `__tests__/tone.test.ts`).

**Do:**
- **#4** Make syllable structure a real, evolving per-language constraint:
  it should (a) drift over time, (b) gate which sound changes are admissible
  (no change that produces an illegal syllable for that language without a repair),
  and (c) be the same structure Lane B reads when building words. Build on
  `phonotacticProfile`; enrich via the foundation contract, don't fork it.
- **#6** Rebalance actuation so **regular/global** change (a rule that sweeps the
  whole lexicon) is the common path and **per-word / lexically-conditioned**
  change is rare. Today `phonology.globalRate 0.05` (per-word) and
  `phonology_lawful.regularChangeProbability 0.04` are near-equal — invert the
  emphasis. Express the ratio via the foundation rate knobs; leave final numbers
  for integration calibration but ship a clear, defensible default direction.
  Principle: Neogrammarian regularity — sound laws are exceptionless and
  lexical diffusion is the slower, rarer secondary mode.
- **#7** Rework tonogenesis to fire from a **real conditioning environment**
  (e.g. loss of a coda voicing/aspiration contrast, or onset voicing → pitch
  split) as a **language-level regime shift** non-tonal → tonal, NOT per-word
  drift. Gate the whole mechanism behind `config.modes.tonogenesis` (default
  off). Diagnose and fix the "fires too often" root cause (find the current
  trigger and its probability). Principle: attested tonogenesis pathways
  (Haudricourt; transphonologisation of laryngeal/voicing contrasts).

**Boundary:** don't touch morphology/semantics/lexicon meaning ops. Phonotactic
*repair* of word forms is yours; *building* new words is Lane B's.

**Verify:** targeted tests for syllable-constraint enforcement, regular>>individual
ratio, and tonogenesis-on vs -off (off ⇒ byte-identical to no-tonogenesis).

## 5. Lane B — Morphology + word-formation + etymology

**Asks:** #1 how words form, #2 structural change. Etymology records are a byproduct.
**Owns:** `src/engine/morphology/*`, `src/engine/genesis/mechanisms/*`
(esp. `compound.ts`, `derivation.ts`), `src/engine/lexicon/compound.ts`,
`src/engine/lexicon/word.ts` (etymology / `recordedParts` / `wordOrigin`),
`src/engine/steps/grammar.ts`.

**Read first:** `morphology/evolve.ts` (paradigm/grammaticalisation engine),
`genesis/mechanisms/derivation.ts` + `compound.ts`, `lexicon/word.ts`
(`recordedParts`, `wordOrigin`), `steps/grammar.ts`.

**Do:**
- **#1** Make word formation more realistic and productive: derivation and
  compounding should follow the language's own typology and produce transparent,
  trackable structure (the etymology). New words should respect the syllable
  structure from the foundation contract. Principle: productivity hierarchies;
  compounding/derivation as the dominant lexical-genesis routes cross-
  linguistically.
- **#2** Make structural change coherent over time: paradigms grammaticalise,
  level by analogy, fuse, and erode along the established cline
  (content → clitic → affix → fusion → loss), at a believable cadence. Build on
  the existing grammaticalisation-stage machinery. Principle: the
  grammaticalisation cline (Lehmann; Bybee); analogical levelling.
- **Etymology:** ensure formed/changed words leave correct `recordedParts` /
  `wordOrigin` trails so the history is queryable (and so Lane A's phonotactic
  drift and Lane C's semantic shift operate on honest structure).

**Boundary:** don't edit phonology rule application or semantic drift/recarve
mechanisms. You *read* syllable structure; you don't define it.

**Verify:** targeted tests for derivation/compounding output, paradigm-cline
transitions, and etymology-record integrity.

## 6. Lane C — Semantics

**Ask:** #3 how meanings change over time.
**Owns:** `src/engine/semantics/*` (esp. `recarve.ts`, `drift.ts`, `lexicostat.ts`),
`src/engine/modules/semantic/*`, the meaning-mutation ops in
`src/engine/lexicon/mutate.ts`.

**Read first:** `semantics/drift.ts`, `semantics/recarve.ts` (merge/split of
meaning space, incl. the Phase-3e cooldown), `modules/semantic/*`,
`lexicon/mutate.ts` (`deleteMeaning`, meaning-field ops).

**Do:**
- **#3** Make meaning change realistic over time: semantic drift, broadening /
  narrowing, amelioration / pejoration, metaphor/metonymy-driven extension, and
  colexification splits/merges, paced believably and resistant to oscillation
  (respect the existing recarve cooldown). Principle: regular semantic-change
  pathways (Traugott & Dasher); colexification typology; Zipfian frequency
  effects on retention.

**Boundary:** don't edit phonology or morphology mechanisms. Meaning ops only;
form changes belong to Lanes A/B.

**Verify:** targeted tests for drift/broadening/narrowing, colexification
behaviour, and anti-oscillation under the cooldown.

## 7. Integration (orchestrator, serial, LAST)

1. Merge the three lane branches into `auto/realism-overhaul`, resolving
   conflicts by judgement (expected mostly in any flagged shared-field blocks).
2. Review each lane diff for determinism violations (Math.random, unsorted
   iteration, mid-stream draws) and lane-boundary creep BEFORE trusting it.
3. **One** determinism re-baseline on the merged result: regenerate
   `meaning_layer_baseline` GENN + `realism_scorecard` locks, reviewing every
   delta as a deliberate, named behaviour change (tests are tools, not ground
   truth — be most skeptical here).
4. **#5 cross-layer rate calibration:** tune `config.ts` so phonology ≈
   morphology ≈ semantics change cadence, validated against the realism
   scorecard's per-layer metrics. This is the irreducibly-serial heart of the
   overhaul and cannot be parallelised.
5. Full fast suite green + `npm run build` (the build test).
6. Update `docs/planning/ROADMAP.md`; report. Merge to `auto/realism` only on
   explicit user approval.

## 8. Success criteria

- All 7 asks demonstrably implemented, each with a targeted test.
- Tonogenesis OFF ⇒ byte-identical to the no-tonogenesis baseline.
- The scorecard shows phonology/morphology/semantics changing at comparable
  cadence (#5) and regular ≫ individual sound change (#6).
- Full fast suite green; build passes; `auto/realism` untouched until approved.
