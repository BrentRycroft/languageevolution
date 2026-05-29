# ROADMAP — autonomous realism loop

This file is the **durable brain** of the `auto/realism` autonomous loop. After
any context compaction, the next iteration re-orients from THIS file + `git log`
+ `ARCHITECTURE.md`. If this file and the code disagree, the code wins — fix
this file.

## North star

A fully functioning, dynamic-yet-realistic, **language-agnostic**
language-evolution simulator — emergent behaviour that is also typologically
plausible — plus the immersive features that let a user *experience* the
languages it grows, and which keeps getting faster as it grows. Three faces:

1. **Engine** — language change over time across every layer (phonology …
   phylogenetics).
2. **Immersive** — the translator (weak, needs heavy improvement) and narrative
   generation (random words assembled by the language's own grammar via
   universal-grammar rules).
3. **Content** — presets: expand/fix, more words, remove English-based encoding.

## Scope horizons

- **NOW (active):** fast trustworthy green baseline; engine realism; translator
  quality; narrative generation; preset expansion/de-anglicization;
  language-agnosticism; performance improvement.
- **LATER (do NOT build autonomously — keep the door open):** detailed Earth map
  for geographic spread of language families; eventually multiple language
  families simulated at once. Avoid decisions that foreclose these; log a small
  enabling item or a NEEDS DECISION when something would block them.

Non-exhaustive; the user queues more ideas — fold them in here.

## Realism & quality checklist (scoreboard: none / partial / solid)

| Area | State | Gap note |
|------|-------|----------|
| Phonology (sound change) | solid | Mature; also the perf hot path (apply.ts). |
| Phonotactics & prosody | partial | Drift + stress exist; assess depth when touched. |
| Morphology (infl/deriv/fusion/ablaut) | partial | Broad coverage; assess realism per-axis. |
| Syntax (order/alignment/agreement) | partial | Typology axes exist; check agnosticism. |
| Semantics (drift/colex/metaphor) | partial | Colexification + recarve exist; metaphor? assess. |
| Lexicon (coin/borrow/compound/loss) | partial | Strong; compounding depth unassessed. |
| Sociolinguistics (register/prestige/endangerment) | partial | Phase 72 added prestige/endangerment/bilingual. |
| Contact (borrow/creole/areal) | partial | Exists; realism of areal waves unassessed. |
| Phylogenetics (splits/divergence/cognates) | solid | Phase 73 typological divergence. |
| **Translator** | partial | Feature-rich (aspect/mood/voice/switch-ref/numerals/per-lang case+article/AST word-order path). Word-level `translate()` now uses the shared cascade (fixed). Remaining: realiser still on legacy English NP/VP/PP IR (role-IR migration incomplete — see NEEDS DECISION); graceful fallback compound-only. |
| **Narrative generation** | partial | Phase-53 grammar-driven: words sampled from the lang's own lexicon (freq-weighted, not English pools); order via `grammar.wordOrder`; morphology stacked by `synthesisIndex` (gated on paradigms existing); copular predication now emits an overt copula (or zero-copula juxtaposition); complex typology routed through the translator. Residual: deep-routing round-trips through an English string (inherits translator-realiser limits); live output quality unverified. |
| **Presets — coverage** | partial | 7 (default Swadesh + pie/germanic/romance/bantu/tokipona/english); families typologically authentic. |
| **Presets — word count** | partial | ~240-concept ceiling (basic240 fillMissing); Bantu ~220 hand-authored, default 44 core + filled. Expanding the concept registry is the lever for "more words". |
| **Presets — de-anglicization** | partial | Forms are NOT relexified English (Bantu = real proto-Bantu w/ tone+noun-classes; default CORE = PIE reconstructions: water/pur/mater/pater/nokt/pod/kerd/kaput). REAL issue: the shared English concept inventory carves semantic space identically (arm≠hand; Bantu duplicates the form `mukono` instead of declaring colexification). → `seedColexification` hook lets presets declare colexifications; Bantu (arm=hand, mouth=lip, flesh=meat) + Toki Pona (sun=day, sky=god, eat=drink, fight=war, word=name); IE presets pending. |
| **Language-agnosticism** (cross-cutting) | partial | Translator adj/possessor ordering verified language-driven (regression test); RC ordering still English-ish (realiser). Narrative grammar-driven; presets de-anglicized via seedColexification. |
| **Performance** | partial | apply.ts hot path; known optimisation targets open. |
| **UX / GUI** | needs assessment | No play session run yet. |

## Backlog (top = next)

- [x] Trim PR long-pole tests `phase72_code_review_batch_b` and
      `phase73d_direction_vector` to <60s without weakening assertions.
- [x] Ran the end-to-end `RUN_SLOW=1` pass (35.6 min wall; **1873 pass / 1 FAIL
      / 8 skip**). NOT clean yet — surfaced one real, pre-existing failure (next
      item). Log: `runslow-baseline.log` (untracked, do NOT commit).
- [x] **Fixed the RUN_SLOW failure** (`driftOneMeaning` × PROTECTED_MEANINGS) —
      implemented option (b): a protected source now drifts polysemously
      (recordColexification, keeps m + freq/register), OR'd last to preserve rng
      order. Verified: tsc clean; the property test + determinism + colexification
      + semantic_modules + narrative_snapshot all green. Full RUN_SLOW
      re-confirmation in progress (background).
- [x] **FAST-TIER long pole fixed: `historical.test.ts` was ungated** yet ran
      multiple 200-gen Romance+historical sims (one ~443s under load). Gated
      wholesale to nightly via the vite.config exclude (predominantly heavy).
      Verified: fast-tier `vitest list` → 0 historical tests; RUN_SLOW → 36.
- [ ] (follow-up, low priority) Split `historical.test.ts`'s cheap schedule/
      voice config units into a light fast-tier file so they still run on PRs.
- [ ] Sweep oversized `sim.step()` gen-counts in RUN_SLOW files; reduce where
      the assertion doesn't require them. **(Blocked on the RUN_SLOW timing data
      above. Once `runslow-baseline.log` completes, MINE it for the slowest
      tests across ALL files — the verbose log has per-test ms — to find every
      mis-gated heavy file like historical.test.ts, not just the RUN_SLOW set.
      NOTE: grep shows big loops — cluster_expansion 500, tone_sandhi 1000,
      typological_completion 1000, sampling 3000 — in the FAST tier; verify
      whether they break early / aren't sim.step before touching. Don't weaken
      statistical/long-run assertions.)**
- [~] Baseline GUI play session — autonomous browser-driving is NOT available in
      this environment (no Playwright/screenshot/click tool; WebFetch only does
      public URLs as markdown — useless for a localhost JS SPA). Automatable
      substitute DONE: production `npm run build` passes (1200 modules, PWA SW
      generated) + tsc + unit suites green. LIVE behavioural play (click-through,
      reading output) is deferred — see NEEDS DECISION ("GUI verification").
- [ ] (perf, low priority) Main bundle chunk is 944 kB (Vite >500 kB warning).
      Code-split (dynamic import / manualChunks) to cut initial load. Touches
      app load time, not sim speed.
- [x] Assess translator quality (code-level): feature-rich, but word-level
      `translate()` is weaker than the sentence path; realiser on legacy English
      IR; fallback compound-only. (Live-phrase check deferred to GUI play.)
- [x] Translator: word-level `translate()` now routes through the shared
      `lookupFormWithResolution` cascade as a final fallback (after the
      exact/neighbor/compound chain, before "missing"), so single-word lookups
      gain synthesis / concept-decomposition / colexification / graceful coinage
      — matching the sentence path. Additive (existing tests unchanged) + a new
      reverse-colex regression test. Verified: tsc + 77 translator tests green.
      (Live GUI check folded into the pending baseline play-session item.)
- [x] Translator anglocentrism audit (programmatic, not GUI): adjective +
      possessor ordering correctly follow `grammar.adjectivePosition` /
      `possessorPosition` (Bantu post, English pre) — NOT English-shaped. Locked
      with `translator_agnosticism.test.ts`. FOUND: relative-clause ordering is
      scrambled for post-nominal languages (Bantu "the king who sees the dog
      walks" → "see dog who king walk") — a legacy-realiser IR limitation.
- [ ] Translator: fix relative-clause ordering for non-English typologies (RC
      should follow the head noun in post-nominal langs, respect
      `relativeClauseStrategy`). Tied to the realiser-refactor NEEDS DECISION —
      likely needs the role-IR migration; scope before touching.
- [x] Assess narrative generation (code-level): genuinely grammar-driven
      (Phase 53 T6 de-anglicized it) — language's own lexicon + `wordOrder` +
      `synthesisIndex`-gated morphology; complex typology via the translator.
      Not English-pool-based.
- [x] Narrative: simple-render copular shape now emits the copula (placed like
      a verb per wordOrder) when `lang.lexicon["be"]` exists; zero-copula
      languages keep bare juxtaposition. + focused test (narrative_copula).
      Verified: tsc + 88 narrative/composer tests green.
- [ ] Narrative live-quality check — fold into the baseline GUI play session:
      read whether multi-line output reads like a real (non-English-shaped)
      language across SOV / ergative / tonal presets.
- [x] Audit presets for English-based encoding (code-level): forms are NOT
      relexified English (Bantu authentic proto-Bantu; default lexicon is
      PIE-flavored). Real anglocentrism = the shared English concept inventory.
- [x] De-anglicization: added the `seedColexification` config hook (winner →
      absorbed meanings) + wiring in init.ts → populates `colexifiedAs` at
      language birth; the lookup cascade's reverse-colex rung resolves an
      absorbed meaning to the winner's form. + tests (seed_colexification).
      Design question resolved: it RECORDS the colexification (one shared form);
      whether the absorbed meaning also has its own seedLexicon entry is an
      orthogonal preset-authoring choice.
- [x] De-anglicization (adopt the hook): Bantu now declares arm=hand (mukono),
      mouth=lip (mulomo), flesh=meat (ɲama) via `seedColexification`, with the
      duplicate `arm`/`lip`/`flesh` entries removed — all registry-backed
      (`COLEX_PAIRS`). Absorbed meanings resolve to the winner's form via the
      cascade. Verified: tsc + preset_coverage/ipa + phonotactics +
      phase_29_invariants (30-gen Bantu) + concepts + determinism green (108).
- [~] De-anglicization (more): Toki Pona done — declared 5 registry-attested
      colexifications (sun=day, sky=god, eat=drink, fight=war, word=name) and
      removed the duplicates. This exposed + fixed a latent cascade bug:
      declared colexifications (`colexifiedAs`) now resolve BEFORE synthesis
      (lookup.ts rung 2b), so an absorbed meaning surfaces as the shared lexeme
      rather than a coined form. Remaining presets with attested duplicate
      pairs: PIE (tree=wood, eye=face, flesh=meat), Germanic (flesh=meat),
      Romance (flesh=meat, child=baby), Bantu (also child=son, lie=sleep). One
      preset at a time.
- [ ] Presets "more words": quantify each preset's hand-authored vs filled
      coverage and raise the ~240-concept ceiling (basic240) / add authentic
      forms for new concepts. Scope before doing.

## Done log

- (baseline) Pre-existing engine fixes + test speedups + two-tier CI + arch-doc
  updates were committed as `853b7ec "yay"` and merged to `main` via PR #176.
  The loop branches `auto/realism` from that point.
- De-anglicized Toki Pona: declared 5 registry-attested colexifications
  (suno=sun/day, sewi=sky/god, moku=eat/drink, utala=fight/war, nimi=word/name)
  via seedColexification; removed the duplicate entries + a stale `drink` freq
  hint. + Toki Pona test in seed_colexification.
- Fixed declared-colexification resolution precedence (lexicon/lookup.ts): moved
  the `colexifiedAs` reverse-colex rung BEFORE synthesis (new rung 2b). A
  recorded colexification (seeded OR evolved via drift/merge) now resolves an
  absorbed meaning to the winner's lexeme instead of letting synthesis coin a
  novel form — a latent bug Toki Pona exposed (e.g. "god" was coining a form
  instead of surfacing sewi). Translator-only path (no sim-determinism impact);
  324 translator/narrative/lookup/preset/determinism tests green.
- Translator anglocentrism audit (programmatic): confirmed adjective + possessor
  ordering follow the language's typology (Bantu post-nominal, English pre-), not
  English — locked with translator_agnosticism.test.ts (2 tests). Surfaced a real
  relative-clause ordering problem for post-nominal languages (logged as a
  follow-up under the realiser NEEDS DECISION). tsc + test green.
- Extended Bantu colexifications to mouth=lip (mulomo) and flesh=meat (ɲama) —
  both registry-attested COLEX_PAIRS stored as duplicate forms; dropped the
  `lip` and `flesh` duplicates. tsc + preset/Bantu/determinism green (108).
- Bantu adopts `seedColexification`: declares arm=hand (*mukono) and drops the
  duplicate `arm` entry — registry-backed (`colexWith` already pairs them), so
  arm resolves to hand's form via the cascade. First real de-anglicization of a
  preset's concept inventory. Principle: arm/hand colexification is pan-Bantu
  and cross-linguistically common. tsc + preset/Bantu/determinism tests green.
- Added the `seedColexification` config hook (types.ts + init.ts): presets can
  declare concepts that share one lexeme (winner → absorbed meanings), recorded
  on colexifiedAs at birth and resolved via the lookup cascade's reverse-colex
  rung. The de-anglicization lever — lets a language carve its own concept space
  (Bantu arm=hand) rather than mirror the English seed inventory. Additive (no
  preset adopts it yet); + seed_colexification tests; tsc + determinism green.
- Narrative simple-render copular path now emits an overt copula (placed like a
  verb per `grammar.wordOrder`) when the language has lexicalised "be";
  zero-copula languages keep bare S–A juxtaposition. Principle: overt-copula vs
  zero-copula is a typological parameter. + focused test (narrative_copula);
  tsc + 88 narrative/composer tests green.
- Routed word-level `translate()` through the shared `lookupFormWithResolution`
  cascade (translate.ts) as a fallback before "missing", so single-word lookups
  match the sentence path's resolution power (synthesis / colexification /
  graceful coinage). Additive — the exact/neighbor/compound chain still runs
  first (river→water preferred over coining a fresh form). tsc + 77 translator
  tests green; added a reverse-colex regression test.
- Fixed the nightly's lone failure: `driftOneMeaning` × PROTECTED_MEANINGS
  (`drift.ts`). A protected source meaning (be/eat/go/…) couldn't be removed by
  the Phase-71b guard, so drift left its form on both source+target while
  reporting a clean move and purging the source's freq/register. Per user choice
  (option b), a protected source now drifts polysemously: m is kept, freq/register
  preserved, m↔target colexification recorded. Implemented as an rng-order-
  preserving one-liner (OR'd last) so determinism + all other trajectories are
  unchanged. Principle: protected core vocabulary persists and broadens
  (colexifies) rather than being lost — matches the Phase-71b protection intent.
- Gated `historical.test.ts` to the nightly tier (vite.config exclude). It was
  ungated yet ran multiple 200-gen Romance+historical sims, silently bloating
  the fast PR suite. Verified via `vitest list` (0 in fast, 36 in nightly).
- Trimmed the two PR long-pole tests under 60s (test-only): B7 runs a
  non-splitting lineage (intrinsic drift property — tree splitting was
  irrelevant cost+noise), 37.5s→20s; phase73d shares one 60-split sample across
  its five statistical tests via beforeAll (~5× less compute, same power),
  66s→~17s. Both files now <60s; combined wall 80s→50s.

## UX findings

- 2026-05-29: production `npm run build` is green (1200 modules, PWA service
  worker generated) after the drift/translator/narrative changes — app compiles
  + bundles cleanly. Main JS chunk is 944 kB (logged as a perf follow-up).
- Live behavioural GUI observations can't be gathered autonomously here (no
  browser-driving tool) — this section will fill once a play session is possible
  (user-run, or via a browser tool). See NEEDS DECISION.

## Assessment notes

- **Translator** (read pipeline/translate/syntax/sentence/gracefulFallback,
  2026-05-29): feature-rich. Sentence path: tokeniseEnglish → parseSyntaxAll →
  `translateViaTree` (realiseSentence) or `translateFragment`; a newer
  `translateSentenceViaAST` projects a language-neutral AST to target word order
  before realising. Lemma resolution = shared 8-rung `lookupFormWithResolution`
  (translator + narrative). Output respects target wordOrder/caseStrategy/
  articlePresence/numeralBase/aspectSystem/moodMarking. Weak spots: (1) word-
  level `translate()` uses a shallower exact→neighbor→compound chain and gives
  up to "missing" instead of the 8-rung cascade; (2) realiser consumes the
  legacy English IR (role-IR migration incomplete) → see NEEDS DECISION;
  (3) `attemptGracefulFallback` is compound-only since Phase 58.5.
- **Presets** (read index/bantu/default lexicon, 2026-05-29): NOT relexified
  English. Bantu = authentic proto-Bantu (tone ˩˥, prenasalized ⁿg/mb/nd, 8
  noun classes, verb agreement, CV/maxCoda-0, post-head modifiers, honorific,
  subjunctive). Default CORE lexicon = PIE reconstructions (water/pur/mater/
  pater/nokt/pod/kerd/kaput), unlisted concepts filled by `fillMissing` from a
  neutral Latin-ish phoneme set. The anglocentrism that remains is the SHARED
  English concept inventory (every preset lexicalizes the same English Swadesh
  set and carves semantic space the same way) — that's the "English with
  different words" risk at the concept level, not the form level.
- **RUN_SLOW baseline timing** (2026-05-29; 35.6 min wall, tests-cum 15900s,
  collect 516s = 8.6 min — high, worth a separate perf look). Mega long poles
  (ms inflated by parallel CPU contention but relative order holds):
  `phase73d_synthesis_divergence` "4-daughter @gen300" ~1922s; `properties.test`
  "alive leaf through long runs" ~1906s; `historical.test` (FAST-tier, ungated!)
  "200 gens inventories" 443s / "4 terminal daughters" 352s / "ruleBias clamp"
  225s / "Tuscan accusative" 105s; `properties` determinism 84s / monotonic 53s /
  tree-never-shrinks 72s. → item-2 targets: the two ~30-min RUN_SLOW tests +
  ungated historical.test; + investigate the 8.6-min collect cost separately.
- **Narrative generation** (read narrative/generate.ts, 2026-05-29): well
  de-anglicized. `generateNarrative` → `planSkeletonForLanguage` (samples
  S/V/O/adj from the lang's lexicon by POS, freq-weighted) → `realizeSkeleton`.
  Two render paths: (1) deep routing (`usesDeepRouting`: non-nom-acc alignment /
  harmony / classifiers / evidentials / RC-strategy / serial-verbs / politeness)
  builds an English clause string and routes it through `translateSentenceViaAST`
  for full pipeline treatment; (2) simple render inflects via synthesisIndex-
  gated stacks and arranges with `arrange(grammar.wordOrder, …)`. Residual:
  the deep path's English round-trip inherits the translator-realiser limits
  (NEEDS DECISION); simple-render copular path lacks copula logic.

## NEEDS DECISION

- **Translator realiser refactor.** `realise.ts` is a ~766-line monolith
  hardcoding word-order/alignment/NP-VP realisation; the Phase 41c stage-hook +
  role-IR migration is incomplete (it still consumes the legacy English-shaped
  `Sentence/NP/VP/PP` IR). Finishing it would make sentence STRUCTURE fully
  typology-driven, but it's a large, behaviour-changing refactor. Options:
  (a) leave as-is — output is already reordered per target word-order/case/
  article via `astToTokens`, so it's not pure relexified English;
  (b) incrementally move one realise-stage at a time behind the existing hooks;
  (c) full role-IR rewrite. Needs your call on appetite/scope before I touch it.

- **GUI verification capability.** The loop prompt asks for periodic GUI play
  sessions ("see the app the way the user does"), but this environment has NO
  browser-driving tool (no Playwright/screenshot/click; WebFetch is public-URL
  markdown only). So I can verify the app COMPILES/BUNDLES (npm run build),
  TYPECHECKS, and passes unit/integration tests — but I cannot click through the
  running UI or read rendered narrative/translator output live. Options:
  (a) you run manual GUI play sessions and paste findings here;
  (b) add a browser-driving MCP/tool so I can drive it headlessly;
  (c) accept build + unit verification as the substitute and drop live GUI from
  the loop. Until you choose, I treat `npm run build` + targeted unit tests as
  the "it works" gate and defer live behavioural checks.
