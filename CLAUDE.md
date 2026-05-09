# CLAUDE.md — Assistant context for the language-evolution simulator

This file is the **first thing a fresh Claude session should read**.
The simulator at `/home/user/languageevolution` is a deterministic
generation-stepped phylogenetic language tree, written in TypeScript
+ React + Vite. Phases 60–69 added a substantial pile of dynamic
language features. This doc captures everything we've shipped and
the invariants that matter so a context-compacted session can pick
up without re-discovering them.

For the structural-architecture deep dive, read `ARCHITECTURE.md`
in the repo root (the canonical "how does the simulator actually
work" guide). This file complements it with **operational** info:
recent phases, standing user preferences, test landscape, known
issues, and the work-in-progress.

---

## Standing user preferences

These are durable across sessions:

- **Always merge to main after each phase ship.** Pattern:
  `git push -u origin claude/working` → `git checkout main` →
  `git pull origin main` → `git merge --ff-only claude/working` →
  `git push origin main` → `git checkout claude/working`.
  *(There's been an intermittent `403` on `git push origin main`
  recently — a session-level proxy policy. Push to `claude/working`
  always works; the FF-merge to main can be done from the user's
  normal flow.)*
- Standing instruction "Yes always" applies to phase-ship merges.
- Commit messages follow a template: phase number + tranche
  description, body explains *why* + measured impact + test count.
  End with `https://claude.ai/code/session_01BaGu5N2gshUUz9qXaft9UE`.
- **Don't make a PR unless explicitly asked.**
- Never push to a different branch without explicit permission.
- The user ran `/ultrareview` on his own — never invoke it from
  Claude.

## Plan-mode workflow

When the user enters plan mode, the workflow is:

1. **Phase 1 (Initial Understanding)** — read code, spawn Explore
   agents (max 3, in parallel) for codebase exploration. Quality
   over quantity.
2. **Phase 2 (Design)** — launch a Plan agent (1) to design the
   implementation.
3. **Phase 3 (Review)** — use AskUserQuestion to clarify gaps.
4. **Phase 4 (Final Plan)** — write to
   `/root/.claude/plans/i-want-to-make-modular-quill.md`. Include
   Context, recommended approach, modified files, reuse pointers,
   verification.
5. **Phase 5 (Approval)** — call `ExitPlanMode`.

The plan file is the canonical hand-off and is the only file
editable in plan mode.

---

## Phases 60–70 shipped

All on `claude/working` (Phase 70) / `main` (Phase 60–69). Each was a
standalone commit (or 2–4 for larger phases). Probe scripts under
`scripts/probes/phase{N}_{T}_*.ts`.

| Phase | Commit | Title | Headline |
|---|---|---|---|
| 60 | `0f953fa` | Rate rebalance | Phonology globalRate 0.22→0.05; genesis 0.35→1.0; coinage volume 4-25/gen |
| 61 | `5e5ca13` | Narrative randomness | POS-driven slot-fill, synonym dispatch, expanded morphology stack |
| 62 | `f2b3b1f` | Homonym-collision cap | Pre-flight pass on phoneme mergers; rejects when >max(8, 0.5%×lex) collisions |
| 63 | `4a075a1` | Verb-theme stripping | `lang.grammar.verbThemes` (Romance `-aɾe / -eɾe / -iɾe`) stripped before tense/person paradigms |
| 64 | `b826153` | Morph dynamism | T1 noun declension classes (5-way); T2 ablaut chains; T3 classifier agreement |
| 65 | `d7c1e68` | Discourse + reference | T1 article definiteness (a/the); T2 logophoric pronouns (3sg.log) |
| 66 | `9b6a3b9` | Lexicon dynamics | T1 gramm chain stages; T2 productive derivation runtime |
| 67 | `556b8d3` | Phonology dynamism | T1 stress; T2 sandhi evolve; T3 phonotactic gate; T4 RC typological constraints |
| 68a | `0342466` | P0 audit fixes | deleteMeaning metadata leak + 2 broken test files |
| 68b | `6fa467e` | Audit cleanup + visibility | Wired runtime derivation; UI badges; productive seeding bootstrap |
| 70 T1 | `551237d` | Historical Mode scaffold | M1 (Vulgar Latin lenition burst); types + UI toggle; soft railroad |
| 70 T2 | `f6ef90e` | Italo-Western/Eastern split | M2 (gen 65); SplitMilestone runner; daughter role + initialBias |
| 70 T3 | `31a9a6a` | Full Romance schedule | M3-M10; Iberian/Gallo/Italo subsplits; TimelineChart milestone markers |
| 70 T4 | `5e3c833` | Polish | Intensity slider; narrative voice helper; CLAUDE.md update |
| 70 diag | `702315a` | Gap-finder probe | `phase70_diagnostic_compare.ts` — read-only run that surfaces engine gaps |
| 70.1 | `64782d3` | Drop gen-1 immediate split | Proto stays single until natural splits or M2; rename via `generateName` |
| 70.1 fix | `a0b5a3a` | Test follow-up | Idempotency test now reads state-level `firedHistoricalMilestones` |

### Per-phase feature pointers

**Phase 60 — config rates.** `src/engine/config.ts`. User-facing
sliders in `src/ui/ControlsPanel.tsx`.

**Phase 61 — narrative randomness.** `src/engine/narrative/composer.ts`,
`generate.ts`, `discourse_generate.ts`. Drops English filler-pool
fallbacks; samples slots from `lang.lexicon` POS-pools; expands
morphology stack stochastics.

**Phase 62 — merger cap.** `src/engine/phonology/pruning.ts:243-287`.
Pre-flight builds `formKeyToMeanings` and counts how many new unrelated
homonyms a candidate merger would create; rejects if over cap.
Constants: `HOMONYM_COLLISION_ABS_CAP = 8`, `HOMONYM_COLLISION_REL_CAP = 0.005`.

**Phase 63 — verb themes.**
- Type: `lang.grammar.verbThemes?: Phoneme[][]` in `src/engine/types.ts`.
- Strip path: `src/engine/morphology/evolve.ts:inflectCascade` —
  scans for longest matching theme suffix at the start of the
  cascade and strips before applying paradigms.
- Romance preset declares 4 themes; phoneme mergers in pruning.ts
  extend the variant list (proto themes preserved at head).

**Phase 64 T1 — noun declension classes.**
- Type: `NounDeclensionClass = 1|2|3|4|5` in `morphology/types.ts`.
- Field: `lang.nounDeclensionClass?: Record<Meaning, NounDeclensionClass>`.
- Helpers in `morphology/inflectionClass.ts`:
  `assignNounDeclensionClass`, `getNounDeclensionClass`.
- Variant lookup: `morphology/apply.ts:pickAffixVariant` matches
  `class:N` for `noun.*` paradigms (verbs use `inflectionClass`).
- Inheritance: `tree/split.ts:188+` clones into daughters.
- Romance preset has 5 declension variants on every `noun.case.*`.

**Phase 64 T2 — ablaut chains.**
- Field: `lang.ablautClassAssignment?: Record<Meaning, number>`.
- New module: `src/engine/morphology/ablaut.ts` exports
  `proposeAblautEmergence` (~0.5%/gen on high-freq verbs) and
  `decayAblautClasses` (drops entries when source vowel left
  inventory).
- Sound-change interaction: `morphology/evolve.ts:applyPhonologyToAffixes`
  mutates ablautMap keys/values when phonemes shift; identity
  entries dropped, collisions resolved first-write-wins.
- Application: `morphology/apply.ts:applyParadigm` chooses ablaut
  path over suffix when the verb is in an ablaut class.

**Phase 64 T3 — classifier agreement.**
- Type widened: `classifierTable?: Record<string, string | Phoneme[]>`.
- Auto-populated at init (`steps/init.ts`) with distinct CV forms
  per semantic class when `classifierSystem: true`.
- Realiser uses `classifierFormFor` for direct-form lookup +
  `classifierMeaningFor` for lexicon lookup.

**Phase 65 T1 — article definiteness.**
- Field: `DiscourseEntity.mentionCount` in `narrative/discourse.ts`.
- `mention()` increments count; `articleRoleToken(lang, script, ctx, meaning)`
  emits indefinite "a" when count==1, definite "the" when >1.
- Romance daughters with `articlePresence: "free"` get balanced a/the;
  presets without articles emit no DETs.

**Phase 65 T2 — logophoric pronouns.**
- Fields: `DiscourseContext.quotedFrameStack` and `logophoricCenter`.
- `pushQuotedFrame` / `popQuotedFrame` manage the stack.
- `composer.ts:pronounRoleToken` emits closed-class `3sg.log` /
  `3pl.log` when `lang.grammar.referenceTracking` is logophoric AND
  topic IS the logophoric center.
- `discourse_generate.ts:generateQuotedSpeech` is the helper that
  emits a 2-line quoted-speech narrative.

**Phase 66 T1 — grammaticalization chain.**
- Field: `lang.grammaticalizationStage?: Record<Meaning, {stage, targetCategory, lastTransitionGen}>`.
- Stages: 0 word → 1 clitic → 2 affix → 3 fused → 4 lost.
- `morphology/evolve.ts:maybeGrammaticalize` sets stage 2 + halves
  freq (does NOT delete). `progressGrammaticalizationChain` (4%/gen,
  5-gen cooldown) advances 2→3 (fusion: form shortens) or 3→4 (lost).

**Phase 66 T2 — runtime productive derivation.**
- New module: `src/engine/morphology/derivation.ts`.
- `tryDerivedFormFromMeaning(lang, meaning)` builds form for
  `${root}-${tag}` shapes when matching productive suffix exists.
- `pickRuntimeDerivedMeaning(lang, rng)` picks a transient
  derivation candidate; increments suffix usageCount.
- Phase 68b T3 wired this into `discourse_generate.ts:fillSlots`
  (5% chance per slot when productive suffix exists). Pre-fix
  the function was dead code.

**Phase 67 T1 — stress surface effects.** `phonology/apply.ts:381+`
boosts deletion + vowel rules by 1.2× when `lang.stressPattern` is
fixed (initial/penult/final/antepenult).

**Phase 67 T2 — sandhi rule evolution.** `phonology/sandhi.ts` exports
`proposeSandhiRuleEmergence` (0.8%/gen, tonal langs only) and
`decaySandhiRule` (0.4%/gen, never below 1).

**Phase 67 T3 — phonotactic gate.** `phonology/phonotactics.ts:repairToProfile`.
At coinage commit (genesis.ts), forms scoring < 0.5 against the
language's profile get epenthetic vowels inserted to break clusters.

**Phase 67 T4 — relative-clause typological constraints.** `grammar/evolve.ts:112+`
filters drift candidates by word order + case system: OV blocks
relativizer; VO blocks internal-headed; !hasCase blocks resumptive.

**Phase 68a — P0 audit fixes.**
- `lexicon/mutate.ts:deleteMeaning` now purges `inflectionClass`,
  `nounDeclensionClass`, `ablautClassAssignment`,
  `grammaticalizationStage`.
- Test fixes: `relative_clause.test.ts` (passed `lang` instead of
  `lang.grammar`); `infinitives.test.ts` (Romance phoneme tolerance
  for /r/ and /ɾ/).

**Phase 68b — Audit visibility cleanup.**
- T3: wired `pickRuntimeDerivedMeaning` into narrative slot-fill.
- T4: `seedDerivationalSuffixes` seeds `usageCount: 1` (chicken-and-egg
  fix for productivity threshold).
- T5: borrow path explicitly assigns class metadata to borrowed nouns.
- T6: LexiconView shows D/~/→ badges (decl class, ablaut, gramm
  stage); GrammarView shows verbThemes / classifierTable /
  referenceTracking.
- T7: strengthened weak `>= 0` assertions; deleted dead `it.skip`
  stubs for removed features.

**Phase 70 — Historical Mode (HOI4-style soft railroad).** New
`src/engine/historical/` module + `src/engine/steps/historical.ts`
runner. Toggled in `src/ui/PresetPicker.tsx` before run start; engine
still picks stochastically. Schedule data is pure declarations of
`BiasMilestone | SplitMilestone` lists; the runner mutates the same
runtime knobs the organic engine already writes to (`ruleBias`,
`changeWeights`, `categoryMomentum`, `volatilityPhase`). Roles
inherited via `tree/split.ts:215-220` (added in T1). Idempotency
tracked via `state.firedHistoricalMilestones`. State-level event
log `state.historicalEvents` survives the per-language event cap so
TimelineChart markers stay visible across long runs.

- T1 — `551237d` — types + UI toggle + M1 (Vulgar Latin lenition,
  gen 25): boost lenition/vowel_shift/deletion family biases on
  proto, seed categoryMomentum window, trigger volatility upheaval.
  10 unit tests + probe asserts mode-on lenition bias 2× mode-off.
- T2 — `f6ef90e` — `SplitMilestone` runner + M2 (Italo-Western /
  Eastern Romance split, gen 65). `applySplitMilestone` calls
  `splitLeaf` directly with `childCount = daughters.length`,
  post-processes daughters with role / nameHint / initialBias.
- T3 — `31a9a6a` — full schedule (M3-M10). M3 Western subsplit,
  M4 Iberian (Castilian/Lusitanian), M5 Gallo (Francien/Occitano),
  M6 Italo→Tuscan, M7 Spanish characterisation, M8 Old French
  upheaval, M9 Italian gemination, M10 Portuguese nasalisation.
  TimelineChart vertical marker pulled from `state.historicalEvents`.
  Convergence probe: 3 seeds × 200 gens; all four expected terminal
  daughters appear across seeds.
- T4 — `5e3c833` — intensity slider in PresetPicker (0–2× nudge
  scale), `historical/voice.ts:narrativeHistoricalVoice` helper for
  per-language history flavor lines.
- diagnostic — `702315a` — `scripts/probes/phase70_diagnostic_compare.ts`
  runs Romance + Historical Mode 200 gens and prints per-terminal-role
  lexicon, phonology, grammar, translator output, and narrative.
  Designed for human inspection; surfaces the engine gaps the
  Historical Mode railroad illuminates.
- 70.1 — `64782d3` — drops the gen-1 immediate split. Pre-70.1 the
  proto auto-split into 2-9 daughters at gen 1 (unrealistic). Now
  it stays a single leaf, gets a procedurally-generated name on
  gen 1, and either splits naturally via stepTreeSplit or is
  forced by a SplitMilestone (M2). Allows the eastern/Romanian
  lineage to survive consistently across seeds.
- 70.1 fix — `a0b5a3a` — idempotency test now reads
  `state.firedHistoricalMilestones` rather than per-language events
  (which the 80-event cap evicts on long-lived single proto leaves).

### Known engine gaps surfaced by Historical Mode (Phase 70 diag)

The diagnostic probe revealed gaps that are NOT Historical-Mode bugs
but engine concerns the railroad makes obvious. Documented for follow-up:
- **G1 ruleBias multiplicative stacking** — Castilian `lenition` reaches
  10–12 across nested milestone multiplications. Needs clamp.
- **G2 phoneme inventory** stays at 42–47 segments (target ~28).
- **G3 word order drifts to SOV/VSO** on lineages that should anchor SVO.
- **G4 alignment** undefined / erg-abs / split-S; Romance preset doesn't
  declare `seedGrammar.alignment`.
- **G5 western Romance daughters retain case** (real-world lost).
- **G6 closed-class words** (the/and/of/i) drift unrecognizably; the
  high-frequency dampener isn't strong enough vs M-volatility.
- **G7 translator emits case suffixes** even when `grammar.hasCase=false`.
- **G8 `go`/`be` suppletion**: lookup chain doesn't survive 200 gens.
- **G11 eastern lineage** sometimes goes extinct under default biases
  (1 of 3 seeds in early test); 70.1 helped but not always.

Plan: `/root/.claude/plans/i-want-to-make-modular-quill.md`

---

## Work in progress (Phase 69 — performance)

**Status:** Plan written, T5 + T1 + T2 + T4 implemented, NOT yet
committed. T3 (sync skip) evaluated as already-done by existing
gate at `inventoryManagement.ts:312`. Waiting on regression sweep.

**Baseline measurements** (pre-Phase-69, on `main`):
- Default 100 gens: p50=483ms, total 48s.
- Romance 100 gens: p50=522ms, total 52s.
- Default 200 gens: p50=840ms, total 151s, late avg 6.35× early.
- Per-substep breakdown (from `PROFILE_STEP=1` instrumentation):
  - phonology: 65–80% of step time
  - inventoryMgmt: 14–15%
  - genesis: 3–19%
  - all other steps: <2% each

**After T1+T2+T4 (uncommitted):**
- Default 100 gens: p50=423ms, total 42s — ~12% faster.

**Plan** lives in `/root/.claude/plans/i-want-to-make-modular-quill.md`
with the full Phase 69a + 69b breakdown.

**Files modified for Phase 69a (uncommitted):**
- `src/engine/simulation.ts` — T5 instrumentation hooks +
  `getStepTimings` / `getCumulativeTimings` API.
- `src/engine/phonology/pruning.ts` — T2/T4 `PrunePhonemesContext`
  shared cache.
- `src/engine/phonology/apply.ts` — (no change; T1 hoists upstream).
- `src/engine/steps/phonology.ts` — T1 sort hoisted to per-gen,
  combined Object.keys passes.
- `src/engine/steps/inventoryManagement.ts` — T2/T4 ctx wiring.
- `scripts/probes/phase69_perf_baseline.ts` — durable perf probe.

**Phase 69b (UI render reduction)** — not yet started:
- Narrow Zustand subscriptions in 10 components.
- Memoize `LanguageTreeView` topology.
- Memoize proto lookup + extract LexiconView badges.
- Selective state spread in store.

---

## Engine architecture (links)

For deep architecture, see `ARCHITECTURE.md` (root). Key paths:

| Path | Role |
|---|---|
| `src/engine/simulation.ts:step` | Canonical per-gen pipeline orchestrator |
| `src/engine/phonology/apply.ts:applyChangesToWord` | The hot-path inner loop (W × R × A) |
| `src/engine/phonology/pruning.ts:prunePhonemes` | Homeostatic merger w/ Phase 62 collision pre-flight |
| `src/engine/morphology/evolve.ts:inflectCascade` | Verb/noun paradigm cascade w/ Phase 63 theme strip |
| `src/engine/morphology/apply.ts:pickAffixVariant` | Variant selection by class / gender / stem-shape |
| `src/engine/lexicon/word.ts:syncWordsAfterPhonology` | Lexicon→Word table reconciliation |
| `src/engine/narrative/composer.ts:composeTargetSentence` | Discourse-genre narrative builder |
| `src/engine/narrative/discourse.ts:mention` | Discourse entity tracker (mentionCount, logophoric) |
| `src/engine/translator/realise.ts` | English-input → target-output flow |

---

## Test landscape

- ~100 test files under `src/engine/__tests__/`.
- ~10 UI tests under `src/ui/__tests__/`.
- ~5 persistence tests under `src/persistence/__tests__/`.

**Slow tests** (>30s):
- `inventory_homeostasis.test.ts` (60-gen English run): ~80s
- `ablaut_chain.test.ts` (200-gen English): ~290s
- `stress_surface.test.ts` (60+60-gen comparison): ~80s
- `procedural_integration.test.ts`: ~125s
- `taboo_clusters.test.ts` (600-gen): ~510s
- `narrative_snapshot.test.ts`: ~45s

**Run patterns:**
- `npx vitest run --reporter=basic` — full sweep (5–10 min).
- `npx vitest run src/engine/__tests__/{file}.test.ts` — focused.
- `npx vitest run --update src/engine/__tests__/narrative_snapshot.test.ts`
  — regen snapshot after intentional output changes.
- `npx tsc -b` — type-check.

**Probes (manual):**
- `npx tsx scripts/probes/phase{N}_{T}_*.ts` — per-tranche probe
  scripts.
- `PROFILE_STEP=1 npx tsx scripts/probes/phase69_perf_baseline.ts`
  — engine perf probe with per-substep breakdown.

**Playwright UX probe:**
- `npm run dev &` then
  `NODE_PATH=/opt/node22/lib/node_modules npx tsx /tmp/playwright_probe2.ts`
  → captures screenshots + console under `/tmp/playwright-audit/`.

---

## Engine state shape (Language)

The `Language` type (`src/engine/types.ts`) is the central data
structure. Key per-meaning maps that exist (so far) on each
language:

```
lang.lexicon: Record<Meaning, WordForm>           // primary form
lang.words: Word[]                                // form-keyed view
lang.wordsByFormKey: Map<string, Word>            // O(1) lookup
lang.wordFrequencyHints: Record<Meaning, number>  // [0..1]
lang.wordOrigin: Record<Meaning, string>          // "preset" / "borrow:..." / "clitic:..."
lang.wordOriginChain: Record<Meaning, string[]>   // etymology trace
lang.lastChangeGeneration: Record<Meaning, number>
lang.localNeighbors: Record<Meaning, Meaning[]>   // semantic neighbours
lang.registerOf: Record<Meaning, "high"|"low"|"neutral">
lang.altForms: Record<Meaning, WordForm[]>        // Phase 20d alternates
lang.altRegister: Record<Meaning, ...[]>
lang.colexifiedAs: Record<Meaning, Meaning[]>
lang.variants: Record<Meaning, ...>

// Phase 64+ additions:
lang.inflectionClass: Record<Meaning, 1|2|3|4>           // verbs
lang.nounDeclensionClass: Record<Meaning, 1|2|3|4|5>     // nouns
lang.ablautClassAssignment: Record<Meaning, number>      // strong verbs
lang.grammaticalizationStage: Record<Meaning, {stage, targetCategory, lastTransitionGen}>
```

Grammar features (`lang.grammar`):
```
wordOrder, affixPosition, pluralMarking, tenseMarking, hasCase,
genderCount, synthesisIndex, fusionIndex, articlePresence,
adjectivePosition, possessorPosition, negationPosition,
aspectMarking, moodMarking, evidentialMarking, harmony, alignment,
classifierSystem, classifierTable, relativeClauseStrategy,
referenceTracking,
// Phase 63:
verbThemes?: Phoneme[][],
// Phase 67:
stressPattern, ...
```

When **adding a new per-meaning field**:
1. Add to `Language` interface in `types.ts`.
2. Update `tree/split.ts` to inherit on daughter split.
3. Update `lexicon/mutate.ts:deleteMeaning` to purge.
4. Decide if `contact/borrow.ts` should populate borrowed entries.
5. Decide if the field should drift via sound-change pipeline.

---

## Known issues / unfinished

- **`git push origin main` 403'd** during Phase 68b ship —
  intermittent proxy policy. Push to `claude/working` always
  works; the FF-merge to main can be done from the user's normal
  flow when the policy lifts.
- **Phase 69 not yet committed.** T1+T2+T4+T5 done, T3 evaluated as
  redundant, regression sweep + ship pending. Plan in
  `/root/.claude/plans/i-want-to-make-modular-quill.md`.
- **`smoke_2k.test.ts`** is intentionally gated by `SMOKE_ENABLED`
  env var — leave alone.
- **Productive derivation suffix bootstrapping** (Phase 68b T4)
  starts at `usageCount: 1`. If the threshold needs further
  tuning, see `lexicon/derivation.ts:PRODUCTIVITY_THRESHOLD = 3`.

---

## Common patterns

- **Adding a new feature:** ship as one phase commit per tranche if
  small, or split into Phase Na / Nb if large. Run focused regression
  sweep + snapshot regen at the end of each. Push + FF-merge to main.
- **Changing default rates:** rebalance via `config.ts`; expect
  snapshot regen.
- **Snapshot regen:**
  `npx vitest run --update src/engine/__tests__/narrative_snapshot.test.ts`.
  Snapshot covers translateSentence (Phase 29 Tranche 7c), not the
  narrative composer per se.
- **Reset perf instrumentation between probes:**
  `sim.resetStepTimings()` on the simulation handle.

When in doubt, **read the most recent phase commit message** —
they're detailed and explain the *why*.
