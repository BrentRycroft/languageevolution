# CHANGELOG

User-facing summary of shipped phases. Format: phase tag, commit, headline, key changes.

## Phase 72 — Audit Triage (May 2026)

### Phase 72g — Architecture (foundations for the long-deferred items)
- Stratal phonology UR/SR layer (`src/engine/phonology/stratal.ts`).
  Adds `lang.lexiconUR?` for opacity detection. Does NOT yet wire
  stratal rule ordering into stepPhonology — that's the deeper
  refactor; deferred. Three helpers: `enableStratalMode`, `getUR`,
  `isOpaque`.
- Reticulate contact links (`src/engine/contact/reticulate.ts`).
  New `state.contactLinks: ReticulateLink[]` global, refreshed each
  gen via `refreshContactLinks`. Wired into the simulation pipeline.
- Translator AST IR (`src/engine/translator/ast.ts`). Foundation for
  the audit's "decouple translator from English" item. Ships
  `englishTokensToAST` + `astToTokens` + `ASTNode` / `ASTSentence`
  types. Realiser doesn't consume the AST yet (back-compat preserved);
  full IR-driven realisation is a follow-up sweep.
- Reanalysis mechanism (`src/engine/grammar/reanalysis.ts`).
  `tryReanalyseAlignment` runs before `driftGrammar` and shifts nom-acc
  → erg-abs when conditions match (Indo-Aryan pathway). Same-gen
  alignment drift is suppressed when reanalysis fires (new
  `skipFeatures` param on `driftGrammar`).
- `docs/LANGUAGE_DOMAINS.md` — structural roadmap for the eventual
  decomposition of `Language` into PhonologyState / MorphologyState /
  LexiconState / GrammarState / SocialState / GeoState / ContactState.
  Documented as a 5-6 week dedicated session; explicitly NOT
  attempted in 72g.

### Phase 72f — Sociolinguistic mechanisms (full delivery)
- Commit: `4c75286`
- Graduated endangerment: vigorous → endangered → moribund → extinct
  ladder. New `vitalityRateMultiplier` gates phonology innovation.
- Continuous `volatilityIntensity` scalar replacing the 2-state phase
  machine. Phase machine preserved for back-compat.
- `prestigeVariety` flag spawned at tier-2 promotion. ×0.5 phonology
  brake. NOT inherited by daughters (institutional, not phylogenetic).
- Thomason-gated structural borrowing (donor.tier > recipient OR
  donorPrestige). Replaces uniform literacy-only brake.
- Per-(rule, meaning) lexical diffusion timestamps. Wang S-curve
  records per-word adoption gens to `lang.perWordDiffusion`.
- Language-shift via heavy bilingualism (link ≥ 0.5 + tier or prestige
  asymmetry). Conservation: speakers transfer between leaves.
- Prestige-weighted areal typology + wave model. Adoption probability
  rebuilt as Σ frac × (1 + 0.5 × tierGap) × (1.5 if prestigeVariety).

### Phase 72e — Stress tests + observability
- 9 new stress tests covering empty lexicon, event-cap truncation, deep
  tree, extinct ancestors, translator edge inputs, sparse-lexicon
  narratives.
- New `scripts/run-all-probes.ts` runner. `--list` enumerates,
  `--run [filter]` executes probes sequentially.
- New `CHANGELOG.md` (this file).
- New `docs/SAVE_FORMAT.md` documents `SavedRun.version: 9` shape.

### Phase 72d — Per-meaning field registry + meaning-merger pathway tracker
- Commit: `52a8e46`
- New `src/engine/perMeaningFields.ts` registry replaces the manual
  checklist for `tree/split.ts` inheritance and `lexicon/mutate.ts`
  delete-purges. Adding a new per-meaning field requires registering
  it once.
- New `lang.meaningHistory` records merger pathways when meanings are
  recarved/bleached. Reverse translation can recover orphaned
  meanings via this trace. Full UUID-based concept registry deferred.

### Phase 72c — Morphology integrity (audit Contract C4)
- Commit: `ab6ae48`
- `inflect()` now bails to bare stem when paradigm.affix and all
  variants are empty (Contract C4 fix; silent paradigm collapse).
- Verb-theme reanalysis on phonology drift: themes that match no
  verbs in the lexicon are pruned (proto theme always preserved).

### Phase 72b — Closed-class typology + tense AUX injection + railroad trim
- Commit: `93de678`
- Fragment translator applies tense morphology from AUX cues
  ("he didn't go" → past-tense form).
- Language-specific `closedClassInventory` (Romance preset declares
  its own; Mandarin / Polynesian could declare empty inventories).
- Split SWADESH_CORE_SET into content (×0.4 brake) and closed-class
  (×0.3 brake). Function words drift slower than content per Bybee.
- Trimmed M4-M6 grammarPatch in Romance schedule (audit Theme F);
  daughters now inherit from M3 parent rather than re-patching.

### Phase 72a — Quick wins from audit
- Commit: `eba00c3`
- **Tier-3 orthography drift multiplier flipped 3 → 0.2** (was
  inverted; tier-3 standardised languages now resist drift).
- closedClassTable cache invalidation on phonology + lexicon mutations
  (Invariant 1 fix; the/of/and/i/etc. now reflect current phonology).
- categoryMomentum cleanup on expiry (Contract C7 fix).
- state.historicalEvents capped at 200 (Contract C8 fix).
- Founder innovation records `wordOrderLastFlipGen` on flip
  (Contract C6 / Invariant 3 fix).
- Translator filters quoted placeholder strings from `arranged` output.
- Poetry stanza preserves morphological gloss (audit S5 critical fix).

## Phase 71 — Engine Gap Triage (May 2026)

### Phase 71d — `grammarPatch` + `lockWordOrderUntilGen` for schedule
- Commit: `51457c8`
- New `BiasMilestone.grammarPatch` and `lockWordOrderUntilGen` fields.
- Founder innovation respects word-order cooldown.
- tree/split.ts inherits `wordOrderLastFlipGen` from parent.
- Romance schedule applies SVO + nom-acc + hasCase patches per tier.

### Phase 71c — Closed-class anchor + inventory tightening
- Commit: `a10c340`
- Extended SWADESH_CORE_SET with closed-class lemmas (later split in 72b).
- Romance `seedPhonemeTarget` 30 → 26.
- Romance `seedRuleBias` disfavors length-emergence rules.

### Phase 71b — Translator + suppletion fixes
- Commit: `db9624e`
- `inflect()` skips noun-case paradigms when `!grammar.hasCase`.
- `PROTECTED_MEANINGS` shields suppletive verbs (be/go/etc.) from
  `deleteMeaning`.

### Phase 71a — Quick wins (clamp ruleBias + alignment default)
- Commit: `ba22a3b`
- `applyBiasMilestone` clamps `ruleBias` to [0.2, 4.0],
  `changeWeights` to [0.05, 12.0].
- `DEFAULT_GRAMMAR.alignment = "nom-acc"` default declared.
- Romance preset declares `seedGrammar.alignment = "nom-acc"`.

## Phase 70 — Historical Mode (April 2026)

### Phase 70.1 — Drop gen-1 immediate split
- Commits: `64782d3`, `a0b5a3a`
- Proto stays a single leaf until natural splits or M2 fires.
- Procedural name generated on gen 1.

### Phase 70 T1-T4 — HOI4-style railroad
- T1 `551237d`: scaffold + M1 (Vulgar Latin lenition burst).
- T2 `f6ef90e`: SplitMilestone runner + M2 (Italo-Western/Eastern).
- T3 `31a9a6a`: full M3-M10 schedule + TimelineChart markers.
- T4 `5e3c833`: intensity slider + narrative voice helper.
- Diag: `702315a` — `phase70_diagnostic_compare.ts` gap-finder.

## Phases 60-68 (recap)

See CLAUDE.md for the full Phase 60–68 commit table. Highlights:

- 68b `6fa467e`: Audit cleanup; runtime derivation wired; UI badges.
- 68a `0342466`: P0 audit fixes (deleteMeaning leak; broken tests).
- 67 `556b8d3`: Phonology dynamism (stress, sandhi, phonotactics).
- 66 `9b6a3b9`: Lexicon dynamics (grammaticalization, derivation).
- 65 `d7c1e68`: Discourse + reference (articles, logophoric pronouns).
- 64 `b826153`: Morphological dynamism (declension, ablaut, classifier).
- 63 `4a075a1`: Verb-theme stripping.
- 62 `f2b3b1f`: Pre-flight homonym-collision cap on phoneme mergers.
- 61 `5e5ca13`: Narrative randomness (POS-driven slot-fill).
- 60 `0f953fa`: Rate rebalance.
