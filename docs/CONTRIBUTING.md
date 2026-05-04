# Contributing

Welcome. The simulator is designed to be extensible — most contributors
add a new sound-change rule, a new preset, or a new UI panel. Each
section below shows the smallest path through the codebase for a
common task.

## Setup

```bash
git clone <repo>
cd languageevolution
npm install
npm run dev               # http://localhost:5173
```

Run tests in another terminal:

```bash
npm test                  # default suite (~5 min)
npm run test:slow         # full surface (multi-minute long runs)
npx tsc --noEmit          # type-check
```

The default suite is gated to fit under a 5-minute CI budget. A few
heavy multi-hundred-generation tests live behind `RUN_SLOW=1`.

## Where things live

See `docs/ARCHITECTURE.md` for the layered map. Short version:

- Engine code: `src/engine/` (no React, runs in a Web Worker).
- UI: `src/ui/` (React + Zustand).
- Persistence: `src/persistence/` (versioned save/load + autosave).

## Adding a sound-change rule

1. Add the rule to `src/engine/phonology/catalog.ts` — pick a
   `category` from `SoundChangeCategory` (`types.ts`), give it a
   stable `id` of the form `category.name`, write `probabilityFor`
   and `apply`.
2. Decide `enabledByDefault: true | false`. Most marked processes
   stay opt-in.
3. If the rule is stress-conditioned, set `stressFilter`.
4. Cover behaviour with a focused test (any of
   `__tests__/regular.test.ts`, `__tests__/stress_rules.test.ts`,
   `__tests__/catalog_balance.test.ts` are good models).

The `apply` function MUST receive `rng` and use it for any random
choice — never `Math.random()`. Determinism requires this.

## Adding a preset

1. Drop a new file `src/engine/presets/<name>.ts` returning a
   `SimulationConfig`. Look at `presetEnglish` for the most complete
   example.
2. Register it in `src/engine/presets/index.ts:PRESETS`.
3. Seed at minimum: `seedLexicon`, `seedFrequencyHints`,
   `seedMorphology`, `seedStressPattern`, `seedPhonotacticProfile`,
   `seedGrammar`. Without `seedFrequencyHints` the preset's lexicon
   defaults to 0.5 frequency and the high/low-freq split (Phase 24)
   degenerates.
4. Cover with a smoke test in `__tests__/preset_coverage.test.ts`.

## Adding a UI panel

1. Drop a new component in `src/ui/<PanelName>.tsx`. Use existing
   panels (`SoundLawsView`, `LexiconView`) as scaffolding.
2. Read state via `useSimStore((s) => s.state.x)`.
3. Register the panel in `src/ui/tabs.ts` + `App.tsx`.
4. Write a shallow render test under `src/ui/__tests__/`.

## Coding style

- Prefer editing existing files over creating new ones.
- Don't use `Math.random()` in engine code (lints will flag this in
  the future).
- Don't write `lang.lexicon[m] = ...` — go through `setLexiconForm`.
- Don't add comments that just describe what the code does. Comment
  only when the WHY is non-obvious — a hidden constraint, a workaround
  for a specific bug, or a phase tag tied to a design note.
- Branded types are fine when they prevent a real bug; don't
  introduce them speculatively.

## Tests

- Engine tests: `src/engine/__tests__/*.test.ts`.
- UI tests: `src/ui/__tests__/`.
- Persistence: `src/persistence/__tests__/`.
- Property tests using `fast-check` cover invariants.

If your change adds a new feature, add at least one focused test. If
your change touches an existing test, update it in the same commit.

## Determinism

`__tests__/simulation.test.ts > "two sims with identical config
produce identical state after N steps"` is the gate. Any change that
affects engine output must keep this passing.

## Saves and migrations

Save format is versioned (`LATEST_SAVE_VERSION` in
`persistence/migrate.ts`). If you change `Language` or
`SimulationState` in a way that breaks parse-roundtrip:

1. Bump `LATEST_SAVE_VERSION`.
2. Add a migrator entry in `persistence/migrate.ts`.
3. Update `AUTOSAVE_VERSION` (which now tracks
   `LATEST_SAVE_VERSION`).

## Commits and PRs

- Keep commits focused. Each tranche or sub-task is its own commit.
- Title format: `Phase N Tranche X: short summary`.
- Push to `claude/working`; PRs go from there to `main`.
- The CI pipeline runs `npm test` + `npx tsc --noEmit`. Both must be
  green.
