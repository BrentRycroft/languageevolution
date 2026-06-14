# G3 — Surface Display-Only Typology — Design

**Date:** 2026-06-13 · **Sub-project:** G3 ([roadmap](2026-06-13-geometry-native-program-roadmap.md)) · **Depends on:** G2
**Branch:** `auto/storage-pointnative` · **Status:** Approved (streamlined).

## Goal

Make typological features that are currently **declared but display-only** actually **realize**
in translator + narrative output. Flagship example (user): polysynthetic languages don't
surface as polysynthetic. Every declared grammar axis should produce visible, typologically-
faithful output, not just a label in the grammar view.

## Background / audit target

Declared axes in `grammar` (`types.ts`) and their realisation status in `translator/realise.ts`
/ narrative:
- **Already realised (verify):** `voice`, `aspectMarking`, `incorporates` (noun incorporation —
  prepends the object root), case/articles/numerals/negation/demonstratives.
- **Suspected display-only (audit + wire):** `evidentialMarking` (evidential affixes on the
  verb), `serialVerbConstructions` (serial-verb chaining in narrative), `politenessRegister`
  (honorific realisation beyond pronoun choice), `classifierSystem` (beyond the numeral
  classifier), and **holistic polysynthesis** — `synthesisIndex ≥ 3.0` is *labelled*
  "polysynthetic" (`typology_drift.ts`) but the realiser may not stack agreement/incorporation
  heavily enough to *look* polysynthetic.
- `harmony` / `alignment` are largely phonology/morphology-layer, not realiser — confirm they
  surface where expected (vowel harmony in forms; case alignment in argument marking).

## Approach

1. **Audit** (Task 1): for each declared axis, construct a minimal test language that sets the
   axis and check whether translator + narrative output reflects it. Produce a
   realised-vs-display-only table.
2. **Wire** each display-only axis into the realiser/narrative so it surfaces, driven by the
   language's own typology (agnostic — never English defaults). Prioritise **polysynthesis** as
   the flagship: a high-`synthesisIndex` language should visibly incorporate + stack
   subject/object agreement + TAM affixes into a single verbal word.
3. **Lock** each newly-surfaced axis with a behaviour test (the "agnosticism LOCK test" pattern
   already used in the repo) so it can't regress to display-only.

## Determinism & testing

- Reproducibility (G0) green. New realisation paths consume RNG only where they legitimately
  must; reproducibility (run-twice-identical) still holds.
- Per-axis LOCK tests (set axis → assert the feature appears in output).
- Narrative snapshots + scorecard translator rows re-baked deliberately where output gains the
  newly-surfaced morphology.

## Risks

- Over-stacking → unreadable words; cap by the language's own `phonotacticProfile` /
  `synthesisIndex` rather than maxing out.
- Must stay agnostic (each axis realised per the language's parameters, not a hardcoded
  template) — the repo's standing language-agnosticism invariant.

## Success criteria

1. An audit table of every declared axis: realised vs (was) display-only.
2. Each formerly display-only axis surfaces in output, driven by the language's typology, with a
   LOCK test. Polysynthesis visibly surfaces for high-synthesis languages.
3. Reproducibility green; snapshots/bands re-baked deliberately.
