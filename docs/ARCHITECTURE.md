# Architecture

A high-level map of the language-evolution simulator. For build / run
instructions and feature surface, see the top-level `README.md`. For
contributor onboarding, see `docs/CONTRIBUTING.md`.

> **Two architecture docs.** This file is the **layered-structure +
> data-model + conventions** view. The top-level `ARCHITECTURE.md` is the
> **subsystem map + data-flow** view (per-directory roles, the module
> system, translator/narrative flows). They cross-reference each other.

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

Every generation, `simulation.step()` first runs Historical Mode
(`stepHistorical`, a no-op unless `config.historical.scheduleId` is set),
then runs each leaf language through the pipeline in this fixed order. Most
steps are gated by a flag in `SimulationConfig.modes`:

```
(per leaf preamble: speaker drift → territory tick → tier hysteresis)
volatility → phonology → learner → inventoryManagement → phonotacticDrift
→ obsolescence → copula{Erosion,Genesis} → taboo → genesis
→ grammar → morphology → semantics → [active module step() hooks]
→ contact → arealTypology → treeSplit → death
```

The `[active module step() hooks]` run every module in `lang.activeModules`
in `requires`-topological order (see "Module system" below) — this is where
Phases 41+ behaviour lives, alongside the legacy `steps/*` calls.

Then post-loop, regardless of leaf:

```
arealWaves → creolization → reticulate (refresh contact links)
→ reabsorbExtinctTerritory
```

The canonical, fully-commented ordering lives in `simulation.ts step()`;
the root `ARCHITECTURE.md` has the per-subsystem map and the translator /
narrative flows.

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
- **semantics / discourse**: `registerOf`, `colexifiedAs`, `variants`,
  `meaningHistory`
- **concept identity (Phase 72)**: `conceptIds` (meaning → stable id),
  `conceptIdSeq` (per-language mint counter), `perWordDiffusion`
- **sociolinguistic (Phase 72)**: `endangermentLevel`, `prestigeVariety`,
  `bilingualLinks`, `contactLinks`
- **modules (Phase 41+)**: `activeModules` (`Set<string>`), `moduleState`
- **historical**: `historicalRole`, `grammaticalisationCascade`
- **state / metadata**: `events`, `extinct`, `culturalTier`, `speakers`,
  `coords`, `territory`, `volatilityPhase`, `localNeighbors`

Most fields are `?:` optional with a sensible default at the read site;
this keeps migration painless when new features land. The `defaults.ts`
factory is the canonical place to construct fresh languages.

`Language` is a large god-object. Two helpers tame it:

- **`domains.ts`** defines typed `Pick<Language, …>` slices —
  `LexiconState`, `PhonologyState`, `MorphologyState`, `GrammarState`,
  `SocialState`, `GeoState`, `ContactState`, `HistoricalRoleState`,
  `ModuleHostState` — so a function can declare exactly which slice it
  touches instead of the whole object. This is the seam for an eventual
  decomposition.
- **`perMeaningFields.ts`** is the registry of per-meaning `Record<Meaning,
  X>` fields with declared lifecycle handlers (how to inherit at tree-split,
  whether to purge on `deleteMeaning`). Adding a per-meaning field means
  registering it here rather than hand-editing `tree/split.ts` and
  `mutate.ts:deleteMeaning`.

## Module system

Phases 41+ moved typological behaviour into self-registering **modules**
under `engine/modules/{grammatical,syntactical,morphological,semantic}/`
(the largest subsystem, 54 files). Each `SimulationModule`
(`modules/types.ts`) declares `id`, `kind`, optional `requires`,
`initState`, `step`, and optional `serialise`/`deserialise`. They register
at boot (`import "./modules"` → `modules/registry.ts`, a global singleton);
a language activates a subset (`activeModules`) and the step loop runs the
active ones in `requires`-topological order, skipping the rest. See the
root `ARCHITECTURE.md` "Module system" for the full lifecycle.

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

~235 test files, split into two tiers because the test bodies run real
simulations (the heavy ones step a growing tree for hundreds of
generations):

- **Fast / default — `npm test`** (`RUN_SLOW` unset). The PR feedback loop.
  `vite.config.ts` excludes the heavyweight files (property tests,
  multi-hundred-generation smokes, divergence/calibration probes); some
  files gate only their heavy cases with `it.skipIf(!RUN_SLOW)`.
- **Full / nightly — `RUN_SLOW=1 npx vitest run`** (= `npm run test:slow`):
  the entire surface, including the gated tier.

CI: `.github/workflows/pr.yml` runs the fast tier + `npm run build` on every
PR; `.github/workflows/nightly.yml` runs the full `RUN_SLOW` suite sharded
×4 on a daily cron (the comprehensive gate — without it the gated tier runs
nowhere and rots).

- Property tests via `fast-check` cover invariants that should hold under
  arbitrary random input (e.g. `__tests__/phase_29_invariants.test.ts`).
- Each major engine subsystem has a focused test file.
- Statistical-property tests (e.g. `frequency_direction`) pool across
  multiple seeds in the nightly tier so single-trajectory noise can't flip
  a tight margin.
- Most engine tests use the `node` vitest environment; `vite.config.ts`
  `environmentMatchGlobs` switches UI + persistence tests to `jsdom`.
- UI tests are mostly shallow renders (`src/ui/__tests__/`).

## Performance posture

- The dominant hot path is `phonology/apply.ts applyChangesToLexicon`
  (~65–80% of step time per its own header), with `inventoryManagement`
  next. Profile with `PROFILE_STEP=1` (per-substep wall time) before
  optimising.
- Per-step cost scales with `lexicon size × active rules × leaves × active
  modules`. In tests this dominated runtime — see the two-tier split above.
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
3. Plumb the read/write through the relevant `steps/<X>.ts`, or — for
   typological behaviour — add/extend a module under `engine/modules/`
   and activate it (see "Module system").
4. Cover with a focused test in `__tests__/<feature>.test.ts`. Put cheap,
   deterministic tests in the default tier; multi-hundred-generation or
   statistical tests behind `RUN_SLOW` (the `vite.config.ts` exclude list).
5. Surface a UI affordance in the relevant panel.
6. If the feature changes save format, bump `LATEST_SAVE_VERSION` and
   add a migrator in `persistence/migrate.ts`.

## Known open follow-ups

The live regression signal is the nightly `RUN_SLOW` suite — treat its
failures as the current list rather than any hand-maintained note here
(which drifts). Standing items:

- `applyOneRegularChange` per-meaning safety bound is a fixed cap of 10;
  should detect fixed point / cycle instead.
- The `Language` god-object decomposition: `domains.ts` slices are the seam,
  but most code still takes the whole `Language`.
- Performance: the `apply.ts` hot path and the long tail of
  simulation-heavy tests both have headroom (the latter is why most
  integration tests are gated to the nightly tier).
