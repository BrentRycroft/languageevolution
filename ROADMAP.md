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
| Syntax (order/alignment/agreement) | partial | Typology axes exist; check agnosticism. Soft Greenberg universals (grammar/universals.ts) enforce SOV↔postposition + SOV↔pre-adj/num/possessor (OV⟹GenN). Adposition order is caseStrategy-driven (realiser); case langs drop oblique adpositions (deliberate — possible realism gap, not yet a decision). |
| Semantics (drift/colex/metaphor) | partial | Colexification + recarve exist; metaphor? assess. |
| Lexicon (coin/borrow/compound/loss) | partial | Strong; compounding depth unassessed. |
| Sociolinguistics (register/prestige/endangerment) | partial | Phase 72 added prestige/endangerment/bilingual. |
| Contact (borrow/creole/areal) | partial | Exists; realism of areal waves unassessed. |
| Phylogenetics (splits/divergence/cognates) | solid | Phase 73 typological divergence. |
| **Translator** | partial | Feature-rich (aspect/mood/voice/switch-ref/numerals/per-lang case+article/AST word-order path). Word-level `translate()` now uses the shared cascade (fixed). Remaining: realiser still on legacy English NP/VP/PP IR (role-IR migration incomplete — see NEEDS DECISION); graceful fallback compound-only. PLAY-SESSION FINDINGS (2026-05-29): the sentence path DOES gracefully coin missing words (populateForms→resolveOpen→cascade); `«lemma»` markers appear ONLY for lemmas not in the CONCEPTS registry (cascade's anti-gibberish guard) — e.g. "man"/"woman" are unregistered → markers (backlog: register them). Ditransitive double-object drops the theme (backlog, fix written, re-diagnose marker). |
| **Narrative generation** | partial | Phase-53 grammar-driven: words sampled from the lang's own lexicon (freq-weighted, not English pools); order via `grammar.wordOrder`; morphology stacked by `synthesisIndex` (gated on paradigms existing); copular predication now emits an overt copula (or zero-copula juxtaposition); complex typology routed through the translator. Residual: deep-routing round-trips through an English string (inherits translator-realiser limits); live output quality unverified. |
| **Presets — coverage** | partial | 7 (default Swadesh + pie/germanic/romance/bantu/tokipona/english); families typologically authentic. |
| **Presets — word count** | partial | ~240-concept ceiling (basic240 fillMissing); Bantu ~220 hand-authored, default 44 core + filled. Expanding the concept registry is the lever for "more words". |
| **Presets — de-anglicization** | partial | Forms are NOT relexified English (Bantu = real proto-Bantu w/ tone+noun-classes; default CORE = PIE reconstructions: water/pur/mater/pater/nokt/pod/kerd/kaput). REAL issue: the shared English concept inventory carves semantic space identically (arm≠hand; Bantu duplicates the form `mukono` instead of declaring colexification). → `seedColexification` hook lets presets declare colexifications; all presets de-anglicized — Bantu (arm=hand, mouth=lip, flesh=meat, child=son, lie=sleep), Toki Pona (sun=day, sky=god, eat=drink, fight=war, word=name), PIE (tree=wood, eye=face, flesh=meat), Germanic (flesh=meat), Romance (flesh=meat, child=baby); default/English have no attested duplicate pairs. |
| **Language-agnosticism** (cross-cutting) | partial | Translator adj/possessor/numeral/relative-clause ordering verified language-driven (regression tests; RC fixed). GAP: demonstratives hardcoded prenominal (no demonstrativePosition axis — logged, needs decision). Narrative grammar-driven; presets de-anglicized (Bantu + Toki Pona). |
| **Performance** | partial | Profiled (PROFILE_STEP via vitest, 2026-05-29): phonology = **64-67%** of step time, inventoryMgmt ~18%, genesis ~15%, all else <1%. So apply.ts IS the macro hot spot; its dominant cost is the per-word×rule `probabilityFor` (countSites scan + Math.pow). **DONE: trigger pre-filter (factory subset)** — factory rules (simpleSub/contextSub/mappingSub) now expose `triggers` (the `from`/mapping phonemes); the hot loop skips a rule via an O(1) `includes` check when none are present (provably probability 0). Byte-identical (perfcheck hashes c2e431df/524c8f2c/e7b438a3 unchanged); skips **26-30%** of probabilityFor calls → **0.8-1.7% faster phonology pass** (interleaved drift-cancelled A/B). NEGATIVE/reverted earlier: word-invariant scalar hoist (no win, allocation offset it — see Assessment notes; don't re-attempt). NEXT (bigger win, NEEDS DECISION): extend `triggers` to the ~43 inline catalog rules — would multiply the skip rate, but needs per-rule byte-identical auditing. Bundle: 944 kB main chunk (load-time). |
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
      Don't weaken statistical/long-run assertions.) CHECKED 2026-05-29: the
      previously-suspected fast-tier loops (cluster_expansion, tone_sandhi,
      typological_completion, sampling) are actually CHEAP — 5/37/17/237ms — the
      big loop bounds break early / aren't sim.step. NOT the long pole; lead
      closed. The real fast-tier signal: full `npx vitest run` wall ≈ 149s with
      cumulative collect ≈ 162s (across workers) — the COLLECT/transform cost
      (module graph), not any single sim loop, is the thing worth a separate
      look. Per-file fast-tier timing not yet captured.)**
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
- [x] Translator: fixed relative-clause ordering — the "relativizer" strategy
      emitted the clause BEFORE the head (prenominal), scrambling VO languages
      (Bantu "the king who sees the dog" → "see dog who king"). Relativizer-
      strategy langs are VO (per the RC drift constraints) → postnominal RC
      (head + relativizer + clause). Surgical one-branch fix in realise.ts
      `attachRelativeClause` (no role-IR rewrite). + RC regression test
      (translator_agnosticism). Verified: 159 translator/narrative/RC/
      determinism tests green.
- [x] Translator: numeral placement verified language-driven (Bantu postnominal
      "dog two", English prenominal "two dog") — follows the language's modifier
      order. Locked with a regression test (translator_agnosticism).
- [ ] Translator/grammar: demonstratives are placed PREnominally for ALL
      languages — there is NO `demonstrativePosition` grammar axis. Anglocentric
      for postnominal-demonstrative languages (many Bantu: Swahili "kitabu hiki"
      = book-this). Adding the axis is a feature (grammar field + default + drift
      correlation, likely with adjectivePosition / Greenbergian consistency +
      realiser wiring + per-preset values). NEEDS DECISION on default + drift
      behaviour before building — don't guess.
- [ ] **Translator: register "man"/"woman" (and audit other basic unregistered
      concepts) so they coin instead of marking** (Toki Pona handled directly via
      its preset lexicon — see Done log; this item is the GENERAL fix for any
      minimal language. LOWER priority: ripples genesis, narrow benefit.)
      (CORRECTED DIAGNOSIS, 2026-05-29
      — supersedes the earlier "sentence-path doesn't coin" claim, which was
      WRONG). The sentence path ALREADY gracefully coins: `realiseSentence` →
      `populateForms` → the `resolveOpen` dep → `lookupFormWithResolution` (full
      8-rung cascade, coinage on). Verified: "the king eats the bread" / "...the
      computer" in Toki Pona COIN (synth-fallback), no marker. The `«lemma»`
      marker appears ONLY when rung-8 coinage is REFUSED, gated by
      `isValidEnglishLemma` (englishWordlist.ts) → `isAcceptedStem` →
      `isRegisteredConcept(id) = id in CONCEPTS`. Root cause: **"man" and "woman"
      are not registered concepts** (absent from `basic240.ts` CLUSTERS AND
      `expanded_concepts.ts`), so the cascade treats them as gibberish and won't
      coin → `«woman»`. (NB: "person", "child" ARE registered.) FIX: add man/woman
      (+ sweep for other missing basics) to `EXPANDED_CONCEPTS` (lower ripple than
      BASIC_240 — registers them as coinable WITHOUT forcing birth-lexicalization;
      pos:noun, cluster:"kinship", a tier that doesn't auto-lexicalise). RISK: a
      registry change ripples into genesis/CONCEPT_IDS → sim trajectories →
      verify-first with a FULL `npx vitest run` (basic240/concept/preset_coverage +
      determinism). DEAD END (don't repeat): adding a cascade fallback inside
      `realiseNP` is a NO-OP — resolution happens in `populateForms` before
      `realiseNP` runs.
- [x] **Translator: ditransitive double-object now keeps both args** (DONE — see
      Done log; the «marker» that blocked it earlier no longer occurs: bread coins
      and all args resolve). The parser (`parse.ts`
      collectParticipant) collects only ONE post-verbal NP, so "give you the big
      stone" keeps the recipient ("you", mislabelled theme) and SILENTLY DROPS the
      theme. The argframe already has `give:[agent,theme,recipient]`; the recipient
      role surfaces downstream. WORKING fix (verified end-to-end, then reverted):
      skip consumed heads in collectParticipant's scan (no-op for single-object
      calls) + for recipient-frame verbs collect a 2nd object and mark the first as
      a dative `to`-PP adjunct → "give [theme] to [recipient]" per the target's
      adposition typology (Romance "I give big stone you", Bantu "I give stone big
      to you", PIE SOV "I big stone you to give"). + 2 parser_role_ir regression
      tests (re-add them). It tripped `narrative_snapshot`'s «»-marker assertion on
      "i give you the bread" — I ASSUMED the marked word was "bread", but bread
      coins fine standalone, so the real culprit is unconfirmed (maybe the dative
      "you" PRON, or a participant NP not walked by populateForms). RE-DIAGNOSE by
      printing the exact «marked» token (throwaway inspector) before re-applying;
      the man/woman registry item may or may not be related.
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
- [x] **Translator: object head dropped in a two-NP sentence with adjectives** —
      FIXED (see Done log). Root cause was synonym adjectives (large/tiny)
      mis-tagged as N by the tokenizer; normalized them to big/small before
      POS-tagging. + parser_role_ir regression test.
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
- [x] De-anglicization (more): COMPLETE across all presets. Bantu (arm=hand,
      mouth=lip, flesh=meat, child=son, lie=sleep) + Toki Pona (sun=day, sky=god,
      eat=drink, fight=war, word=name) + PIE (tree=wood, eye=face, flesh=meat) +
      Germanic (flesh=meat) + Romance (flesh=meat, child=baby). All registry-
      attested (`COLEX_PAIRS`); duplicate forms removed; absorbed senses resolve
      to the winner via the cascade (precedence fixed at rung 2b). default +
      English have no attested duplicate pairs. A general test in
      seed_colexification verifies every preset's declared colexifications.
- [ ] **(MILESTONE — ripples genesis, needs full suite) Concept-registry +
      coinage gaps surfaced by play sessions.** Some basic words a language lacks
      surface as `«lemma»` markers (core args, which the manner-adverb drop above
      doesn't cover): (a) "quick" is UNREGISTERED though its synonym "fast" is in
      the quality cluster — register it (colex with fast) or add a small
      English-synonym normalization map (quick→fast) in the translator (the latter
      is sim-non-rippling — preferred); (b) "wolf" IS registered (basic240 animals)
      but `attemptGracefulFallback` returns null for some langs (Bantu/PIE) → marks
      — investigate why coinage fails for a registered concept (isGrounded?). NB:
      registering concepts ripples genesis (need.ts checks raw `lex[m]`), so that
      path is milestone-level; the synonym-map path is the fast one.
- [ ] **(preset, ripples sim) Bantu numeralPosition should be "post" (authentic).**
      Bantu doesn't set `numeralPosition` → defaults to "pre", so Bantu numerals
      render prenominally. Real Bantu is postnominal ("imbwa zibiri" = dogs two).
      Set `seedGrammar.numeralPosition: "post"` in bantu.ts (+ check germanic/pie/
      romance/tokipona for the right value). Ripples sim (grammar drift/areal) →
      milestone-level, verify with the full suite. (The realiser now respects
      numeralPosition correctly — see Done log — so this is purely the preset value.)
- [ ] **Translator: comparative polish + modals** (standard capture + ordering
      DONE — see Done log). Remaining: (a) render the comparative DEGREE (the
      adjective carries degree="comparative" but no -er/comparative marker surfaces
      — needs a comparative paradigm or particle); (b) per-typology comparative
      STRATEGY (particle / conjoined / exceed / locational axis) + V-final standard
      ordering; (c) modal "can/may/must" auxiliaries are dropped ("the man can see
      X" → "see X") — render per the lang's mood/modal system. All translator-only.
- [ ] Presets "more words": quantify each preset's hand-authored vs filled
      coverage and raise the ~240-concept ceiling (basic240) / add authentic
      forms for new concepts. Scope before doing.

## Done log

- (baseline) Pre-existing engine fixes + test speedups + two-tier CI + arch-doc
  updates were committed as `853b7ec "yay"` and merged to `main` via PR #176.
  The loop branches `auto/realism` from that point.
- **Translator: object relative clauses keep their own subject.** "the dog that
  the king sees runs" rendered "dog that DOG see run" — the relative-clause IR
  (`roleClauseToRelativeClause`) stored only the predicate, so for an OBJECT
  relative (head = gapped object, subjectGap=false) the RC's overt subject "king"
  was dropped and `attachRelativeClause` forced the head as the subject. Fix:
  carry the RC subject in the `RelativeClause` IR (only for non-subject-gap
  relatives) and use it in the realiser → "dog that king see run". Subject
  relatives unchanged. + typological_routing regression test. tsc + targeted tests
  green (typological_routing, translator_agnosticism, parser_role_ir,
  narrative_snapshot, composer_role_ir — 86). Translator-only, sim-non-rippling.
  Principle: in an object relative the head is the gapped object; the clause has
  its own subject.
- **Translator: comparative standard captured + ordered.** Building on the
  collapse fix: "than NP" is now captured as a standard-of-comparison oblique (a
  "than"-PP) instead of being dropped, AND the copular complement (predicate
  adjective) is now emitted BEFORE predicate obliques in realiseNP so it renders
  "X is big[ger] than Y" not "X is Y big" (which could misread as "X is a big Y").
  "the king is bigger than the dog" → "king is big dog" (Romance drops "than" as a
  case lang; prep langs keep it). + strengthened parser_role_ir test. tsc +
  targeted tests green (parser_role_ir, grammar_audit, copula, typological_routing,
  narrative_snapshot — 103). Translator-only. Remaining (logged): comparative
  DEGREE morphology (render -er/comparative marker), per-typology comparative
  STRATEGY, V-final standard ordering, and modal auxiliaries.
- **Translator: comparatives no longer collapse to nonsense.** "the king is
  bigger than the dog" rendered "king is dog" — "than" wasn't a participant
  boundary, so the parser grabbed the standard "dog" as a patient object, which
  suppressed the copular complement sweep (`be && !object`) and DROPPED the
  comparative adjective. Fix: collectParticipant now breaks at "than" (it only
  occurs in comparatives), so the standard isn't a spurious object → the
  comparative adjective is captured as the complement with degree="comparative"
  → renders "king is big[comparative]". + parser_role_ir regression test. tsc +
  targeted tests green (parser_role_ir, typological_routing, narrative_snapshot,
  grammar_audit — 91). Translator-only. Follow-up logged: the "than NP" standard
  is still dropped (full comparative-construction support is a feature).
  Principle: "than" marks a standard of comparison, not a verbal argument.
- **Translator: the intonation-question "?" marker is now PUNCT, not a DET word.**
  Intonation-strategy yes/no questions append a "?" (realise.ts) as a textual
  question cue; it was tagged role DET, so it surfaced as a determiner word
  ("?(?/DET)") with glossNote "art/det". translateViaTree now classifies the "?"
  marker as englishTag PUNCT with empty glossNote. The marker still appears
  (grammar_audit "?" test passes); it's just correctly punctuation. Surgical,
  translator-only. tsc + targeted tests green (grammar_audit, typological_routing,
  translator_reverse — 34). Principle: "?" is sentence punctuation, not a lexeme.
- **Translator realiser: prenominal numeral/possessor now placed BEFORE the head
  in post-adjective languages.** In the `adjectivePosition === "post"` branch of
  realiseNP, `numPos === "pre"` (and `possPos === "pre"`) tokens were pushed AFTER
  the head+adjectives, so a num=pre language rendered "dog big three" instead of
  "three dog big" — numeralPosition was effectively conflated with
  adjectivePosition. Fixed to mirror the pre-adjective branch (pre→before head,
  post→after). + rewrote the numeral-placement agnosticism test to verify it
  follows `numeralPosition` (toggled pre/post), NOT adjectivePosition — they're
  independent axes (the old test asserted the conflation). tsc + targeted tests
  green (translator_agnosticism, typological_routing, narrative_snapshot,
  grammar_audit — 65). Translator-only, sim-non-rippling. Principle: numeral &
  genitive order are typological axes independent of adjective order.
- **Translator: do-support negation "do not VERB" no longer drops the verb.**
  "the dogs do not see the birds" rendered "dog not do" — bare "do" (unlike
  "does"/"did", already AUX) is also a bare verb, so the tokenizer tagged it a
  main verb; the parser then picked "do" as the predicate and dropped the real
  verb "see" + object "birds". Fix: in tokeniseEnglish, when "do" is followed by
  "not" (do-support), skip the bare-verb branch so it falls through to AUX (which
  carries negation). "I do my work" still treats "do" as a main verb. + 2
  parser_role_ir regression tests. tsc + targeted tests green (parser_role_ir,
  narrative_snapshot, typological_routing, grammar_audit — 91). Translator-only,
  sim-non-rippling. Principle: do-support "do" is an auxiliary, not the predicate.
- **Translator: synonym adjectives now POS-tag correctly (object-head-drop fix).**
  "the large dog sees the tiny bird" rendered "dog see tiny" — large/tiny aren't
  in the adjective lexicon so the tokenizer tagged them N; the second N became the
  NP head and the real head ("bird") was dropped. Fix: apply the synonym map
  (large→big, tiny→small, …) in `tokeniseEnglish` BEFORE POS-tagging (only when the
  word isn't already a recognised noun/adj/verb), so they tag as ADJ via their
  canonical. Now parses identically to "the big dog sees the small bird". + a
  parser_role_ir regression test. tsc + targeted tests green (parser_role_ir,
  narrative_snapshot, typological_routing, translator_agnosticism, composer_role_ir
  — 83). Translator-only, sim-non-rippling. Principle: unknown adjectives must not
  default to N and scramble NP structure.
- **Translator: English-synonym normalization map** (sentence.ts resolveLemma).
  Common English synonyms now resolve to their canonical REGISTERED concept
  before the cascade — quick/swift/rapid/speedy→fast, large/huge/enormous/giant→
  big, tiny/little→small, kid→child — so user-typed variants render the real form
  ("the dog runs quickly" → fast's form) instead of a «marker» (or being dropped).
  Sim-non-rippling: only normalises translator INPUT lemmas; cascade/genesis/
  lexicon key off concept ids. Applied only when the language doesn't lexicalise
  the variant itself. tsc + targeted tests green (narrative_snapshot, typological_
  routing, abstract_pivot, graceful_fallback — 48). Principle: synonyms map to one
  concept; the user shouldn't hit a marker for a word the language CAN express.
- **Translator: drop unresolvable manner adverbs instead of marking.** A manner
  adverb is an optional adjunct; when the target can't resolve its lemma (empty
  baseForm) the realiser was surfacing an ugly `«quick»` marker. Now it omits the
  adverb — the clause stays grammatical ("the small dog runs quickly" → "small dog
  run" in langs lacking quick). Core args are never dropped (they coin). Surgical,
  translator-only (no sim ripple); targeted translator/narrative tests green (65).
  Principle: optional modifiers may be omitted when untranslatable; markers are bad UX.
- **Translator: ditransitive double-object now keeps both args.** "give you the
  big stone" was parsed as one object (recipient "you", mislabelled theme) and
  the real theme silently dropped. Fix (parse.ts): skip already-consumed heads in
  collectParticipant's scan (no-op for single-object calls), and for
  recipient-frame verbs (`give/send/tell/...`) collect a 2nd post-verbal NP —
  first = recipient (surfaced as a dative `to`-PP adjunct, placed per the target's
  adposition typology), second = theme. The PREP-break keeps the prepositional
  dative ("give X to Y") mono-transitive. Verified end-to-end (Romance "I give
  bread you", tokipona "give bread to you" — both args present, no «marker») + 2
  parser_role_ir regression tests. Precise tests green (parser_role_ir,
  narrative_snapshot [the earlier blocker now passes — bread coins], typological_
  routing, translator_agnosticism, composer_role_ir, lexical_frames; 90 tests).
  Principle: ditransitive predicates have 3 core args; recipient realised as a
  dative adposition per typology.
- **Content/translator: Toki Pona now has man/woman** (mije/meli). The
  translator emitted a `«man»`/`«woman»` marker for Toki Pona because it lacked
  those words AND they aren't registered concepts (so the cascade couldn't coin
  them either). Added `man: mije`, `woman: meli` to the preset lexicon — the
  authentic Toki Pona forms (homophonous with husband/wife, the real colexification,
  cf. water/blood/sea = telo). Direct rung-1 hits now; no marker. Principle:
  presets should lexicalise basic human concepts with authentic vocabulary. tsc +
  full fast suite (211 files / 1675) green — tokipona trajectory change broke
  nothing. (The GENERAL fix — registering man/woman so ANY minimal language coins
  them — still open but ripples genesis; see backlog.)
- **Realism: added the OV ⟹ GenN soft universal** (grammar/universals.ts).
  `enforceTypologicalUniversals` already nudged SOV languages toward
  postpositions + pre-noun adjective/numeral; it was missing the possessor
  correlate. Greenberg's Universal 2/4: OV/postpositional languages
  overwhelmingly place the genitive BEFORE the noun (GenN) — one of the
  strongest word-order correlations. Added an SOV + possessor-"post" → "pre"
  soft repair (same 1.5%/gen rate, so real exceptions persist), appended AFTER
  the adjective/numeral rng draws so their outcomes stay byte-identical. Fires
  during sims when a language drifts to SOV while areal spread/drift left
  possessor-post (incoherent OV+NounGen). + 2 tests (positive repair + fully-
  consistent-SOV no-op now incl. possessor). tsc + determinism (simulation.test)
  + full fast suite (211 files / 1675) green — no trajectory regressions.
- **Fixed a RED fast tier** (regression from `82a94a6`): the RC-ordering fix made
  the relativizer strategy postnominal, but a pre-existing test
  (`typological_routing.test.ts` "relativizer strategy: rel clause precedes
  head") asserted the OLD prenominal order on an SVO language and was never
  updated (I'd only added a new test elsewhere + run targeted tests, not this
  file). A full `npx vitest run` caught it (1 failed / 1673 passed). Corrected the
  stale test to assert POSTnominal (VO ⟹ NRel, Greenberg U24 / Dryer), matching
  the realiser. Test-only; tsc + RC/agnosticism tests green. LESSON: after an
  engine-behaviour change, grep the WHOLE test suite for assertions of the old
  behaviour, not just the area's obvious tests.
- **Perf: trigger pre-filter (factory subset).** Profiling (PROFILE_STEP via
  vitest) showed phonology is 64-67% of step time, dominated by the per-word×rule
  `probabilityFor` (countSites word-scan + Math.pow). The factory rules
  (simpleSub/contextSub/mappingSub) have a provable necessary trigger (their
  `from`/mapping phoneme — absent ⇒ probability 0), so added an optional
  `triggers` field (types.ts) set by the 3 factories (catalog.ts) and an O(1)
  allocation-free `includes` pre-check in the hot loop (apply.ts) that skips a
  rule before paying for `probabilityFor` when no trigger is present. Byte-
  identical (perfcheck hashes unchanged); skips 26-30% of probabilityFor calls →
  0.8-1.7% faster phonology pass (interleaved drift-cancelled A/B). + invariant
  test (apply.test) locking that any declared `triggers` truly forces 0. Principle:
  inventory-based pre-filtering of inapplicable rules + O(1) phoneme-presence.
  Earlier same-session NEGATIVE result: word-invariant scalar hoist showed no win
  (allocation offset) → reverted (see below).
- Perf-feasibility investigation: confirmed sound-change rules are opaque
  `probabilityFor(w)` closures (catalog.ts, via countSites) with no declarative
  phoneme targets — so the safe inventory-based rule pre-filter needs
  catalog-wide target metadata first (a real refactor). Logged under NEEDS
  DECISION; not guessed. (PARTIALLY SUPERSEDED: factory rules now expose
  `triggers`; only the ~43 inline rules still lack declarative targets.)
- De-anglicization COMPLETE across presets: added PIE (tree=wood, eye=face,
  flesh=meat), Germanic (flesh=meat), Romance (flesh=meat, child=baby) — all
  registry-attested COLEX_PAIRS, duplicate forms removed, no new stale-freq. + a
  general all-presets colexification test. tsc + 84 preset/concepts/determinism
  tests green.
- Perf investigation (apply.ts hot path): the per-form rule loop already
  early-continues on zero weight/probability and uses a cached priority sort;
  the remaining win is inventory-based rule pre-filtering (skip rules whose
  target phonemes can't occur in the language), which needs rules to expose
  declarative targets + rigorous byte-identical verification — logged as a
  careful dedicated effort rather than guessed.
- Translator ordering audit (cont.): numeral placement verified language-driven
  (Bantu postnominal "dog two", English prenominal "two dog"); locked with a
  regression test. Found a latent anglocentrism — demonstratives are hardcoded
  prenominal (no demonstrativePosition axis); logged as a feature/NEEDS DECISION
  (postnominal-demonstrative langs like Bantu would render "king this").
- Fixed translator relative-clause ordering (realise.ts `attachRelativeClause`):
  the "relativizer" strategy emitted the clause prenominally (before the head),
  scrambling VO languages — "the king who sees the dog" came out "see dog who
  king". Relativizer ⇒ VO ⇒ postnominal RC (head + relativizer + clause).
  Surgical one-branch reorder, no realiser rewrite. + RC regression test
  (translator_agnosticism). Translator-only (no determinism impact); 159 tests
  green. Principle: relativizer strategy implies postnominal RC (VO typology).
- Completed Bantu de-anglicization: added child=son (mwana) and lie=sleep (lala)
  to its seedColexification (now 5 attested pairs) and removed the duplicates.
  tsc + preset/Bantu/concepts/determinism green (109).
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

- 2026-05-29 (programmatic play session via a throwaway inspector — drove real
  narrative + translateSentence output for romance/bantu/pie after 40 gens, read
  it for quality). Narrative + most translations read plausibly and respect
  per-language typology (SVO/SOV order, adj/poss/num placement, adposition
  pre/post). TWO concrete issues found → backlog items: (a) `«lemma»` fallback
  markers for words a language lacks (shallow sentence-path resolution); (b)
  ditransitive theme silently dropped. Also confirmed (not a bug): case languages
  (Romance) drop oblique adpositions ("over"/"with") while preposition/postposition
  langs keep+place them per typology — the deliberate case-strategy behaviour. The
  inspector approach works well as a GUI substitute; recreate it when driving output.
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

- **Perf experiment — apply.ts scalar hoist (NEGATIVE result, 2026-05-29).**
  Hypothesis: the per-word×rule hot loop recomputes 4 word-INVARIANT scalars
  (stressBias [P67], naturalBias [P28c/39g], freqTier, catMomentum [P38e]) that
  depend only on (rule, language); precomputing them once per lexicon pass
  (indexed parallel to `_orderedChanges`, length-guarded fallback) should save
  work. Implemented byte-identically (perfcheck hashes UNCHANGED: romance
  c2e431df / pie 524c8f2c / bantu e7b438a3). Measured min-of-5 back-to-back vs a
  stashed baseline: romance 6485→6582, pie 4328→4339, bantu 8167→8287 minMs —
  i.e. WITHIN NOISE / marginally slower. Conclusion: the saving is below the
  end-to-end noise floor (phonology is a fraction of sim.step; the dominant
  apply.ts cost is the `probabilityFor` closures + the candidate inner loop), and
  the per-pass `new Array(R)` allocation likely offsets it. REVERTED. Lesson for
  future iterations: micro-scalar hoists in apply.ts aren't worth it — a real
  perf win must target a MACRO hot spot identified by substep profiling.
  HARNESS RECIPE (throwaway — recreate as a repo-root `*.test.ts`, then DELETE
  it: the default `npx vitest` collects repo-root test files and these are heavy):
  (1) byte-identical — step romance/pie/bantu 80 gens (seeds perf-r/perf-p/perf-b),
  concat each live leaf's sorted lexicon, `fnv1a`; baseline hashes romance
  c2e431df / pie 524c8f2c / bantu e7b438a3. (2) substep profile — set
  `process.env.PROFILE_STEP="1"`, step 100 gens, read `sim.getCumulativeTimings()`
  (phonology 64-67%, inventoryMgmt ~18%, genesis ~15%). (3) interleaved A/B —
  `changesForLang` (steps/helpers) + `applyChangesToLexicon` (apply), one process,
  to cancel the ~±10% run-to-run machine drift.

## NEEDS DECISION

- **Engine realism — runaway word length (degenerate 20+ syllable words).**
  HIGH PRIORITY, found via narrative play session (Bantu, 60 gens, seed
  narr-bantu). The LEXICON itself accumulates absurdly long base forms — e.g.
  `arm` = 19 phonemes, `coconut-kin` = 23, `ship`/`coconut` = 21, `kettle`/
  `mortar-bowl`/`narrow` = 20 — shaped as a long RUN of identical `aː˧` syllables
  with an ILLEGAL final coda (k/t) despite Bantu's strict CV (maxCoda 0). No
  language has 20-syllable basic nouns; this is a major realism hole (garbage
  output) and likely a phonotactics/repair non-convergence: medial/paragogic
  vowel epenthesis (catalog.ts insertion.* + phonotactics.ts medial repair)
  inserts vowels that consonant-erosion then strips back to bare vowels, with NO
  upper length ceiling, so the form grows unboundedly over generations.
  Root not pinned (multi-process: epenthesis × lenition/deletion × repair).
  Options: (a) add a GROWTH guard — reject a sound-change/repair that lengthens a
  word already past a sane ceiling (~16 phonemes / ~8 syllables), symmetric to the
  existing length FLOOR in isFormLegal/applyChangesToWord; (b) make the
  phonotactic repair converge + actually fix final codas (it's leaving them);
  (c) cap epenthesis when the word is already long. ALL ripple sim (change
  lexicons) → milestone-level, verify with the FULL suite + expect to update
  hash/snapshot tests for affected languages. Diagnose the dominant growth source
  first (instrument which rule/repair adds the `aː` runs). Want me to take it on?

- **Engine performance — extend the trigger pre-filter to inline rules.**
  The factory subset is DONE (see Done log): factory rules expose `triggers`,
  the hot loop skips them via O(1) presence check, skipping 26-30% of
  probabilityFor calls / 0.8-1.7% faster phonology pass, byte-identical. The
  REMAINING win: the ~43 inline catalog.ts rules (deletion/insertion/stress/
  tone/harmony/metathesis + many substitutions) still lack `triggers`, so they're
  always evaluated. Many of them DO have a provable necessary phoneme (a single
  `from`), and adding `triggers` to those would multiply the skip rate — but each
  needs individual auditing to confirm absence-⇒-probability-0 (rules like
  deletion/insertion/stress have NO single trigger and must stay unfiltered).
  This is the "sizeable careful refactor" from before, now with data showing the
  per-rule payoff. Want me to take on the inline-rule audit (one careful pass,
  byte-identical verified via a recreated perfcheck harness — see recipe above)?
  The invariant test (apply.test) is committed and already guards every declared
  `triggers`. NOTE: phonology is 64-67% of step time, so this is the highest-
  leverage perf area; inventoryMgmt (~18%) + genesis (~15%) are the next macro
  targets.

- **Translator realiser refactor.** `realise.ts` is a ~766-line monolith
  hardcoding word-order/alignment/NP-VP realisation; the Phase 41c stage-hook +
  role-IR migration is incomplete (it still consumes the legacy English-shaped
  `Sentence/NP/VP/PP` IR). Finishing it would make sentence STRUCTURE fully
  typology-driven, but it's a large, behaviour-changing refactor. Options:
  (a) leave as-is — output is already reordered per target word-order/case/
  article via `astToTokens`, so it's not pure relexified English;
  (b) incrementally move one realise-stage at a time behind the existing hooks;
  (c) full role-IR rewrite. Needs your call on appetite/scope before I touch it.
  UPDATE (2026-05-29): the concrete RC-ordering symptom this would have fixed is
  now resolved surgically (relativizer RC made postnominal in realise.ts); the
  open question is only the broader legacy-IR cleanup — lower urgency now.

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
