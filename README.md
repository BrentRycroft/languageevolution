# languageevolution

Browser-based modular language evolution simulator.

Combines three evolutionary dynamics, any subset toggleable at runtime:

- **Phonological drift** — a curated catalog of sound changes (p→f, k→h/_V,
  intervocalic voicing, final-vowel deletion, nasal place assimilation,
  palatalization, vowel raising, metathesis, …) applied per generation with
  word-contextual probabilities.
- **Agent-based communication** — a grid of agents exchange utterances, adopt
  neighbors' forms, and occasionally innovate. The language's lexicon is the
  population's consensus.
- **Family-tree divergence** — populations split into daughter languages.
  Each daughter deep-copies the parent's lexicon; one gets a perturbation to
  its enabled sound changes so divergence is visible.

Everything is deterministic — a seed string plus generation count reproduces
state byte-for-byte — so saved runs replay exactly.

## Running

```bash
npm install
npm run dev      # opens the simulator at http://localhost:5173
npm test         # vitest
npm run build    # production bundle to dist/
```

## Code layout

```
src/
  engine/          # framework-free TS simulation core
    rng.ts         # Mulberry32 + FNV-1a seed hash
    types.ts
    phonology/     # ipa, catalog of sound changes, apply logic
    agents/        # population + interaction
    tree/          # splitting daughter languages
    lexicon/       # default Swadesh-style seed lexicon
    simulation.ts  # orchestrator
    config.ts
  state/           # Zustand store
  ui/              # React components
  persistence/     # localStorage save/load
```

The engine has zero React imports and could be moved into a Web Worker.

## Using the app

1. Press **Play** — you'll see the lexicon mutate and (after ~15 gens) the
   tree branch into daughter languages.
2. Click any cell in the lexicon table to select a (language, meaning);
   the timeline chart then traces that word's Levenshtein distance from its
   seed form.
3. Toggle individual sound changes on/off, or tune their weights, in the
   **Sound changes** section of the controls panel.
4. Save a run; reload the page; load it back to resume from the same state.
