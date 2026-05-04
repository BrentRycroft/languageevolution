# ADR 0003: Every step gated by a mode flag

## Status

Accepted (Phase 29 Tranche 3b).

## Context

Pre-Phase-29, `SimulationConfig.modes` had six flags
(`phonology, grammar, semantics, genesis, tree, death`). Meanwhile
`simulation.step()` ran ten more subsystem steps unconditionally:
obsolescence, copula erosion, copula genesis, taboo, learner,
inventory management, contact, areal typology, creolization,
volatility. Users who wanted to "turn off contact" could not.

The lack of mode flags also coupled subsystems silently: if a
property-test wanted to isolate phonology behavior, it had to run a
full sim step including grammaticalisation, areal typology, and
contact, all of which could perturb state in ways that made the test
unstable.

## Decision

Every callable step in `simulation.step()` is gated by a flag in
`SimulationConfig.modes`:

```ts
modes: {
  phonology, grammar, semantics, genesis, tree, death,
  contact, volatility, areal, creolization, learner,
  obsolescence, taboo, copula,
}
```

All flags default to `true`. The UI's ControlsPanel exposes them.
Tests can flip individual flags off to isolate a subsystem.

Adding a new subsystem step in the future requires:

1. Add a `modes.<name>` flag to `SimulationConfig.modes`.
2. Default it to `true` in `config.ts:defaultConfig()`.
3. Wrap the call site in `simulation.ts:step()` with
   `if (config.modes.<name>) ...`.
4. Surface the toggle in `ControlsPanel.tsx`.

## Consequences

- The save format includes the mode flags; old saves with fewer flags
  migrate via `persistence/migrate.ts` filling defaults.
- Property tests gain a useful hammer: turn off everything except the
  subsystem under test.
- Users can build curated runs (e.g., "phonology only" for visualising
  raw sound change without lexical noise).
