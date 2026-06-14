# G6 — Evolving Orthography — Design

**Date:** 2026-06-13 · **Sub-project:** G6 ([roadmap](2026-06-13-geometry-native-program-roadmap.md)) · **Depends on:** G0
**Branch:** `auto/storage-pointnative` · **Status:** Approved (streamlined).

## Goal

Give the presets — **specifically Latin and Modern English** (user) — their own **orthographic
systems** that **evolve over time**: spelling that starts preset-faithful (English's deep,
polyvalent spelling; Latin's near-phonemic spelling) and then drifts/lags behind sound change,
producing realistic opacity (English "knight") and Latin→Romance spelling shifts.

## Background — what already exists

`phonology/orthography.ts` (509 lines) already provides: `DEFAULT_ORTHOGRAPHY` (phoneme→grapheme),
`romanize(form, lang, meaning)` with **word-level frozen historical-spelling overrides** (already
models "knight"), `OrthographyShift` + `tierOrthographyMultiplier` (**tier-gated spelling drift** —
tier 2 drifts, tier 3 with print/dictionaries dampens), `seedTierTwoOrthography`.
`lexicon/literacy.ts` feeds literary stability back into phonology erosion. So **evolving spelling
already exists** — G6 enriches it per-preset.

## Decisions

1. **Per-preset orthography profiles.** Add `seedOrthography` to the English and Latin presets — a
   phoneme→grapheme convention capturing each system's character (English digraphs/silent letters;
   Latin near-phonemic). Other presets keep `DEFAULT_ORTHOGRAPHY`.
2. **Faithful evolution via the existing machinery.** Drive spelling lag/opacity through the
   existing `OrthographyShift` + frozen-spelling + tier-multiplier system, calibrated so English
   *keeps/accrues* opacity (spelling conservative under sound change) and Latin spelling shifts as
   it Romance-ifies. No new evolution engine — calibrate the one that exists.
3. **Scope = display + literacy feedback.** Orthography is a form→spelling display layer (+ the
   `literaryStabilityFor` feedback). Lower-risk than the geometric reworks.

## Determinism & testing

- Reproducibility (G0) green; orthography drift is deterministic.
- Per-preset spelling LOCK tests: English renders English-like spelling (digraphs/silent letters)
  and accrues opacity over generations; Latin renders near-phonemic and shifts over a long run.
- Metric bands re-baked only if the `literaryStabilityFor` feedback shifts evolved forms.

## Risks

- Hand-authoring an English orthography that "looks like English" without over-fitting — keep it a
  rule set (grapheme conventions), not a per-word spelling dictionary.
- Don't let orthography drift destabilise the phonological sim (it's mostly display + bounded
  literacy feedback).

## Success criteria

1. English + Latin presets carry their own `seedOrthography`; rendering looks preset-faithful.
2. Spelling evolves: English accrues opacity (spelling lags sound), Latin shifts — locked by tests.
3. Reproducibility green; bands re-baked only if literacy feedback moved forms.
