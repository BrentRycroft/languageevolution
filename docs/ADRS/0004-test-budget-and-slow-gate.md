# ADR 0004: Test budget and the RUN_SLOW gate

## Status

Accepted (Phase 29 Tranche 7g).

## Context

By the start of Phase 29 the test suite had ballooned to 140+ files
totalling ~10 minutes wall-clock on default hardware. Many of the
slowest were 200–400 generation full-simulation tests that exercised
the same code paths as a 50-gen run, just with more noise. CI was
pushing past the 5-minute budget the project agreed to.

Trimming gen counts on a few tests helped, but for some tests (e.g.
the integration_e2e cross-preset roundtrip, the divergence-regression
floor check, the substrate-simplification gate) the assertion's
statistical power requires a long run.

## Decision

Two-tier test execution:

- **`npm test`** — default suite, must complete in < 5 minutes on
  CI. `vite.config.ts` excludes a curated list of heavy files when
  `RUN_SLOW` is unset.
- **`npm run test:slow`** — full surface, exercised on CI pre-push
  / nightly.

Files currently behind `RUN_SLOW=1`:

```
properties.test.ts           (fast-check property suite)
smoke_2k.test.ts             (multi-thousand-gen smoke)
lexicogenesis_e2e.test.ts    (lexicogenesis end-to-end)
presets.test.ts              (full preset matrix)
render_every_tab.test.tsx    (full UI render sweep)
divergence_regression.test.ts (200-gen divergence floor)
integration_e2e.test.ts      (multi-preset full sim)
sprint4_realism_polish.test.ts (250-gen substrate phase)
rate_calibration.test.ts     (200-gen rate calibration)
genesis_mechanisms.test.ts   (200-gen origin-tag diversity)
```

When adding a new heavy test, prefer trimming its gen count first; if
the assertion genuinely needs long runs, gate behind `RUN_SLOW`.

## Consequences

- Default suite reliably stays under budget.
- Some regressions only surface in the slow suite; CI catches them
  pre-merge but a developer running `npm test` locally won't see
  them. Tradeoff accepted.
- The slow gate is easy to revisit: as engine performance improves,
  files can move back into the default suite.
