# ADR 0002: Deterministic RNG

## Status

Accepted. Re-affirmed in Phase 29 Tranche 2 after a `Math.random()`
leak in `phonology/catalog.ts:compensatory.medial_coda_lengthening`
broke the determinism property for several phases.

## Context

The README claims byte-for-byte reproducibility from a seed string +
generation count. This is only true if every random decision in the
engine threads through `Rng` (the `makeRng(seed)` factory in
`engine/rng.ts`).

The simulator's value depends on this property:

- Saved runs replay exactly.
- Shareable URLs reproduce another user's session.
- Property tests using `fast-check` make sense.
- Bug reports are reproducible from `(seed, generation)` alone.

## Decision

1. Engine code (`src/engine/`) MUST NOT call `Math.random()`. Every
   random decision threads `rng: Rng` from the simulation step down.
2. When a function deep in the engine needs randomness without a
   threaded rng, derive a sub-rng from a known stable input:
   `makeRng(originalSeed + ":context")` or
   `fnv1a(state.rngState ^ contextHash)`.
3. Iteration order leaks: when iterating `Object.keys(record)` and the
   choice influences subsequent decisions, sort the keys.
4. The RNG state is a single `number` (Mulberry32). Persist it in
   `SimulationState.rngState` at end-of-step.

## Consequences

- The plan calls for an ESLint rule banning `Math.random()` in
  `src/engine/`. Not yet enforced.
- The determinism check in `simulation.test.ts` is the gate. Runs 30
  steps × 2 sims and asserts byte-equal lexicons + grammar +
  activeRules + phoneme inventory.
- Phase 28d's `compensatory.medial_coda_lengthening` rule was the most
  recent leak. The rule already received `rng` as a parameter — it
  just used `Math.random()` for one site-pick on line 965. Phase 29
  Tranche 2a fixed this and re-enabled the test.
