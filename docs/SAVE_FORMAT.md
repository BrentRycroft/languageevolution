# Save Format Reference

`SavedRun.version: 9` (current, May 2026).

Saves are produced by the persistence layer (`src/persistence/`) and consumed
by `migrateSavedRun` in `migrate.ts`. The format is a flat JSON-serialisable
object; load-time migration walks the version history and applies transforms.

## Top-level shape

```ts
interface SavedRun {
  version: 9;
  id: string;
  label: string;
  createdAt: number;            // unix-ms timestamp
  config: SimulationConfig;     // see types.ts for full shape
  generationsRun: number;       // current state.generation
  stateSnapshot?: SimulationState;  // full state tree (large but optional)
}
```

When `stateSnapshot` is absent, the run is replayable from the seeded
`config` (deterministic via Mulberry32 RNG seeded by `config.seed`). When
present, restoration is O(1).

## Per-meaning fields (Phase 72d registry)

The simulator's `Language` type carries many per-meaning records. Phase 72d
introduced `src/engine/perMeaningFields.ts` as a central registry. Adding
a new per-meaning field requires registering it; the registry then handles:

- Inheritance at tree-split (deep-clone-entries vs shallow-clone vs skip).
- Purge on `deleteMeaning(lang, meaning)`.

When introducing a schema-version-bumping change for a new field, the
migration is automatic via the registry — no per-field migration code
needs to be written.

## Migration history

| From | To | Transform | Notes |
|---|---|---|---|
| 1 | 2 | identity | (no-op) |
| 2 | 3 | identity | (no-op) |
| 3 | 4 | identity | (no-op) |
| 4 | 5 | identity | (no-op) |
| 5 | 6 | rebuild `lang.words` from `lexicon` | Phase 21 |
| 6 | 7 | rename `speakerCount` → `speakers` | Phase 29 |
| 7 | 8 | (no-op marker) | |
| 8 | 9 | add `seedActiveModules` + `moduleState` | Phase 41 |

## Future migrations

Phase 70 added `state.firedHistoricalMilestones`,
`state.historicalEvents`, `state.historicalMilestonesSkipped`. These are
all OPTIONAL fields. A v9 save written before Phase 70 has them
undefined; the runner initialises them lazily on first `stepHistorical`
call. **No migration needed**.

Phase 72d added `lang.meaningHistory` (optional). Pre-72d v9 saves have
this undefined; the runner initialises lazily on first `deleteMeaning`
call with options. **No migration needed**.

## Backwards compatibility policy

- New OPTIONAL fields can be added without bumping the version.
- New REQUIRED fields require a version bump and a migration.
- Renaming a field requires a version bump and a migration.
- Removing a field requires a version bump; the migration drops it.

Schema version bumps update `CURRENT_VERSION` in `migrate.ts` and add
an entry to the migration table above.

## Stress-test invariants

(Per Phase 72e stress tests.)

- Per-language `events: LanguageEvent[]` capped at 80 entries.
- `state.historicalEvents` capped at 200 entries.
- `state.tree[id].language` and `state.tree[id].parentId/childrenIds`
  are mutually consistent (every parentId links to a real node;
  every childrenIds entry has its parentId pointing back).
- Tree depth ≤ 10 in 200-gen runs (Romance + Historical Mode).

## RNG state

`SimulationState.rngState` is a single 32-bit integer (Mulberry32). It
is included in `stateSnapshot` and preserved across save/load. A v9
save without snapshot replays the RNG sequence from `config.seed`.
