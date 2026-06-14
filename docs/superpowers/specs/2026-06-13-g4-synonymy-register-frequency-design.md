# G4 — Synonymy + Register/Frequency — Design

**Date:** 2026-06-13 · **Sub-project:** G4 ([roadmap](2026-06-13-geometry-native-program-roadmap.md)) · **Depends on:** G1, G2
**Branch:** `auto/storage-pointnative` · **Status:** Approved (streamlined).

## Goal

Richer synonymy with **register + commonness-aware selection**: when a meaning has several
forms, the **common/unmarked** one (e.g. *black*) is the default, and **rare/marked** synonyms
(e.g. *swarthy*) surface only in matching register/genre. Add the missing **commonness
(frequency/markedness)** dimension and broaden synonym candidates geometrically.

## Background

Phase 37 already provides synonymy: `lexicon/synonyms.ts` (`maybeSpawnSynonym` with
`stylistic-split` / `literary-borrow` / `register-split` pathways + register tags) and
`translator/realise.ts` synonym-pick context (`register: "high"|"low"|"neutral"` + a
per-sentence rotation tracker). **Missing:** a commonness/markedness axis and geometric
near-synonym candidates — so selection can't currently prefer the unmarked common word.

## Decisions

1. **Commonness/markedness per synonym** = blend of (a) the form's in-language usage frequency
   (`wordFrequencyHints`) and (b) for English-keyed meanings, the G1 **corpus rank** (`rankOf`).
   The lowest-markedness synonym is the default; higher-markedness ones are gated to matching
   register/genre.
2. **Broaden candidates geometrically:** synonym candidates for a meaning include its tight
   geometric near-synonyms (`geometricNeighbors` above a high cosine threshold) + recorded
   colexification partners, not just Phase-37 spawned splits.
3. **Selection rule:** in neutral register, pick the unmarked (most-common) synonym; in a marked
   register/genre (literary/archaic), allow the marked/rare synonym. Keep the existing rotation
   tracker (avoid repetition within a sentence).

## Determinism & testing

- Reproducibility (G0) green — selection is deterministic given context.
- LOCK test: a language with a common + a rare synonym for one meaning realises the common one
  in neutral register and the rare one only under a marked register.
- Scorecard semantics rows + narrative snapshots re-baked deliberately where selection shifts.

## Risks

- Over-using rare words → unnatural text; calibrate the markedness threshold so neutral text
  stays unmarked.
- Must stay agnostic — markedness from the language's own frequencies, with corpus rank only as
  a prior for English-keyed concepts.

## Success criteria

1. Synonym selection weights register **and** commonness; the unmarked common word is the
   neutral default, marked synonyms gated to register.
2. Synonym candidates include geometric near-synonyms.
3. LOCK test passes; reproducibility green; snapshots/bands re-baked deliberately.
