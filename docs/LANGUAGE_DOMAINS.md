# Language Domain Decomposition

## Status

**Roadmap, not implementation.** This document is the structural target
for breaking up `src/engine/types.ts:Language` (the "god-object" the
audit flagged in Theme A and S9). Phase 72g T5 ships this map without
performing the actual decomposition.

**Why deferred?** Decomposing `Language` is a multi-week refactor with
broad blast radius:

- Every import of `Language` (~120 files) needs to be updated.
- Snapshot/serialization tests need re-tuning.
- The save format (`SavedRun.version: 9`) requires v10 with a migration.
- Step orchestrators (simulation.ts, every step file) need to thread
  the decomposed objects.

The audit explicitly noted (`/root/.claude/plans/i-want-to-make-modular-quill.md`
line 1086): *"This is a major rewrite — should not be undertaken
without explicit user direction."* Phase 72g T1-T4 ships the items
that DON'T require this decomposition; T5 documents what would.

## Decomposition target

The current `Language` interface clusters fields from at least four
distinct domains. Splitting them produces:

```ts
interface Language {
  id: string;
  name: string;
  birthGeneration: number;
  extinct?: boolean;
  deathGeneration?: number;

  phonology: PhonologyState;
  morphology: MorphologyState;
  lexicon: LexiconState;
  grammar: GrammarState;
  social: SocialState;
  geography: GeoState;
  contact: ContactState;
}
```

### PhonologyState

Reads + writes through the phonology pipeline. Already partially
encapsulated in `phonology/`.

```ts
interface PhonologyState {
  inventory: PhonemeInventory;
  syllableShape: SyllableShape;
  stressPattern?: StressPattern;
  toneSystem?: ToneSystem;
  activeRules: SoundChangeRule[];
  retiredRules: SoundChangeRule[];
  diffusionState: Record<string, { actuatedAt: number }>;
  perWordDiffusion?: Record<string, Record<string, number>>;
  categoryMomentum?: Record<string, { boost: number; until: number }>;
  ruleBias: Record<string, number>;
  changeWeights: Record<string, number>;
  enabledChangeIds: string[];
  otRanking: OTConstraint[];
  // Phase 72g T1
  lexiconUR?: Record<string, WordForm>;
  // Volatility currently lives at top level
  volatilityIntensity?: number;
  volatilityPhase?: VolatilityPhase;
}
```

### MorphologyState

```ts
interface MorphologyState {
  paradigms: Record<MorphCategory, Paradigm>;
  inflectionClass?: Record<Meaning, number>;
  nounDeclensionClass?: Record<Meaning, NounDeclensionClass>;
  ablautClassAssignment?: Record<Meaning, number>;
  grammaticalizationStage?: Record<Meaning, GrammaticalizationStage>;
  derivationalSuffixes?: DerivationalSuffix[];
  suppletion?: Record<Meaning, Record<MorphCategory, WordForm>>;
}
```

### LexiconState

```ts
interface LexiconState {
  primary: Record<Meaning, WordForm>;
  words: Word[];
  wordsByFormKey: Map<string, Word>;
  wordFrequencyHints: Record<Meaning, number>;
  wordOrigin: Record<Meaning, string>;
  wordOriginChain: Record<Meaning, string[]>;
  variants: Record<Meaning, WordForm[]>;
  altForms: Record<Meaning, WordForm[]>;
  altRegister: Record<Meaning, ("high" | "low" | "neutral")[]>;
  colexifiedAs: Record<Meaning, Meaning[]>;
  registerOf?: Record<Meaning, "high" | "low">;
  meaningHistory?: Record<string, MergerPathway>;
  borrowHistory?: Record<Meaning, BorrowEvent[]>;
  compounds?: Record<Meaning, Compound>;
  lastChangeGeneration: Record<Meaning, number>;
}
```

### GrammarState

The existing `grammar: GrammarFeatures` already encapsulates this. Add
the per-feature lock fields currently scattered:

```ts
interface GrammarState extends GrammarFeatures {
  wordOrderLastFlipGen?: number;
  // Future: per-feature lockUntilGen for the audit's recommended
  // "lock alignment / hasCase until generation X" mechanism.
}
```

### SocialState (NEW; Phase 72f mostly populates this)

```ts
interface SocialState {
  speakers?: number;
  conservatism: number;
  literaryStability?: number;
  culturalTier?: 0 | 1 | 2 | 3;
  endangermentLevel?: "vigorous" | "endangered" | "moribund" | "extinct";
  endangermentLastTransitionGen?: number;
  prestigeVariety?: boolean;
  prestigeVarietySinceGen?: number;
}
```

### GeoState (already partially extracted)

```ts
interface GeoState {
  coords?: { x: number; y: number };
  territory?: { cells: number[] };
  isolationDistance?: number;
}
```

### ContactState

```ts
interface ContactState {
  bilingualLinks?: Record<string, number>;
  recentLoanGens?: number[];
  substrateAccelerationRemaining?: number;
}
```

## Migration plan (when undertaken)

1. **Phase 1** (1 week): introduce the new interfaces alongside `Language`,
   with `Language extends PhonologyState, ..., ContactState` as a union
   type — back-compat for every read site.
2. **Phase 2** (2 weeks): convert WRITE sites (≈ 200 across the codebase)
   to address the specific sub-state. Type system enforces correctness.
3. **Phase 3** (1 week): convert READ sites. Use IDE refactoring; check
   each pattern. Run full regression sweep.
4. **Phase 4** (~1 week): persistence layer. `SavedRun.version: 10` bump
   with explicit per-domain serialization.
5. **Phase 5** (½ week): docs sweep. Update `ARCHITECTURE.md`,
   `CLAUDE.md`, `CHANGELOG.md`.

Estimated: 5-6 weeks of focused work. Best done in a dedicated session
with no concurrent feature work; should be its own multi-commit phase.

## Why this is the target

- **Type safety**: cross-domain reads (e.g., morphology reading
  `lang.lexicon` directly to find verb forms) are currently free; after
  decomposition, they're explicit at the type level.
- **Test isolation**: tests can construct minimal sub-states instead of
  full Language objects.
- **Documentation**: each domain interface IS its API surface. New fields
  go to the right place by force.
- **Refactor safety**: future audit-driven changes touch one domain at a
  time, not the god-object.

## Anti-pattern: don't do incrementally

A common temptation is "let's split out one domain at a time." Don't.
Half-decomposed Language is worse than the current monolith because
every read site has to know which fields were extracted vs. left in
the parent. Either commit to the full sweep or stay with the current
shape.
