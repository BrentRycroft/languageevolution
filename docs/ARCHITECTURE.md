# Architecture

A high-level map of the language-evolution simulator. For build / run
instructions and feature surface, see the top-level `README.md`. For
contributor onboarding, see `docs/CONTRIBUTING.md`.

## Layered structure

The codebase is layered: each row depends only on the rows above it.

| Layer | Path | Depends on | Owns |
|------|------|------------|------|
| Engine core | `src/engine/` | (nothing — pure TS) | data model, simulation, presets, RNG |
| State | `src/state/` | engine | Zustand store, history, playback |
| Persistence | `src/persistence/` | engine | versioned save/load, migrations, autosave |
| Share | `src/share/` | engine, persistence | URL-encoded shareable runs |
| UI | `src/ui/` | state, persistence, share | React components, all panels |
| App | `src/main.tsx`, `src/App.tsx` | UI | shell + routing |

The engine has zero React imports and runs unchanged inside a Web
Worker (`src/engine/worker.ts`).

## The simulation pipeline

Every generation, `simulation.step()` runs each leaf language through
the pipeline in this fixed order. Each step is gated by a flag in
`SimulationConfig.modes`:

```
volatility → phonology → learner → inventoryManagement → obsolescence
→ copula{Erosion,Genesis} → taboo → genesis → grammar → morphology
→ semantics → contact → arealTypology → treeSplit → death
```

Then post-loop, regardless of leaf:

```
arealWaves → creolization → reabsorbExtinctTerritory
```

Each step may mutate the language in place. After the loop, the
top-level state object is replaced with `{ ...state, generation,
rngState, ... }` so React subscribers re-render.

### The RNG

`src/engine/rng.ts` exposes a Mulberry32 generator seeded by
`fnv1a(seedString)`. The generator's full state is one `number`, so
`rngState` is serialisable. `state.rngState` is captured at the end of
every step. Restoring from a save replays exactly because the same
seed + same generation count produces the same RNG state.

## Data model

Every language is a `Language` (`src/engine/types.ts`). The fields
cluster into:

- **identity**: `id`, `name`, `birthGeneration`
- **lexical**: `lexicon` (meaning-keyed), `words` (form-keyed),
  `wordFrequencyHints`, `wordOrigin`, `wordOriginChain`,
  `inflectionClass`, `suppletion`
- **phonology**: `phonemeInventory`, `enabledChangeIds`, `changeWeights`,
  `activeRules`, `retiredRules`, `ruleBias`, `otRanking`,
  `phonotacticProfile`, `stressPattern`, `lexicalStress`,
  `correspondences`, `diffusionState`
- **morphology / grammar**: `morphology.paradigms`,
  `derivationalSuffixes`, `grammar` (50+ typology axes)
- **semantics / discourse**: `registerOf`, `colexifiedAs`, `variants`
- **state / metadata**: `events`, `extinct`, `culturalTier`, `speakers`,
  `coords`, `territory`, `volatilityPhase`, `localNeighbors`,
  `bilingualLinks`

Most fields are `?:` optional with a sensible default at the read site;
this keeps migration painless when new features land. The `defaults.ts`
factory is the canonical place to construct fresh languages.

## Single source of truth (Tranche 1)

Two pairs of fields used to be in tension:

- `lang.lexicon` (meaning → form) vs `lang.words` (form-keyed entries)
- `lang.phonemeInventory.segmental` vs the lexicon-observed phoneme set

Tranche 1 routes all writes through chokepoints
(`lexicon/mutate.ts:setLexiconForm`,
`lexicon/word.ts:syncWordsAfterPhonology`) so the two views stay
consistent. New code should never write `lang.lexicon[m] = ...` or
mutate `lang.words` directly outside these helpers.

Property tests in `__tests__/phase_29_invariants.test.ts` enforce the
agreement.

## Determinism

The README claims byte-for-byte reproducibility. To preserve that:

- Never use `Math.random()` in `src/engine/`. Use the threaded `Rng`.
- Never iterate `Object.keys(...)` without sorting if the order leaks
  into subsequent decisions.
- New random decisions: thread `rng` to the function or accept a
  derived seed (`fnv1a(seed + ":context")`).

`__tests__/simulation.test.ts > "two sims with identical config produce
identical state after N steps"` validates this end-to-end.

## Testing strategy

- Default `npm test` runs the full surface in under 5 minutes
  (vite.config.ts gates a handful of multi-hundred-gen tests behind
  `RUN_SLOW=1`).
- `npm run test:slow` runs everything; CI pre-push uses this.
- Property tests via `fast-check` cover invariants that should hold
  under arbitrary random input
  (`__tests__/phase_29_invariants.test.ts`).
- Each major engine subsystem has a focused test file
  (`__tests__/<subsystem>.test.ts`).
- UI tests are mostly shallow renders (`src/ui/__tests__/`).

## Performance posture

- The hot path is `applyChangesToLexicon` (~40% of step time on a
  tier-3 English run) followed by `inventoryManagement` (~28%).
- Per-step cost scales with `lexicon size × active rules × leaves`.
- Heavy work caches per call (`SORTED_CACHE` for rule priority sort,
  `WeakMap` for closed-class table, `RANDOM_CACHE` for world maps).
- Phase 29 Tranche 6 hoisted `getWorldMap` out of the per-leaf loop
  and skipped the post-`inventoryManagement` `syncWordsAfterPhonology`
  when no merger fired.

Future wins (open):
- Pre-filter rules whose `probabilityFor` returned 0 across many calls.
- Index phoneme presence so "does form contain X?" is O(1).
- Move long playback into the worker so the UI never blocks.

## How features land

A typical engine feature:

1. Add the data field on `Language` (or a sub-type) in `types.ts`.
2. Initialise in `defaults.ts` and any preset that should seed it.
3. Plumb the read/write through the relevant `steps/<X>.ts`.
4. Cover with a focused test in `__tests__/<feature>.test.ts`.
5. Surface a UI affordance in the relevant panel.
6. If the feature changes save format, bump `LATEST_SAVE_VERSION` and
   add a migrator in `persistence/migrate.ts`.

## Known open follow-ups

See the top-level Phase 29 plan for the live list. The most relevant:

- `applyOneRegularChange` per-meaning safety bound is currently a
  fixed cap of 10. Should detect fixed point / cycle instead.
- Three pre-existing test failures (`translator_stress` relative
  clauses, `phase18a` phoneme pruning preference, `ipa_pie` occasional
  vowel-less forms) are tracked and not from Phase 29.
