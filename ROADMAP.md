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
| **Narrative generation** | partial | Phase-53 grammar-driven: words sampled from the lang's own lexicon (freq-weighted, not English pools); order via `grammar.wordOrder`; morphology stacked by `synthesisIndex` (gated on paradigms existing); copular predication now emits an overt copula (or zero-copula juxtaposition); complex typology routed through the translator. Discourse narrative interlinear gloss now uses **Leipzig abbreviations** (walk-PST.IPFV.DIR, friend-ACC, speak-3SG) instead of verbose lowercase category paths. Residual: deep-routing round-trips through an English string (inherits translator-realiser limits); some derivation concept-ids leak malformed lemmas into glosses (e.g. `take--tér.agt`, `coffee-prae-.tbef` — see backlog). |
| **Presets — coverage** | partial | 7 (default Swadesh + pie/germanic/romance/bantu/tokipona/english); families typologically authentic. |
| **Presets — word count** | partial | ~240-concept ceiling (basic240 fillMissing); Bantu ~220 hand-authored, default 44 core + filled. Expanding the concept registry is the lever for "more words". |
| **Presets — de-anglicization** | partial | Forms are NOT relexified English (Bantu = real proto-Bantu w/ tone+noun-classes; default CORE = PIE reconstructions: water/pur/mater/pater/nokt/pod/kerd/kaput). REAL issue: the shared English concept inventory carves semantic space identically (arm≠hand; Bantu duplicates the form `mukono` instead of declaring colexification). → `seedColexification` hook lets presets declare colexifications; all presets de-anglicized — Bantu (arm=hand, mouth=lip, flesh=meat, child=son, lie=sleep), Toki Pona (sun=day, sky=god, eat=drink, fight=war, word=name), PIE (tree=wood, eye=face, flesh=meat), Germanic (flesh=meat), Romance (flesh=meat, child=baby); default/English have no attested duplicate pairs. |
| **Language-agnosticism** (cross-cutting) | partial | Translator adj/possessor/numeral/relative-clause ordering verified language-driven (regression tests; RC fixed). Narrative negation now language-agnostic: English-style do-support ("did not see") gated on the new `grammar.doSupport` flag (default off) — other languages negate inline at their `negationPosition` (WALS ch.112). GAP: demonstratives hardcoded prenominal (no demonstrativePosition axis — logged, needs decision). Narrative grammar-driven; presets de-anglicized (Bantu + Toki Pona). |
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
      DONE — see Done log). Remaining: (a) DONE — the predicate adjective now
      receives the comparative/superlative DEGREE paradigm (adj.degree.cmp/.sup),
      matching the attributive path; surfaces wherever the language has the
      paradigm (see Done log). NOTE: like all morphology, a language WITHOUT a
      degree paradigm shows bare "big" (zero-marked comparative — attested, but if
      we want a default particle strategy that's item (b)); (b) per-typology
      comparative STRATEGY (particle / conjoined / exceed / locational axis) +
      V-final standard ordering. (Standard-marker "than" RETENTION in case langs: DONE — see Done
      log; the richer per-typology strategy below remains, e.g. ablative-of-
      comparison for case langs instead of a particle.) (Modals (c): DONE — see Done log. CORRECTED DIAGNOSIS: only "can"
      was dropped; may/might/could/must/should/would already mapped to subjunctive
      via SUBJUNCTIVE_AUX. Future refinement: the mood enum lacks distinct
      potential/necessitative moods, so ability (can) and obligation (must) both
      collapse to subjunctive — a milestone if separate modal moods are wanted.)
- [ ] Presets "more words": quantify each preset's hand-authored vs filled
      coverage and raise the ~240-concept ceiling (basic240) / add authentic
      forms for new concepts. Scope before doing.
- [x] **Translator: flat/zero-derived manner adverbs ("runs fast") dropped.**
      DONE (see Done log). collectMannerParticipants now also claims a leftover
      unconsumed ADJ as a flat manner adverb (attributive + predicate adjectives
      are already consumed by the time it runs, so a leftover is adverbial).
- [ ] **Translator: partitive "some of the X" drops the quantifier.** "some of the
      dogs run" → "the dog run" ("some" + "of" lost). Partitive "Q of the N" isn't
      modelled; low priority. Also: correlatives "either…or" drops "either",
      "neither…nor" breaks (drops subject) — correlative coordination unmodelled
      (milestone-ish, like other multi-clause/coordination gaps).
- [ ] **Translator: conditional / adverbial-subordinate clauses drop the main
      verb.** Play session (2026-05-30): "if the dog runs the man walks" → "if dog
      run man" (main-clause verb "walks" lost). "if/when/because/while/though" +
      two clauses isn't split into matrix + subordinate; like sentential complement
      clauses, this needs recursive clause parsing (the `embeddedIn`/two-clause
      path). Milestone-ish — log, don't rush. (S-coordination and relative clauses
      ARE handled; this is the remaining multi-clause gap alongside complements.)
- [x] **Translator: "without" (privative) dropped in case langs, reversing
      meaning.** DONE (see Done log). realisePP now retains a small set of
      meaning-critical adpositions (RETAINED_ADPOSITIONS = than/without/with) in
      case-strategy languages; spatial/role adpositions (in/on/to/from/of) still
      drop. Passive "by"-agent NOT included (separate voice-paradigm milestone).
- [x] **Translator: degree adverb "very" dropped.** DONE (see Done log). "very"
      now raises the following NP-adjective to degree="intensive" (parser walk),
      realised by full reduplication (big→big-big). FOLLOW-UPS (logged, not done):
      (a) "-ly" intensifiers (extremely/really) tokenise to ADV ("extreme"/"real")
      and go through the manner path — DONE (the tokenizer INTENSIFIERS check runs
      BEFORE -ly/conjunction tagging, so extremely/really/truly are caught too —
      see Done log); (b) "too"/"so"/"quite" — DONE (added; look-ahead guard keeps
      "so the dog ran" a conjunction); "rather" still excluded (downtoner-ambiguous);
      (c) PREDICATE intensification ("the dog is very big") — DONE (tokenizer
      handles both attributive + predicate now; see Done log);
      (d) intensive degree morphology (an `adj.degree.intens` paradigm) isn't
      generated by the engine, so reduplication is the only realisation — fine as
      the universal default, but a paradigm path could be added later.
- [ ] **Translator: passive "by"-agent dropped in case languages, reversing
      meaning.** "the dog is seen by the man" → Romance "dog see man" (reads as
      "dog sees man" — agent/patient reversed; the passive voice + the "by"-agent
      both vanish). Like the comparative "than" and dative "to", the agentive "by"
      is dropped by the case-strategy oblique-adposition drop, but no passive
      voice marking or agent case replaces it. Retain a passive marker and/or the
      agent's adposition/case so the demotion is recoverable. Ties to passive-voice
      morphology (needs a voice paradigm) — partly milestone-level.
- [x] **Translator: object/oblique pronouns surface in NOMINATIVE form.** DONE
      (see Done log). realiseNP now maps a pronoun in O/PP-NP role to its
      suppletive oblique form (he→him, we→us, i→me, they→them, she→her, who→whom)
      via PRONOUN_OBLIQUE, using the language's own oblique form when it has one
      (English suppletion) and otherwise leaving case morphology to mark it. Drives
      both the surface form and the gloss caption. FOLLOW-UP: DONE — plural
      pronouns no longer take the regular noun-plural affix (realiseNP plural
      branch guarded with `!np.head.isPronoun`; "us" → "ʌs", not "ʌss"). See Done
      log.
- [ ] **Derivation: malformed concept-ids leak into narrative glosses.** Discourse
      play session (2026-05-29) surfaced lemmas like `take--tér.agt` (double dash +
      agentive `-tér` + a `.agt` suffix in the ID) and `coffee-prae-.tbef` (a
      `prae-` prefix fragment + `.tbef` in the ID). These are derived/borrowed
      concept ids whose raw morphological scaffolding (agentive nominaliser, the
      `prae-` preverb, a temporal `tbef` tag) is being emitted as part of the
      ENGLISH lemma rather than resolved to a clean gloss. Investigate the
      derivation/grammaticalisation concept-id construction (semantics/
      grammaticalization.ts, derivation) — the id should carry a clean gloss label
      separate from its internal build recipe. Engine-side (derivation data) →
      likely sim-rippling; scope before touching.
- [ ] **Translator: sentential complement clauses are DROPPED** (play session
      2026-05-29). "the man knows that the dog runs" → "man know that" (the whole
      embedded clause "the dog runs" vanishes); "the man wants to run" → "man
      want" (the infinitival complement "to run" vanishes). The parser models a
      single matrix clause; clausal arguments ("that S", control "to VP") aren't
      parsed as arguments, so the embedded material is lost. This is the
      `embeddedIn` placeholder on RoleClause (roleFrame.ts) — a real parser
      FEATURE (recursive clause parsing + IR + realiser support + per-typology
      complementizer/infinitive strategy), milestone-scale, tied to the
      "Translator realiser refactor" NEEDS DECISION. Not a small surgical fix.
- [x] **Translator: English verb-coverage gap — common verbs mis-tagged as
      nouns.** DONE (see Done log). Added jump/climb/sing/dance/read/write/ride/
      draw/wear/cook/drive/kick to BOTH BARE_VERBS sets (tokenizer + dialect).
      (CORRECTED DIAGNOSIS: posOf returns "other" for these, not "noun" — they
      fell to the default-N fallback, not the noun branch; so adding to BARE_VERBS
      directly fixes tagging. The dialect copy is needed so stripVerbSuffix
      restores silent-e: dances→dance.) MORE verbs can be added later if play
      sessions surface them; fish/dream excluded (posOf="noun", noun-dominant).

## Done log

- (baseline) Pre-existing engine fixes + test speedups + two-tier CI + arch-doc
  updates were committed as `853b7ec "yay"` and merged to `main` via PR #176.
  The loop branches `auto/realism` from that point.
- **Translator: flat manner adverbs ("the dog runs fast") no longer dropped.**
  "fast"/"hard"/"well" etc. share an adjective form (in BARE_ADJECTIVES) so they
  tag ADJ; the manner-adverb collector took only ADV tokens, so a post-verbal flat
  adverb was dropped ("the dog runs fast" → "the dog run"). collectMannerParticipants
  now ALSO claims a still-unconsumed ADJ as a manner adjunct — by the time it runs,
  attributive (NP walk) and predicate (copular sweep) adjectives are already
  consumed, so a leftover ADJ is functioning adverbially (zero-derived/flat adverb).
  Now "the dog runs fast" → "the dog run fast", "the man works hard" → "...work
  hard"; attributive "the big dog runs" and predicate "the dog is big" unchanged.
  Parser-only; no engine/rng change. + parser_role_ir regression test ('fast'
  captured as manner; 'big' stays attributive). Verified: tsc + 110 + 37 parser/
  grammar/agnosticism/routing/narrative tests green.
- **Translator: three-way+ NP coordination no longer drops the middle conjunct.**
  Play session: "the man and woman and child run" → "man and child run" (woman
  lost). The parser correctly stored two flat sibling coordination modifiers
  (man[coord(woman), coord(child)]), but the legacy NP has a single `coord` field
  and `participantToNP` (ast.ts) REASSIGNED it per modifier, so only the last
  survived. (Object coordination used a nested structure, so it worked — only the
  subject's flat siblings broke.) Now collect all coordination modifiers and build
  a NESTED coord chain ([woman, child] → woman + {coord: child}); the realiser
  already walks nested coord. "X and Y and Z" / 4-way all keep every conjunct.
  Parser→AST bridge only; no engine/rng change. + translator_agnosticism
  regression test (man/woman/child all surface). Verified: tsc + 96 + 10 parser/
  routing/composer/tree/narrative/agnosticism tests green.
- **Translator: periphrastic comparative/superlative "more/most + adj".** Play
  session: "the man is more big than the dog" → "be more than dog" — the analytic
  "more big" DROPPED the adjective (the N-tagged "more" hit the copular complement
  sweep and broke it, exactly like the old "very big" bug). Generalised the
  tokenizer's pending-intensifier into a pending-DEGREE mechanism: a degree word
  before an adjective ("very"→intensive, "more"→comparative, "most"→superlative)
  is absorbed and sets the adjective's `features.degree`. Now "more big" parses
  identically to synthetic "bigger" (comparative + "than" standard captured), and
  "most big" → superlative; the look-ahead guard keeps "more dogs" a quantifier.
  Reuses the existing degree realiser (cmp/sup paradigm). Tokenizer-data only; no
  engine/rng change. + dialect_english regression test. Verified: tsc + 127 + 26
  parser/degree/agnosticism/dialect/narrative tests green. (Same session: a broad
  sweep of contractions won't/doesn't/hasn't/isn't/shouldn't/mustn't, numerals,
  demonstratives, reflexives, VP-coordination all parse correctly — clean.)
- **Translator: "cannot" splits to "can" + negation (was dropping the subject).**
  Play session: "the man cannot see the dog" → "cannot see dog" — "cannot" (the
  one-word spelling of "can not", no apostrophe so the "X't" contraction path
  missed it) tagged as a NOUN and became the subject, dropping the real subject
  "man". Added a tokenizer pre-split: "cannot" → host "can" (AUX) + a negator,
  exactly mirroring "can't". Now "the man cannot see the dog" → "the man not see
  the dog" (subject kept, negation present), identical to "can not". Tokenizer-
  data only; no engine/rng change. + parser_role_ir regression test (subject
  'king' not 'cannot', negated=true). Verified: tsc + 125 + 36 parser/dialect/
  grammar/tree/narrative tests green.
- **Translator: case-strategy languages keep meaning-critical adpositions
  (without/with), not just "than".** Play session: "the man without the dog runs"
  → "man run dog" (reads as transitive "man runs dog" — the privative "without"
  was dropped by the case-strategy oblique-adposition drop, with no abessive case
  to recover it). Generalised the earlier "than" exemption into a
  RETAINED_ADPOSITIONS set (than/without/with): abessive (without) and comitative
  (with) are rare as morphological cases (WALS) and none is applied to the PP-NP,
  so they're retained as particles; spatial/role adpositions (in/on/to/from/of)
  still drop (role recoverable from case). Now "man run without dog" / "man run
  with dog"; "on the mountain" still drops to "mountain". Realiser-only; no
  engine/rng change. + translator_agnosticism regression test (without/with
  retained, on dropped). Verified: tsc + 83 + 9 agnosticism/parser/routing/
  narrative tests green. (Passive "by"-agent left out — separate voice milestone.)
- **Translator: relative clause + COPULAR matrix no longer collapses.** Play
  session: "the dog that runs is big" → "that run" (subject "dog", copula "is",
  complement "big" ALL dropped; the relativiser "that" became the subject and the
  RC verb "run" the matrix). Cause: `extractRelativeClause` searched for the matrix
  verb by tag==="V" only, but a copular matrix's head is the AUX "is/are/was…"
  (lemma "be"), so no matrix verb was found, extraction bailed, and the sentence
  mis-parsed as one clause. Added an `isPredHead` helper (V OR copular AUX "be")
  used for the RC-verb and both matrix-verb searches → "the dog [that runs] is
  big" splits into matrix "the dog is big" (copula + complement "big") + RC "runs"
  on "dog"; also fixes copular RCs ("the dog that is big runs"). Subject/object
  relatives + verbal matrices unchanged. Parser-only; no engine/rng change. +
  parser_role_ir regression test. Verified: tsc + 86 + 35 parser/routing/RC/
  agnosticism/narrative tests green.
- **Translator: "very" intensifies the adjective (via reduplication) instead of
  being dropped.** Play session: "the very big dog" → "big dog" — "very" mis-tagged
  as a noun and vanished. Added an INTENSIFIERS set; in the NP adjective left-walk
  the parser now absorbs "very" before an adjective and raises that adjective to a
  new degree `"intensive"` (Degree type extended). The realiser renders intensive
  degree as FULL reduplication of the adjective (big→big-big) — the iconic,
  cross-linguistically dominant intensifier (more form = more degree; Indonesian
  "besar-besar"), which is emergent and needs no "very" lexeme in the target.
  Now "very big" → "gɾandegɾande", "very small" → "pikkulupikkulu". Translator
  (parse + syntax + realise); no engine/rng change. + parser_role_ir (degree=
  intensive) and translator_agnosticism (reduplication) regression tests. Verified:
  tsc + 104 + 42 parser/agnosticism/degree/routing/narrative tests green. Scope
  limited to NP-internal "very"; -ly/predicate intensifiers logged as follow-ups.
- **Translator: "very" intensifier moved to the tokenizer — now covers predicate
  position.** Follow-up to the above: "the dog is very big" still broke (the
  copular complement sweep hit the stray "very" token and dropped the adjective →
  "dog be very"). Moved intensifier handling from the parser NP walk to the
  tokenizer: when "very" precedes an adjective (incl. synonyms like "large") it's
  absorbed and the adjective's `features.degree` is set to "intensive", so BOTH the
  attributive NP walk and the copular complement sweep pick it up through their
  existing degree-reading code. Added intensive→full-reduplication to the complement
  realiser; extended EnglishToken.features.degree with "intensive"; removed the now
  redundant parser walk. Now "the dog is very big" → "...gɾandegɾande"; attributive/
  object/synonym cases unchanged. Translator only; no engine/rng change. +
  translator_agnosticism predicate assertion. Verified: tsc + 110 + 8 parser/
  agnosticism/degree/narrative/copula tests green.
- **Translator: more intensifiers — extremely/really/truly/so/too/quite.** The
  tokenizer INTENSIFIERS check runs before POS-tagging, so adding these to the set
  catches the "-ly" forms (which otherwise tag ADV) AND the conjunction-/noun-
  ambiguous ones (so/too/quite) — but only when the next token is an adjective
  (look-ahead guard), so "so the dog ran" / "me too" still parse normally. Fixes
  cases that were not just dropping the intensifier but BREAKING the parse in
  predicate position ("the dog is so big" → adj was dropped entirely). Now all
  → full reduplication (gɾandegɾande). (too=excessive, quite=downtoner-in-some-
  dialects are simplified to intensification — better than dropping; "rather"
  excluded as more clearly a downtoner.) Tokenizer-data only; no engine/rng change.
  + dialect_english regression test (7 intensifiers absorbed→intensive; "so"+non-
  adjective stays CONJ). Verified: tsc + 106 + 25 parser/agnosticism/dialect/
  routing/narrative tests green.
- **Translator: quantificational determiners (many/few/much/several/both) now
  recognised.** Play session: "many men see the dog" → "man see dog" — the
  quantifier was DROPPED while "all"/"some" surfaced. Cause: the tokenizer's
  DETERMINERS set had all/some/every/each but not many/few/much/several/both, so
  those mis-tagged as nouns and were dropped. Added them (they pattern prenominally
  like the others). Now "many men…" → "many man…", "few dog", "both king", "much
  water". Tokenizer-data only; no engine/rng change. + dialect_english regression
  test (5 quantifiers tag DET). Verified: tsc + 117 parser/routing/agnosticism/
  typology/dialect/narrative tests green. (Same session noted: "very" degree adverb
  is dropped — see backlog; and passive "by"-agent drops in case langs reversing
  "dog is seen by man" → "dog see man".)
- **Narrative: object pronouns get their oblique caption in the discourse gloss.**
  Follow-up to the translator's realiseNP oblique-pronoun fix (bafd0c4): when a
  pronoun filled an object slot the discourse English caption showed the
  nominative form ("king speaks he", "daughter speaks she") even though the
  morphological gloss already marked "-ACC". nounRoleToken now maps an object-role
  pronoun caption via PRONOUN_OBLIQUE (he→him, she→her, i→me, we→us, they→them,
  who→whom). Caption-only — the target form is case-marked by the existing
  objectCase inflection, so determinism is unaffected. Now "king speaks him".
  + narrative_composer regression test. Verified: tsc + 58 composer/discourse/
  snapshot/logophoric tests green.
- **Narrative: deictic time adverbs surface bare (no spurious "in").** Discourse
  play session: "in yesterday she goes", "in today it came" — the time-adjunct
  builder (`timePrefixRoleTokens`) prepended "in"/"at" + article to EVERY temporal
  word, but deictic adverbs (today/yesterday/tomorrow/now) are inherently
  adverbial and take no adposition or article ("yesterday she went"), unlike
  temporal nouns ("in summer", "in the morning"). Added a DEICTIC_TIME set and
  skip the prep+article for those. Now "yesterday she goes"; temporal nouns
  (summer/night/day) still take "in". Narrative-composer display only; no
  engine/rng change. + narrative_composer regression test. Verified: tsc + 63
  composer/discourse/snapshot/genre/negation tests green. (Same session noted: the
  discourse English CAPTION still shows nominative object pronouns "he" where the
  morphological gloss already marks "-ACC" — the composer pronoun caption needs
  the same oblique mapping the translator's realiseNP got in bafd0c4; minor since
  the interlinear gloss carries the case. Also "in day" lacks an article — temporal
  nouns outside TIME_LEMMAS render article-less; low priority.)
- **Translator: plural pronouns no longer re-pluralised by the noun-plural
  affix.** Follow-up to the oblique-pronoun fix: "the man sees us" surfaced
  "ʌss" — realiseNP applied the regular `noun.num.pl` affix to the plural-number
  pronoun head. Personal pronouns are suppletive (we/us/they lexically encode
  plural; no language re-pluralises an inherently-plural pronoun stem), so guarded
  the plural branch with `!np.head.isPronoun`. Now "us"→"ʌs", "we"→"wiː",
  "they"→"ðej"; regular nouns still pluralise (man→men). One-line realiser guard;
  no engine/rng change. + translator_agnosticism regression test (plural pronoun
  surface == bare lexical form). Verified: tsc + 64 agnosticism/grammar_audit/
  narrative tests green.
- **Translator: object/oblique pronouns take their suppletive case form.** Play
  session: "the man sees him" → "...see he" (hiː); "give me the stone" → "...to i"
  (aj); "the man sees us" → "...see we". The parser canonicalises an object
  pronoun to its citation/nominative lemma for concept lookup (him→he, us→we,
  me→i), so for languages with suppletive pronoun case (English: he/him, we/us,
  i/me) the wrong nominative form surfaced. realiseNP now recovers the case form
  from the role: a pronoun in O or PP-NP role maps via PRONOUN_OBLIQUE → him/me/
  us/them/her/whom, using the language's own oblique lexeme when present
  (else case morphology marks it), driving both the surface form and the gloss
  caption. Now "...sees him" (hɪm), "...to me" (miː). Translator/realiser-only;
  no engine/rng change. + translator_agnosticism regression test (object 'him'/
  'me' surface, not 'he'/'i'). Verified: tsc + 93 parser/routing/agnosticism/
  realise/narrative/tree tests green. (Logged a minor follow-up: plural pronouns
  still pick up the regular noun-plural suffix.)
- **Translator: "do not VERB" negative imperative no longer mis-parsed as a
  question.** Play session: Bantu "do not see the dog" rendered "you not see dog
  ?" — a spurious intonation "?". The parser flagged interrogative whenever a
  sentence started with an AUX (polar-question subject-aux inversion), but
  "do/does/did + not" is do-support NEGATION ("do not see…" = a negative
  imperative), not inversion. Excluded that pattern from the initial-AUX
  interrogative heuristic. Now the negative imperative is non-interrogative (no
  "?"), while genuine yes-no questions ("does the man see…?") and wh-questions are
  unaffected. Parser-only; no engine/rng change. + parser_role_ir regression test.
  Verified: tsc + 95 parser/routing/tree/typology/narrative tests green. (Same
  session logged a backlog item: object/oblique pronouns surface in nominative
  form — him→he, us→we, me→i.)
- **Narrative: English do-support negation gated behind a typology flag
  (language-agnosticism fix).** A discourse play session showed Bantu/PIE/Romance
  generating "did/does not VERB" — the composer applied English-style do-support
  to ANY language that happened to have "do" + "not" in its lexicon (no
  typological gate), emitting a spurious English auxiliary. Do-support negation
  is cross-linguistically rare, essentially English-specific (WALS ch.112-113;
  most languages use a negative particle/affix). Added an optional
  `grammar.doSupport` flag (types.ts; default off), gated the composer's
  do-support on it, and set it true only in the English preset. Non-English
  languages now negate INLINE at their own `negationPosition` ("dog not see" /
  SOV "dog bread not see") with no spurious "did". Verified sim-non-rippling:
  the field is read only by the narrative composer (not sim code), determinism is
  run-to-run (simulation.test green), and serializeLeafLexicons/RuleState exclude
  grammar. + narrative_negation_coord regression test (non-do-support lang has no
  did/does/do). Verified: tsc + 69 negation/snapshot/discourse/simulation/
  typology tests green. Principle: negation strategy is typologically determined
  (Dryer/WALS) — the simulator must not default to the English strategy.
- **Narrative: interlinear gloss now uses Leipzig Glossing Rules abbreviations.**
  Discourse play session showed the morphological gloss as verbose lowercase
  category paths — "walk.tense.past.aspect.ipfv.evid.dir", "friend.case.acc",
  "speak.person.3sg". Rewrote `morphologicalGloss` (discourse_generate.ts) with a
  Leipzig abbreviation map → "walk-PST.IPFV.DIR", "friend-ACC", "speak-3SG",
  "snow-ACC", "make-PFV", "fish-GEN", "not-NEG". Stem and feature-block joined
  with "-", stacked features with "."; free-form notes (compound:/compose:/colex
  ↔) pass through untouched; unknown categories uppercase as a safe fallback.
  Serves the immersive goal (a user can actually READ the morphology the engine
  grew). Display-only — no engine/sim/rng change; the simple-narrative path and
  per-token glossNotes are untouched. + narrative_discourse regression test
  (Leipzig tags present, no verbose category path leaks). Verified: tsc + 50
  discourse/composer/copula/poetry/logophoric/negation + 13 discourse tests
  green. (Logged a derivation backlog: malformed concept-ids like `take--tér.agt`
  leaking into glosses.)
- **Translator: predicate adjectives now get the comparative/superlative degree
  marker.** "the king is bigger than the dog" surfaced bare "big" even when the
  language had an `adj.degree.cmp` paradigm — the realiser applied degree
  morphology to ATTRIBUTIVE adjectives (in the NP) but the copular-complement
  (predicate) adjective path only did plural agreement, never degree. Mirrored
  the degree-paradigm logic onto complementTokens (adj.degree.cmp/.sup), guarded
  on a non-empty form. Now "...is bigger than..." → "big"+cmp affix where the
  language has the paradigm (bare otherwise). Principle: degree morphology
  attaches to the adjective independent of attributive-vs-predicative position.
  Realiser-only; no engine/rng change. + grammar_audit predicate-comparative
  regression test. Verified: tsc + 94 grammar_audit/parser/agnosticism/narrative
  tests green.
- **Translator: added 12 high-frequency action verbs the tokenizer didn't know.**
  jump/climb/sing/dance/read/write/ride/draw/wear/cook/drive/kick were unknown to
  the wordlist (`posOf`="other"), so they fell through every bare check to the
  default-N fallback and mis-tagged as nouns — e.g. "the man runs and jumps"
  tagged "jump" N → verbCount=1 → S-coordination never fired → "and" dropped
  ("man run jump"). Added them to the tokenizer BARE_VERBS (sentence.ts) AND the
  dialect BARE_VERBS (english.ts, so stripVerbSuffix restores silent-e:
  dances→dance, rides→ride, drives→drive). Now "the man runs and jumps" →
  "the man run and the man jump". Translator dialect-data only; no engine/rng
  change. + dialect_english regression test (tag=V + correct lemma for 8 forms).
  Verified: tsc + 106 parser/dialect/routing/narrative/agnosticism/realise tests
  green. (fish/dream excluded — posOf="noun", noun-dominant.)
- **Translator: S-coordination subject inheritance no longer blocked by an
  object.** Play session: "the man walks and sees the dog" → "the man walk and
  YOU see the dog" — the 2nd coordinated clause's gapped subject defaulted to a
  synthesised imperative "you" instead of inheriting "man". Root cause
  (parse.ts parseSyntaxAllAsClauses): the inheritance guard skipped whenever the
  follow-up segment held ANY nominal, but that nominal was the OBJECT ('dog'),
  not a subject. Narrowed the guard to count only a nominal in SUBJECT position
  (before the segment's verb) → gapped subject correctly inherits "king"/"man".
  Parser-only; no engine/rng change. + parser_role_ir regression test (gapped
  2nd-clause subject inherits the 1st even with an object). Verified: tsc + 77
  parser/routing/agnosticism/narrative tests green. (Same session logged two
  backlog items: sentential complement clauses dropped, and a verb-coverage gap
  mis-tagging "jump" as a noun.)
- **Translator: case-strategy languages keep the comparative "than" particle.**
  Play session (Romance leaf): "the king is bigger than the dog" → "king big dog"
  — the comparison was unmarked. `realisePP` dropped EVERY adposition for
  case-strategy languages (the case affix recovers the role), but the comparative
  "than" has no comparative case marking the standard, so dropping it erased the
  comparison. Exempted "than" from the case-strategy drop (one guard in
  realise.ts realisePP) → "king big than dog", matching what non-case langs (Bantu
  "boːv") already produce. Principle: particle comparative (Stassen's comparative
  typology). Scoped to the comparative marker only — plain obliques ("in", dative
  "to") STILL drop in case langs (verified). Realiser-only; no engine/rng change.
  + translator_agnosticism regression test (than retained, "in" still dropped).
  Verified: tsc + 76 translator/parser/routing/narrative tests green. (Engine-side
  finding from the same session — affixal plural paradigm lost during evolution
  while the grammar flag persists — logged under NEEDS DECISION.)
- **Translator: the modal "can" now carries irrealis (subjunctive) mood.** A play
  session showed "the man can see the dog" dropping the modal entirely. Diagnosed
  (throwaway probe): the ROADMAP's "can/may/must dropped" was stale — may/might/
  could/must/should/would already map to subjunctive via `SUBJUNCTIVE_AUX`
  (applyAuxiliaryCues, sentence.ts); "can" was the LONE modal omitted from that
  set. Added it. Now "can VERB" surfaces the verb.mood.subj affix wherever the
  target grammar expresses mood (and stays bare where it doesn't), matching the
  other modals. Principle: realis/irrealis modality (Palmer) — English modal
  auxiliaries are all irrealis markers, collapsed to the target's subjunctive.
  Translator-only constant; no engine/rng change. + `grammar_audit` "'can X'
  triggers verb.mood.subj" regression test. Verified: tsc + 93 grammar_audit/
  parser_role_ir/narrative_snapshot/grammatical_modules tests green.
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

- **Engine realism — morphology evolution drops a paradigm without syncing the
  grammar flag that depends on it.** Found via translator play session
  (2026-05-29, Romance leaf, seed play-romance, 20 gens). The evolved language
  declares `grammar.pluralMarking="affix"` + `numberSystem="sg-pl"` (inherited
  from the preset) but its `noun.num.pl` paradigm — which the Romance preset
  DOES seed (affix `["i"]`) — is GONE at the leaf (only `noun.case.*` paradigms
  remain). So the translator correctly tries to mark plural, finds no paradigm,
  and emits unmarked nouns: "the men see the dogs" → nouns identical to singular
  (only the verb shows plural agreement). Bantu (plural via noun-class prefix
  swap) is unaffected — this is specific to AFFIX-strategy plural. The coupling
  bug: `morphology/evolve.ts` (or paradigm renewal) can delete `noun.num.pl`
  while `grammar.pluralMarking`/`numberSystem` keep pointing at it. Options:
  (a) when a paradigm is dropped, downgrade the dependent grammar flag (e.g.
  `pluralMarking → "none"`, or mark number "optional/zero") so the language is
  self-consistent; (b) treat the flag as authoritative and REGENERATE/renew a
  replacement paradigm (paradigm renewal) instead of leaving the category
  stranded; (c) accept zero-marked optional number as realistic (attested) but
  then the flag should still say so. All ripple sim (lexicon/morphology
  trajectories) → milestone-level, full suite + snapshot updates. NB: not clearly
  a bug under (c), so needs a realism call before any fix. Want me to take it on?

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
