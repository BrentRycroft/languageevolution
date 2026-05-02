# Architecture

This document is for someone landing on the codebase cold and wanting to know how the simulator actually works. It is **not** a feature list — see `README.md` for that.

## Big picture

The simulator is a deterministic generation-stepped model of a phylogenetic language tree. A single proto-language splits into daughters, each of which mutates its phonology, morphology, semantics, and grammar over time. Every per-generation transformation is seeded from a single RNG so the same config + step count always produces the same state.

```
config (presets/) ──► createSimulation ──► state.tree ──► step() ──► step() ──► …
                                              │
                                              ▼
                                          UI panels (src/ui/)
```

## Per-step pipeline

`simulation.ts:step()` documents the canonical order. For each generation:

1. **Splits** of leaves into daughters (`tree/split.ts`) — only on gen 0 + per-leaf via `stepTreeSplit` later in the loop.
2. **For each leaf**:
   1. `stepPhonology` — applies active rules to the lexicon. Runs **before** genesis on purpose: a word coined this generation should not be eroded the same generation it was born.
   2. `stepGenesis` — coins / borrows / derives new words.
   3. `stepGrammar` — drifts grammar features, applies Greenberg-style typological-consistency repair (`grammar/universals.ts`).
   4. `stepMorphology` — paradigm grammaticalization, merge, analogy, suppletion, vowel-mutation irregulars.
   5. `stepSemantics` — drift, recarve (split / merge), bleaching.
   6. `stepContact` — borrowing from neighbors.
   7. `stepArealTypology` — areal pressure recomputation.
   8. `stepTreeSplit` — possibly split this leaf.
   9. `stepDeath` — only if still a leaf (didn't just split). Reads `state.generationsOverCap` and exponentially boosts death pressure when the tree is over `tree.maxLeaves`.
3. `stepArealWaves` — propagate enqueued areal rules.
4. `stepCreolization` — possibly merge two contact-overlapping languages into a creole substrate.
5. Tier transitions — every 20 gens, `applyTierHysteresis` requires sustained eligibility (≥ `TIER_HYSTERESIS_TICKS` consecutive checks) before promoting.
6. Recompute `generationsOverCap` for next gen's death pressure.
7. Reconcile `selectedLangId` — the UI's selected language is invalidated if it went extinct or split during this step.

## Determinism

- `rng.ts` exports `makeRng(seed)` returning a Mulberry32 RNG. Seeds are FNV-1a hashed.
- The RNG state is part of `SimulationState.rngState`. `restoreState()` rewinds to it exactly.
- Every step function takes the RNG and threads it through. **No code path consults `Math.random()` outside `rng.ts`.**

## Subsystems by directory

| Path | Role |
|---|---|
| `engine/phonology/` | Featural alphabet, rule catalog, generated rules, syllable structure, push-chains. |
| `engine/morphology/` | Paradigms, suppletion, gender, cliticization, analogy, vowel mutation. |
| `engine/semantics/` | Drift, recarving (merge / split), bleaching, colexification, neighbor relations. |
| `engine/grammar/` | Word order / case / alignment / classifier / evidential drift; typological universals. |
| `engine/lexicon/` | Concept registry, tier ladder, frequency dynamics, derivation. |
| `engine/genesis/` | Word coinage rules (compound, derivation, interjection, onomatopoeia, …). |
| `engine/contact/` | Borrowing, areal phonology. |
| `engine/geo/` | World map, territory, areal-share affinity. |
| `engine/translator/` | English → target sentence (`sentence.ts`, `parse.ts`, `realise.ts`); target → English caption (`glossToEnglish.ts`); cognate finder. |
| `engine/narrative/` | Discourse-genre narrative composer (target-side: `composer.ts`); legacy skeleton mode (`generate.ts`). |
| `engine/tree/` | Phylogenetic split mechanics + MSA-based proto-form reconstruction. |
| `engine/steps/` | The orchestrator entry points called from `simulation.ts`. |
| `engine/presets/` | Built-in language seeds (PIE, Germanic, Romance, Bantu, Toki Pona, English, …). |
| `engine/utils/` | Cloning, generic helpers. |
| `state/` | Zustand store + history / activity recording. |
| `persistence/` | Save format, autosave, schema migrations, user presets. |
| `ui/` | React app. |
| `share/` | URL-encoded share links. |

## Translator / narrative directions

There are two distinct flows that deserve separate explanation, since they look similar but go opposite ways.

### English → target (Translator panel)

```
user types "the dog sees the cat"
          │
          ▼
parse.ts → English tokens (lemma + POS)
          │
          ▼
realise.ts → TranslatedToken[]: lemma, tag, glossNote, targetForm, targetSurface
          │
          ▼
arrange by lang.grammar.wordOrder; apply paradigms via inflectCascade
          │
          ▼
display target form
```

### Target → English (CompareView narrative)

For myth / legend / daily / dialogue genres, **the target sentence is the source of truth**:

```
genre template (genres.ts, abstract — no English strings)
          │
          ▼
composer.ts composeTargetSentence:
  - pick slot meanings from semantic pools
  - look up lang.lexicon[meaning] for each
  - inflectCascade for verbs (tense + person stacking respecting synthesisIndex)
  - apply gender via paradigm variants where lang has gender
  - arrange by lang.grammar.wordOrder
          │
          ▼
TranslatedToken[] in target order + separate English-canonical-ordered array
          │
          ▼
glossToEnglish on the English-ordered tokens with preserveOrder=true
          │
          ▼
display: target form (top) + derived English caption (bottom)
```

The skeleton genre keeps the legacy English-template flow; only discourse genres use the composer.

## Inflection cascade

`morphology/evolve.ts inflectCascade(base, categories, lang, meaning)`:

- Filters categories with paradigms.
- Applies up to `round(lang.grammar.synthesisIndex)` of them in input order.
- Runs fusion haplology when `lang.grammar.fusionIndex >= 0.7`.
- Returns the form + the list of categories that actually applied (used by composer to populate `glossNote`).

Analytic English (synth=1.0): past + 3sg → only past → `saw`.
Synthetic lang (synth ≥ 2): past + 3sg → both apply.

## State + persistence

- `SimulationState` holds `tree`, `rootId`, `generation`, `rngState`, `pendingArealRules`, `generationsOverCap`.
- The Zustand store (`state/store.ts`) wraps it with UI-facing fields (selectedLangId, selectedMeaning, displayScript, etc.).
- Autosave (`persistence/autosave.ts`) snapshots to `localStorage` with per-language event truncation and schema version stamp.
- `persistence/migrate.ts` defines a per-version migration map (one transform function per old version) so future schema bumps have a clear landing place.
- User presets (`persistence/userPresets.ts`) are independent of the autosave + saved-runs systems.

## RNG flows

Every per-generation random draw is reachable from `step()`:

```
step()
  └─ makeRng(state.rngState) ──► rng
                                   ├─ stepPhonology(lang, config, rng, gen)
                                   ├─ stepGenesis(lang, config, rng, gen)
                                   ├─ stepGrammar(lang, config, rng, gen)
                                   ├─ stepMorphology(lang, config, rng, gen)
                                   ├─ stepSemantics(lang, config, rng, gen)
                                   ├─ stepContact(state, lang, config, rng, gen)
                                   ├─ stepArealTypology(state, lang, rng, gen)
                                   ├─ stepTreeSplit(state, leafId, lang, config, rng)
                                   ├─ stepDeath(state, lang, config, rng, …)
                                   ├─ stepArealWaves(state, gen, rng)
                                   └─ stepCreolization(state, config, rng, gen)
```

After all steps, `state.rngState = rng.state()` is committed.

## How to add a new sound-change family

1. Add a feature-aware template in `phonology/templates.ts`.
2. Register it in `phonology/catalog.ts` with `id`, `family`, default weight.
3. (Optional) wire a push-chain extension in `proposePushChain` (`phonology/propose.ts`) if the change can collide with existing inventory.
4. The change shows up in the rule catalog automatically; presets can include / exclude it via `phonology.enabledChangeIds`.

## How to add a UI tab

1. Add the tab id to `ui/tabs.ts TABS` in display order.
2. Render the panel inside `ui/App.tsx`'s tab-switch block.
3. Number-key shortcuts 1–9 map to the first 9 entries automatically.
4. Tabs ≥ 10 are mouse/touch only — overflow menu is a future PR.

## Testing

- `src/engine/__tests__/` — engine units + integration. ~100 test files.
- `src/ui/__tests__/` — render smoke + behaviour tests. Currently sparse — every tab has at least a render check via `render_every_tab.test.tsx`.
- `src/persistence/__tests__/` — schema migrations + user presets.
- The `rate_calibration.test.ts` long-run test is gated behind `RUN_SLOW=1`.

`npx vitest run` runs the fast suite. `npx tsc --noEmit` is the typecheck.
