# Storage step 5 — sub-project S3 (barcode-native addressing) design

**Branch:** `auto/storage-pointnative` · **Date:** 2026-06-08 · **Predecessor:** S2b (process-widening, DONE; GENN re-baked tokipona+english)

## 1. Context & goal

Step 5 retires gloss addressing in stages. **S1** unified the form store under one canonical
`lang.lexemes: Record<LexemeId, {form; point; gloss?}>`. **S2a** re-keyed the 14 per-meaning satellite
maps to `LexemeId` behind the `lexicon/satellites.ts` seam. **S2b** widened the 7 lazily-owned evolution
processes so keyless (gloss-less) words participate. After S2b the *store* and its *satellites* are
LexemeId-keyed, but the engine still **addresses** words by gloss: ~545 production call sites pass a
`Meaning` (gloss) into the `lexicon/access.ts` seam (`lexGet`/`lexSet`/`lexKeys`/…), which resolves
gloss→`LexemeId` internally via `lang.lexemeIds`. The seam was deliberately built so "call sites stay
gloss-agnostic."

**S3 makes `LexemeId` the primary in-engine address.** Every internal call site identifies a word by its
`LexemeId`, not its gloss. The gloss (`Meaning`) survives only as: (a) authoring input at the preset/test
front door, (b) on-demand resolution for display and inherently-string-based semantic operations, (c) the
emergent display label. `lang.lexemeIds` is **demoted** from "primary addressing index" to "boundary
translation table" — it is retained (presets author by gloss; daughters inherit ids by gloss at split;
display needs id→gloss), not deleted.

**User decisions driving this design:**
- **Scope:** *full blanket retirement* — convert all ~545 sites; remove the gloss-in seam API at the end.
- **Determinism:** *byte-identical, defer the order flip to S5* — keep visiting words in gloss-sorted
  order under the hood so output stays byte-for-byte identical; no re-bake in S3.
- **Strategy:** *A — additive seam + adapter-bridged batch migration* (the module-by-module staging the
  migration doc prescribes and the S1/S2a/S2b pattern followed).

**Success criteria.**
1. No internal (non-boundary) production call site passes a gloss into the lexicon seam; all address by
   `LexemeId`. The gloss-in seam functions (`lexGet`/`lexSet`/`lexHas`/`lexDelete`/`lexKeys`/`lexValues`/
   `lexEntries`/`lexSize`) are removed from `access.ts`.
2. Gloss→id (and id→gloss) resolution survives **only** at the blessed boundaries enumerated in §4.
3. Behavior is **byte-identical** across all 6 presets — GEN0 *and* GENN — with **no `meaning_layer_baseline`
   edits**. Any divergence is a bug to fix, not a re-bake.
4. `tsc --noEmit` clean and the FAST suite green at every committed batch.

## 2. Scope

**In scope:** all ~545 production seam occurrences across the lexicon, phonology, morphology, semantics,
genesis, steps, translator, narrative, contact, tree, diagnostics, naming, achievements, persistence, and
UI subsystems, plus the test files that exercise them; the `access.ts` seam itself; and the boundary
resolvers in `lexemeIdentity.ts`.

**Out of scope (later sub-projects):**
- **S4** — point-native `WordSense` identity + `meaningPoints` re-key.
- **S5** — intrinsic `LexemeId` RNG order (the deliberate iteration-order flip + global re-bake). **S3
  preserves gloss-sorted order precisely so S5 owns this.**
- **S6** — translation via anchor index + persistence rework.

**Not touched (remains as-is):** the non-registry per-meaning fields S2a flagged still gloss-addressed
(`rootInventory`, `lexicalSpelling`, `gender`, `nounClassAssignments`, `boundMorphemeOrigin`); the
emergent-gloss/anchor machinery; the RNG draw counts and order.

## 3. Architecture (Approach A — barcode-native seam + adapter-bridged batches)

### 3.1 The barcode-native seam (added to `access.ts`, additive at first)

Primary id-keyed accessors (no minting — minting is a boundary act, §3.2):

| New (id-native)              | Replaces (gloss-in) | Behavior |
|------------------------------|---------------------|----------|
| `lexFormById(lang, id)`      | `lexGet`            | Form for a record id, or `undefined`. |
| `lexSetFormById(lang, id, f)`| (form-update arm of `lexSet`) | Set an **existing** record's form. Never mints. |
| `lexHasById(lang, id)`       | `lexHas`            | Whether a record id exists. |
| `lexDeleteById(lang, id)`    | `lexDelete`         | Delete a record by id. |
| `lexIds(lang)`               | `lexKeys`           | Seeded ids in **insertion order** (positional twin of `lexKeys`). |
| `glossFor(lang, id)`         | (n/a)               | id→**seed** gloss, for display/string ops. `undefined` for keyless. |

Retained / already-present: `orderedLexemeIds(lang)` (ids sorted **by gloss** — the canonical RNG order);
`lexValues`/`lexEntries`/`lexSize` get id-native twins where used (`lexFormsAll`/`lexIdFormPairs`/`lexCount`).
For keyless display the existing `effectiveGlossFor(lang, id)` (evolvable.ts) is used, not `glossFor`.

During migration the gloss-in functions remain as **thin adapters** that resolve via `idForGloss` and
delegate to the id-native body, so nothing breaks. Batch **B10** removes them.

### 3.2 Minting is a boundary act

A *seeded* id is minted only when a new **concept** is lexicalized, and concepts arrive as glosses
(genesis coining for a need). So there is exactly one blessed seeded-coinage entry:

```ts
coinSeededLexeme(lang, gloss: Meaning, form: WordForm): LexemeId
```

(wraps `lexemeIdFor` + record create — the minting arm of today's `lexSet`). Internal evolution code
**never mints** seeded ids; it reads/mutates existing ids, or coins *keyless* words via the existing
`coinKeylessLexeme`. This is what lets every non-boundary site take an `id` that is already known.

### 3.3 Order / determinism discipline (how byte-identity holds)

- `orderedLexemeIds(lang)` keeps resolving order **by gloss (sorted)** — RNG-coupled per-word loops draw
  in the identical per-word sequence → byte-identical.
- `lexIds(lang)` is insertion-order; ids were minted in gloss insertion order, so it is the positional
  twin of today's `lexKeys` → byte-identical for insertion-order-coupled sites.
- No new RNG draws, no reordering, no value reshaping. The satellite seam already accepts ids (S2a). The
  conversion is pure address-substitution.

## 4. Boundary policy (the only places label↔id resolution is allowed)

1. **Preset/birth** — `rekeyLexiconToLexemeIds` (mints ids from gloss at birth). Unchanged.
2. **Seeded coinage** — genesis coining for a need-concept → `coinSeededLexeme`. The single seeded-mint site.
3. **Translator entry** — "translate concept X" resolves gloss→id once, works in ids, resolves gloss for output.
4. **Narrative/discourse entry** — concept selection resolves gloss→id at pick time.
5. **UI** — components hold ids in state; resolve id→label to render and label→id for search/select, at the render edge.
6. **Persistence** — round-trip (gloss already persisted in the record's `gloss`; `lexemeIds` rebuilt on load).
7. **Soft boundaries (string / curated-table ops)** — anything inherently about the gloss *string*
   (`posOf(gloss)`, `SEMANTIC_NEIGHBORS[gloss]`, compound parsing like `"fire+water"`, taboo matching)
   carries the **id** as identity and fetches the gloss via `glossFor` *only* at the point of the string op.
8. **Tests** — author by gloss, resolve via `idForGloss(lang, gloss)` (non-minting) or a small test helper.

`idForGloss(lang, gloss): LexemeId | undefined` is the non-minting boundary resolver (a thin re-export of
the existing `lang.lexemeIds` lookup). Everywhere else: **ids only**.

## 5. Decomposition into batches

**B0 — Foundation (additive, byte-identical):** add the id-native API (§3.1) + `glossFor` + `lexIds` +
`idForGloss` + `coinSeededLexeme`; keep gloss-in adapters. Unit tests for the new API. tsc + FAST +
RUN_SLOW baseline unchanged.

Then module batches, each: *convert the group's sites → id API / boundary resolvers (incl. its test
files), `tsc --noEmit` clean, targeted FAST tests, determinism canary, commit*:

- **B1** `lexicon/` core (lookup, word, mutate, synonyms, taboo, disambiguate, altForms, compound,
  univerbation, reanalysis, nounClass, synthesis, socialContagion, variants, frequencyDynamics)
- **B2** `phonology/` (regular, propose, ot, sandhi, tonogenesis, tone_spread, stratal, orthography,
  phonologization, generated, functionalLoad, pruning; `apply.ts` already uses `orderedLexemeIds`)
- **B3** `morphology/` (evolve, conjugation, ablaut, gender, derivation, analogy, citation,
  inflectionClass, morphemeInventory)
- **B4** `semantics/` (drift, recarve, homonyms, bleaching, lexicostat, grounding, languageMorphemes)
- **B5** `genesis/` + `steps/` (catalog, need, phonotactics, semanticGap, mechanisms/*; steps genesis,
  init, helpers, copula, learner, creolization, inventoryManagement, obsolescence, phonology)
- **B6** `translator/` — boundary-resolve at entry
- **B7** `narrative/` — boundary-resolve at selection
- **B8** `contact/`, `tree/`, `diagnostics/`, `naming`, `achievements`, `persistence`
- **B9** `ui/` — id in component state, label at render/search
- **B10 — Cleanup:** remove the gloss-in adapters from `access.ts` (`lexGet`/`lexSet`/`lexHas`/
  `lexDelete`/`lexKeys`/`lexValues`/`lexEntries`/`lexSize`) and retire `orderedLexiconKeys`
  (gloss-sorted) in favor of `orderedLexemeIds`; make the primary seam id-typed; final full RUN_SLOW
  baseline + docs/memory.

Batch boundaries are by subsystem (files that change together live together); a batch that turns out too
large for one clean review may be split during planning. Each batch is independently green + byte-identical.

## 6. Testing & gates

- **Per batch:** `npx tsc --noEmit` (0 errors) + targeted FAST tests for the touched modules (batched into
  one or two `vitest run --dir src …` invocations) + a determinism canary (reproducibility; for
  RNG-touching batches, a short GENN signature compare vs the pre-batch HEAD).
- **At end (B10):** full FAST suite + RUN_SLOW `meaning_layer_baseline` GEN0 + GENN **byte-identical across
  all 6 presets**. **No baseline edits.**
- **New tests:** only for **B0** (the new seam API) and any genuinely new boundary helper. The conversion
  batches are mechanical address-substitutions covered by existing assertions — no new tests (deliberate).
- **Test authoring rule (from S1):** reads → id helpers; gloss literals resolved via `idForGloss`;
  whole-store access via `lexIds`/`lang.lexemes`.

## 7. Execution & risks

**Execution.** Subagent-driven per the saved preference, but **inline / reconcile-from-worktree**: worktree
subagents on this *local unpushed* branch branch off `origin/auto/realism` and cannot see the committed
foundation (and truncate mid-task), as S2b proved. Foundation (B0) lands first; batches B1–B9 each off the
prior batch's result; B10 last. The full RUN_SLOW baseline is the single end-gate (per-batch uses the fast
canary).

**Risks & mitigations.**
- *Hidden order dependence* (a site relying on `lexKeys` insertion order or `.sort()` of glosses) →
  `lexIds` preserves insertion order, `orderedLexemeIds` preserves sorted-by-gloss; per-batch canary catches divergence.
- *Soft-boundary leakage* (a converted site that still needs the gloss string but forgot to resolve) →
  `glossFor` at point of use; tsc + targeted tests catch missing data.
- *Seed-vs-emergent gloss confusion* → `glossFor` returns the **seed** gloss (stable, byte-identical to
  today's gloss key); keyless display uses `effectiveGlossFor`.
- *Large surface area* → batching + the additive adapter bridge keep every intermediate commit green and byte-identical.

## 8. End state

`lang.lexemes` (LexemeId-keyed) is addressed by `LexemeId` everywhere internally. `access.ts` exposes an
id-native seam only. `lang.lexemeIds` persists as a boundary translation table (gloss→id at the front door,
id→gloss for display). Gloss-sorted RNG order is untouched, leaving S5 to flip it deliberately. This is the
penultimate addressing step: S4 (WordSense/`meaningPoints`), S5 (id RNG order), S6 (translation/persistence)
build on a fully barcode-addressed engine.
