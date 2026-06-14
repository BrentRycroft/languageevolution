# G5 — Authentic Vocabulary (post-geometric) — Design

**Date:** 2026-06-13 · **Sub-project:** G5 ([roadmap](2026-06-13-geometry-native-program-roadmap.md)) · **Depends on:** G1
**Branch:** `auto/storage-pointnative` · **Status:** Approved (streamlined).

## Goal

Author authentic **forms** for each preset's meanings against the **geometric inventory** (G1) —
the folded-in E1–E6 vocabulary expansion. (Sub-project M already removed the random floor, so
the acute "made-up words" bug is gone; G5 enriches authentic vocabulary, now in the
post-geometric world.)

## Background / reuse

- The **E charter** (`docs/superpowers/plans/2026-06-13-preset-vocab-E-execution-charter.md`) and
  **E spec** (`docs/superpowers/specs/2026-06-13-preset-authentic-vocabulary-design.md`) already
  define the per-language source map (Wiktionary reconstructions, BLR3, nimi pu, CMUdict),
  IPA-normalization conventions, the `validatePresetIpa` gate, and the determinism re-bake
  protocol. G5 reuses them, with two updates for the new world.

## Decisions (deltas from the original E)

1. **Target = the geometric inventory.** Words are authored for the meanings G1's continuous
   inventory exposes (the GloVe vocabulary), per language, where an authentic form exists; gaps
   stay unlexicalised (runtime compounding fills them).
2. **Gate = the G0 model**, not byte-identity: `validatePresetIpa` clean per preset; per-machine
   reproducibility green; each preset's **metric bands re-baked** deliberately (no frozen hashes).
3. **Execution = parallel worktree subagents** (6 languages, one per worktree) via the hardened
   dispatch protocol (push exact base + verify; self-contained prompts; base-guard; npx; merge +
   re-bake). This is the proven-reliable path.

## Determinism & testing

- `validatePresetIpa` no blocking issues per preset; reproducibility green; per-preset metric
  bands re-baked (dated note). Full suite green after the 6 merges.

## Risks

- Authenticity at scale (web-sourced) — the charter's "correctness over volume, never invent"
  rule governs; controller reviews each agent's sourcing.
- Six parallel worktrees — reliable via the protocol; reconcile by sequential merge + re-bake.

## Success criteria

1. Each preset's authentic authored vocabulary is significantly expanded against the geometric
   inventory, web-sourced, `validatePresetIpa`-clean.
2. Per-machine reproducibility green; per-preset metric bands re-baked; full suite green.
