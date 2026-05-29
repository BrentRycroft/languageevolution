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
| **Translator** | partial | Feature-rich (aspect/mood/voice/switch-ref/numerals/per-lang case+article/AST word-order path) BUT: word-level `translate()` bypasses the shared 8-rung cascade (gives up early); realiser still on legacy English NP/VP/PP IR (role-IR migration incomplete); graceful fallback compound-only. See backlog + NEEDS DECISION. |
| **Narrative generation** | partial | Extensive code; output quality unverified by play. |
| **Presets — coverage** | partial | 7 (default Swadesh + pie/germanic/romance/bantu/tokipona/english); families typologically authentic. |
| **Presets — word count** | partial | ~240-concept ceiling (basic240 fillMissing); Bantu ~220 hand-authored, default 44 core + filled. Expanding the concept registry is the lever for "more words". |
| **Presets — de-anglicization** | partial | Forms are NOT relexified English (Bantu = real proto-Bantu w/ tone+noun-classes; default CORE = PIE reconstructions: water/pur/mater/pater/nokt/pod/kerd/kaput). REAL issue: the shared English concept inventory carves semantic space identically (arm≠hand; Bantu duplicates the form `mukono` instead of declaring colexification). |
| **Language-agnosticism** (cross-cutting) | needs assessment | Audit for baked-in English structure. |
| **Performance** | partial | apply.ts hot path; known optimisation targets open. |
| **UX / GUI** | needs assessment | No play session run yet. |

## Backlog (top = next)

- [x] Trim PR long-pole tests `phase72_code_review_batch_b` and
      `phase73d_direction_vector` to <60s without weakening assertions.
- [ ] One clean end-to-end `RUN_SLOW=1 npx vitest run`; fix what it surfaces.
      **(IN PROGRESS — running in background to establish green/red baseline +
      per-test timing; output captured to `runslow-baseline.log` in repo root
      (untracked, do NOT commit). Pulled ahead of the gen-count sweep because it
      provides the data to target that sweep at the real long poles instead of
      guessing. If this log exists and is complete, analyze it; if absent/stale,
      re-run `RUN_SLOW=1 npx vitest run`.)**
- [ ] Sweep oversized `sim.step()` gen-counts in RUN_SLOW files; reduce where
      the assertion doesn't require them. **(Blocked on the RUN_SLOW timing data
      above. NOTE: grep shows the biggest loops — cluster_expansion 500,
      tone_sandhi 1000, typological_completion 1000, sampling 3000 — are in the
      FAST tier, not RUN_SLOW; verify whether they break early / aren't sim.step
      before touching. Don't weaken statistical/long-run assertions.)**
- [ ] Baseline GUI play session (Manual/GUI verification); log under UX findings.
- [x] Assess translator quality (code-level): feature-rich, but word-level
      `translate()` is weaker than the sentence path; realiser on legacy English
      IR; fallback compound-only. (Live-phrase check deferred to GUI play.)
- [ ] Translator: route word-level `translate()` (translate.ts) through
      `lookupFormWithResolution` (the shared 8-rung cascade) + optional graceful
      fallback, so single-word translation matches sentence-level resolution.
      Add focused tests. [highest-value translator win, low risk]
- [ ] Translator anglocentrism audit: render sentences for non-SVO / case /
      article-less presets (bantu, tokipona) and check adjective/possessive/
      relative-clause ordering + morphology aren't English-shaped; log fixes.
- [ ] Assess narrative-generation output quality (play session) and
      language-agnosticism of its grammar assembly.
- [x] Audit presets for English-based encoding (code-level): forms are NOT
      relexified English (Bantu authentic proto-Bantu; default lexicon is
      PIE-flavored). Real anglocentrism = the shared English concept inventory.
- [ ] De-anglicization: let presets declare genuine colexifications (e.g. Bantu
      arm=hand) so the concept inventory differs per language instead of storing
      duplicate forms. Check whether the concept registry / seedColexization
      already supports this before adding. [may become NEEDS DECISION if it needs
      concept-registry changes]
- [ ] Presets "more words": quantify each preset's hand-authored vs filled
      coverage and raise the ~240-concept ceiling (basic240) / add authentic
      forms for new concepts. Scope before doing.

## Done log

- (baseline) Pre-existing engine fixes + test speedups + two-tier CI + arch-doc
  updates were committed as `853b7ec "yay"` and merged to `main` via PR #176.
  The loop branches `auto/realism` from that point.
- Trimmed the two PR long-pole tests under 60s (test-only): B7 runs a
  non-splitting lineage (intrinsic drift property — tree splitting was
  irrelevant cost+noise), 37.5s→20s; phase73d shares one 60-split sample across
  its five statistical tests via beforeAll (~5× less compute, same power),
  66s→~17s. Both files now <60s; combined wall 80s→50s.

## UX findings

_(populated by GUI play sessions)_

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
