# G0 — Determinism Model Migration — Design

**Date:** 2026-06-13
**Sub-project:** G0 of the geometry-native program ([roadmap](2026-06-13-geometry-native-program-roadmap.md))
**Branch:** `auto/storage-pointnative` (= `auto/realism`, `8307a08`, pushed to origin)
**Status:** Approved (brainstorming complete)

## Goal

Migrate the project's determinism gate from **cross-machine byte-identity** (the
`meaning_layer_baseline` frozen `GEN0`/`GENN` hash maps) to **per-machine reproducibility +
metric-stability snapshot bands**. This relaxation unblocks the GPU work (G7 — GPU floats are
not bit-identical across hardware) and the geometric reworks (G1/G2 — they change evolved
output, which a byte-identity lock would fight on every change).

**G0 changes no engine code** — it is a gate-model migration only. The current CPU engine is
fully deterministic, so per-machine reproducibility passes trivially today; G0 establishes the
right invariant to lock *now* so later GPU/geometric work has a gate that doesn't depend on
byte-identity.

## Background — what already exists

The replacement gates are largely already present:

- **Per-machine reproducibility** is already tested: `simulation.test.ts` "simulation
  determinism" ("two sims, identical config → identical state after 30 steps", full-state) and
  the scorecard's same-seed `reproMatch` hard gate (10 gens, lexicon signature).
- **Statistical/realism gates** already exist and are already the day-to-day gate:
  `realism_scorecard.test.ts` (~20 calibrated diagnostic rows via `diagnostics/buildScorecard.ts`
  + `diagnostics/scorecard.ts`, RUN_SLOW, 200 gens single-lineage) and
  `divergence_regression.test.ts` (behavioural floors: mean Δ ≥ 1.5, length ≥ 75% of seed,
  <12% one-phoneme words), plus `proto_preservation.test.ts` and the `realism_*` suite.
- **`meaning_layer_baseline.test.ts`** is the lone cross-machine byte-identical fixed-hash gate —
  the thing to retire. Its `signature()` (gloss→form pairs + word formKeys) and per-preset
  trajectory runner are reused below.

## Architecture — three-layer gate model

### Layer 1 — Reproducibility gate (same-machine, exact)

A new `src/engine/__tests__/reproducibility.test.ts`. For each of the 6 presets, run the sim
**twice** (fresh `createSimulation`, identical config) and assert the two **live** output
signatures are identical — no frozen baseline.

- Reuses `meaning_layer_baseline`'s `signature(sim)` (gloss→form + word formKeys) and its
  per-preset stepping loop.
- **FAST tier** (every run): gen-0 + a short trajectory (e.g. 5 gens) twice → identical.
- **RUN_SLOW tier:** the full 30-step trajectory twice → identical.
- This is the determinism invariant that survives GPU: same machine + same config ⇒ identical
  output. On CPU today it is trivially green (intended — it is the future guard for G7).

### Layer 2 — Metric-stability snapshot bands (soft regression detector)

The new regression-catching layer that replaces byte-identity's precision, tolerant to small
drift. It **piggybacks on the existing scorecard run** (no new 200-gen sims).

- **Metrics (per preset, ~8–10 scalars)** selected from the `DiagnosticRow[]` that
  `buildScorecard` already emits: Swadesh retention @1000/2500/5000yr, segmental inventory
  size, colexification rate, antonym embedding separation, mean Δ (divergence), lexicon size
  ratio, mean word length, one-phoneme word share.
- **Snapshot store:** a committed typed module `src/engine/__tests__/metric_bands.snapshot.ts`,
  shape `Record<presetId, Record<metricId, { value: number; band: number; absolute: boolean }>>`.
  This is the re-bakeable baseline — each deliberate update carries a dated comment, same
  discipline as the old hash re-bakes, but tolerant.
- **Band widths (starting points, finalized at capture):** shares/rates (Swadesh, colex,
  one-phoneme) absolute ±0.05; counts (inventory) ±15% or ±4; ratios (lexicon size) ±0.3;
  magnitudes (mean Δ, word length, antonym separation) relative ±15–20%. Each band is set to
  comfortably contain the captured current value plus room for legitimate drift.
- **Gating:** the band assertions are **folded into the scorecard test** — after it builds the
  rows, each metric with a snapshot hard-asserts `|actual − snapshot.value| ≤ band` (relative or
  absolute per `snapshot.absolute`). The scorecard's aspirational "preferred" values stay a
  *report*; the *snapshot* values gate. RUN_SLOW (the metrics need the full run).

### Layer 3 — Existing statistical floors stay hard gates

`divergence_regression`, `proto_preservation`, the `realism_*` floors, and the scorecard's
catastrophe/sanity floors are unchanged and remain hard gates. The scorecard's preferred-value
rows stay a report.

### Retired

`meaning_layer_baseline.test.ts`'s frozen `GEN0`/`GENN` maps and the byte-identity assertions.
`signature()` moves into `reproducibility.test.ts`.

## Migration sequencing (additive, behavior-neutral)

Stand up the new gates *before* removing the old net:

1. **Reproducibility gate.** Add `reproducibility.test.ts` (run-twice-identical, all 6 presets),
   reusing `signature()`/runner. Runs alongside `meaning_layer_baseline` — both green.
2. **Metric-bands layer.** Capture the initial snapshot (current values = correct, since G0 is
   behavior-neutral), set per-metric bands, fold the band assertions into the scorecard. Green.
3. **Prove coverage with negative tests.** A self-check confirming the reproducibility gate
   *fails* when two runs are made to diverge, and that a band *fails* under an injected metric
   perturbation — so the gates demonstrably catch what they claim.
4. **Retire `meaning_layer_baseline`.** Remove the frozen `GEN0`/`GENN` maps and byte-identity
   assertions; `signature()` now lives in the reproducibility gate.
5. **Docs.** Update CLAUDE.md's determinism guidance (invariant #1) from "byte-identical" →
   "per-machine reproducibility + metric-stability bands"; note the new model in
   `docs/planning/ROADMAP.md`.

## Testing

The gates are the tests. Verification:
- Each new gate green (reproducibility FAST + RUN_SLOW; metric bands under RUN_SLOW).
- The **negative tests** (step 3) pass — i.e. the gates fail when they should.
- Full `vitest run` + RUN_SLOW green after the retirement (no orphaned imports of the removed
  hash maps; `tsc --noEmit` clean).

## Behavior-neutrality / determinism note

G0 touches no engine code. The metric snapshot's initial values equal the current values;
reproducibility trivially passes on CPU. So nothing about evolved output changes — the only
change is that we **stop gating on frozen cross-machine hashes** and start gating on
reproducibility + bands.

## Risks

- **Band widths:** too tight → brittle; too loose → miss regressions. Mitigated by setting each
  from the captured current value plus a sensible margin, and the negative test in step 3.
- **Reproducibility trivially green today:** intended — it is the future guard for GPU (G7). It
  costs little and locks the invariant now.
- **Loss of precise cross-machine signal:** accepted per the program's determinism-relaxation
  decision; the metric bands are the (looser) machine-independent replacement.

## Out of scope

- Any engine/behavior change (this is gate infra only).
- GPU work (G7) and the geometric reworks (G1/G2) that *use* the relaxed model.

## Success criteria

1. A reproducibility gate asserts run-twice-identical for all 6 presets (FAST + RUN_SLOW).
2. A metric-bands layer hard-gates ~8–10 per-preset scalar metrics within committed bands,
   reusing the scorecard run.
3. Negative tests prove both new gates catch real breaks.
4. `meaning_layer_baseline`'s frozen hashes are removed; nothing references them; suite green.
5. CLAUDE.md + ROADMAP reflect the new determinism model.
