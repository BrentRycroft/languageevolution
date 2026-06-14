# G2 — Geometric Translator + Narrative — Design

**Date:** 2026-06-13 · **Sub-project:** G2 ([roadmap](2026-06-13-geometry-native-program-roadmap.md)) · **Depends on:** G1
**Branch:** `auto/storage-pointnative` · **Status:** Approved (streamlined — user pre-approves plans).

## Goal

Make translation and narrative resolve **geometrically end-to-end**: every *content* meaning →
lexeme resolution goes through `idForConcept` (geometric nearest-meaning), finishing the
conversion the S6 storage work started; remove the remaining discrete `idForGloss` content
sites and the vestigial dead `_id = idForGloss(...)` computations; keep closed-class function
words on exact string-literal resolution (a finite set, legitimately not geometric).

## Background

- `idForConcept(lang, m)` (geometric: the lexeme whose emergent gloss is `m`, with `idForGloss`
  fallback) was introduced in S6 and wired into the main output sites (`resolveOpen`, lookup
  Rung-1, `translate`, narrative content sites).
- Remaining **discrete** `idForGloss` usage: `translator/abstraction.ts`, `ast.ts`,
  `closedClass.ts`, `cognates.ts`, `gracefulFallback.ts` — several are vestigial `const _id =
  idForGloss(...)` (computed, unused) left from the partial S6 conversion.
- `translator/englishWordlist.ts` `isValidEnglishLemma` gates English *input* via
  `isRegisteredConcept` + closed-class + affix parsing.

## Decisions

1. **Content resolution → `idForConcept`** (geometric) at every content site; drop vestigial
   `_id = idForGloss(...)` dead computations.
2. **Closed-class function words stay exact** (string-literal / `idForGloss`) — articles,
   prepositions, conjunctions, pronouns, copulas are a finite closed set; geometry would blur
   them.
3. **Input-validity gate broadens with G1:** under the continuous inventory, `isRegisteredConcept(m)`
   means "m is in the GloVe vocabulary," so any real English word is valid input — keep the
   closed-class + affix branches of `isValidEnglishLemma`, drop nothing else.
4. **Reverse/caption** continues to use the S6 hybrid `effectiveGloss` (emergent where real,
   authored where compound/orphan).

## Scope of change (audit)

Per `git grep -n idForGloss -- src/engine/translator src/engine/narrative`: convert the
content sites, remove vestigial `_id`, keep the closed-class sites. The narrative side
(`composer.ts`, `generate.ts`) was largely converted in S6 — re-audit for any residual discrete
content resolution.

## Determinism & testing

- Reproducibility (G0) green — geometric resolution is deterministic.
- The translator corpus (the 5 user phrases + placeholder, in `diagnostics/translatorCorpus.ts`)
  and the narrative snapshot tests must stay sensible; geometric resolution may pick different
  words than exact gloss-match (output shift) — acceptable under the relaxed model; re-bake any
  affected snapshot/metric band deliberately.
- Scorecard translator rows + `proto_preservation` still pass.

## Risks

- Geometric resolution picking a near-synonym instead of the exact word (handled/welcomed by G4
  register work; here just ensure it's never *worse* than the discrete path — the `idForGloss`
  fallback inside `idForConcept` preserves exact hits).
- Closed-class must remain exact (guard with a closed-class realisation test).

## Success criteria

1. No content-resolution `idForGloss` remains in translator/narrative (only closed-class +
   `idForConcept`'s internal fallback); no vestigial `_id` dead computations.
2. Translator corpus + narrative snapshots sensible (deliberately re-baked where shifted);
   reproducibility green; closed-class realisation intact.
