# G1 — Geometric Meaning Inventory — Design

**Date:** 2026-06-13
**Sub-project:** G1 of the geometry-native program ([roadmap](2026-06-13-geometry-native-program-roadmap.md))
**Depends on:** G0 (determinism model migration — per-machine reproducibility + metric bands)
**Branch:** `auto/storage-pointnative` (`8307a08`, pushed to origin)
**Status:** Approved (brainstorming complete)

## Goal

Stop hand-maintaining the ~1,800-concept meaning inventory (`concepts.ts` assembling
`basic240.ts` + the 1,765 `expanded_concepts.ts` entries) and make the meaning space **fully
continuous** — derived from the baked embedding/corpus data, with the consumer interface
preserved so the ~38 consumers keep working while the *source* flips from hand-curation to
geometry/corpus.

## Background — what exists

- **Geometry already exists:** `semantics/embeddingData.ts` (368KB) is a baked
  glove-wiki-gigaword-50 table (int8-quantized, 50-dim) mapping `meaning → vector` for **~2,244**
  meanings; `anchorExtrasData.ts` adds 179 anchors. `embed()` = `EMBED_TABLE[m] ??
  ANCHOR_EXTRA_TABLE[m] ?? hash-fallback`; `hasEmbedding(m)` distinguishes real vs fallback.
- **Relations already geometric:** `clusterOf → clusterRegionOf` (nearest centroid),
  `neighborsOf → geometricNeighbors`, `idForConcept` (geometric translator resolution).
- **Still hand-curated (the target of G1):** the concept *list* itself (`CONCEPT_IDS`), `posOf`
  (word-set lookups in `pos.ts`), `tierOf` (cultural-era tier in `expanded_concepts.ts`/
  `basic240.ts`, driving `zipfFrequencyFor` + `conceptsAtOrBelow`).
- **~38 non-test consumers** import the registry API (`CONCEPT_IDS`, `tierOf`, `posOf`,
  `clusterOf`, `colexWith`, `frequencyFor`, `isRegisteredConcept`, `conceptsAtOrBelow`, …).

## Decisions (from brainstorming)

1. **Fully continuous (no hand-curated list).** The meaning set *is* the embedding/corpus
   vocabulary; metadata is derived, not hand-assigned. (The embedding table is a stable
   enumerable vocabulary, so "no list" still yields a deterministic, enumerable set.)
2. **POS comes from a baked tagged-corpus table** (not geometry — 50-dim GloVe can't give POS),
   with small closed-class override sets retained.
3. **Frequency/tier from corpus rank.** The GloVe vocabulary is frequency-ordered; frequency =
   Zipfian-over-rank; tier = rank-percentile coreness bands (preserving the 0–3 interface).
4. **Interface preserved**, metadata **memoized** for performance.

## Architecture — a derivation layer over baked data

A new `lexicon/conceptRegistry.ts` becomes the single source of the meaning inventory, backed by
three baked/derived inputs and exporting the existing interface unchanged:

| Interface (unchanged) | New source |
|---|---|
| `CONCEPT_IDS` | `sort(keys(EMBED_TABLE ∪ ANCHOR_EXTRA_TABLE))` filtered (keep real word-class POS; drop proper-nouns / no-embedding junk) |
| `clusterOf` / `neighborsOf` / `colexWith` | geometry (`clusterRegionOf` / `geometricNeighbors`) — read the new vocab |
| `frequencyFor` / `zipfFrequencyFor` | Zipfian over **GloVe corpus rank** |
| `tierOf` / `conceptsAtOrBelow` | rank-percentile coreness bands (top decile → tier 0, … → tier 3) |
| `posOf` | baked `posTable.ts` (`meaning → POS`, dominant POS from a public tagged lexicon) + retained closed-class override sets |
| `isRegisteredConcept` | `meaning ∈` derived `CONCEPT_IDS` |

### New / changed modules

- **Create** `lexicon/conceptRegistry.ts` — the derivation layer (exports the full interface,
  memoized).
- **Create** `lexicon/posTable.ts` — baked `meaning → POS` from a public tagged lexicon
  (e.g. WordNet primary POS / a POS-tagged frequency list).
- **`semantics/embeddingData.ts`** — verify the vocabulary preserves frequency order; if not,
  bake a parallel `corpusRank` table (or add rank to each entry).
- **`lexicon/concepts.ts`** — becomes a thin façade re-exporting `conceptRegistry.ts` (keeps the
  import path stable for consumers).
- **Retire** `lexicon/expanded_concepts.ts` and `basic240.ts`'s `CLUSTERS` / `BASIC_240` /
  `EXPANDED_CONCEPTS` hand data. Keep a minimal seed for `defaults.ts`'s `DEFAULT_LEXICON` (or
  migrate `defaults.ts` to the new registry). `generateForm`/`fillMissing` are retained only if
  still used by `defaults.ts`.

### Derivation rules

- **Vocabulary filter:** keep an embedding key iff it has a POS tag of a real word class
  (open-class noun/verb/adj/adv or a closed-class function word); drop proper nouns
  (`POS = propn`) and entries with only a hash-fallback embedding. Rule-based, no hand list.
- **Closed-class overrides:** the small finite function-word sets (articles, prepositions,
  conjunctions, complementisers, pronouns, negators, auxiliaries) are retained as POS overrides
  layered over the baked table — they are legitimately a finite linguistic list and taggers
  mishandle them.
- **Tier bands:** map a meaning's corpus-rank percentile to tier 0–3; `conceptsAtOrBelow(t)`
  filters by the derived tier. Replaces cultural-era hand-assignment with a frequency-coreness
  proxy.

## Ripple / migration

- Consumers using the **interface** (`CONCEPT_IDS`/`tierOf`/`posOf`/`clusterOf`/`colexWith`/
  `frequencyFor`) are untouched (the façade preserves them).
- The plan **audits direct-internal users** — `git grep` for `CONCEPTS[`, `CLUSTERS`,
  `BASIC_240`, `EXPANDED_CONCEPTS`, `clusterOfBasic240` — and migrates each to the façade.
- Expected behavioral change: the inventory grows (~1,800 → ~2,244) and its composition shifts
  to GloVe's vocabulary; ~0.1% hash-fallback concepts leave the inventory. Frequency, tier, and
  POS all move, shifting drift/coinage/genesis.

## Determinism & realism guarding

- **Reproducibility (G0) must stay green** — the derivation is deterministic (same config →
  identical output run-to-run).
- The inventory shift moves the scorecard metrics, so the **metric snapshot is re-baked
  deliberately** (G0's tolerant bands; dated note).
- `divergence_regression` / `proto_preservation` floors and the scorecard catastrophe floors
  must still pass. A **broken floor signals a real regression to investigate**, not an
  auto-rebake — the new inventory must still produce sensible, typologically-real languages.

## Testing

- **Unit:** `conceptRegistry` derivation — `CONCEPT_IDS` from the filtered vocab; `tierOf` from
  rank bands; `posOf` from the baked table + overrides; the filter rules (proper-noun drop,
  hash-fallback drop); memoization correctness.
- **Integration:** reproducibility gate green; scorecard green-to-report (with re-baked bands);
  `divergence_regression` / `proto_preservation` pass.
- **Re-bake** the G0 metric bands as the deliberate, documented baseline shift.

## Risks

- **POS-table sourcing/licensing** — need a public, redistributable tagged lexicon; bake it.
- **Frequency-rank availability** — confirm `embeddingData.ts` preserves order, else re-bake with
  rank.
- **Vocab composition** — GloVe may include unsuitable entries; the filter must be good (audit a
  sample of the resulting `CONCEPT_IDS`).
- **Large ripple** — the ~38 consumers; careful audit + interface preservation mitigate.
- This is the program's **riskiest** sub-project; its implementation plan will be **batched**
  (data/rank/POS → derivation layer + façade → consumer migration → re-bake + realism check).

## Out of scope

- Translator/narrative geometric resolution end-to-end (that is G2).
- Synonymy/register (G4), GPU (G7).

## Success criteria

1. The meaning inventory is derived from the embedding/corpus data; `concepts.ts`/
   `basic240.ts`/`expanded_concepts.ts` hand-curation is retired (façade preserved).
2. `posOf` is backed by a baked table + closed-class overrides; `tierOf`/`frequencyFor` by
   corpus rank; `clusterOf`/`neighborsOf` by geometry.
3. All ~38 consumers compile and run against the preserved interface.
4. Reproducibility green; scorecard sensible (re-baked bands); divergence/proto floors pass.
