# G1 — Geometric Meaning Inventory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-curated ~1,800-concept registry with a fully-continuous meaning inventory derived from the baked embedding/corpus data, behind a preserved interface.

**Architecture:** A new `lexicon/conceptRegistry.ts` derivation layer becomes the source of `CONCEPT_IDS` + metadata: meaning set = the filtered GloVe vocabulary; clusters/neighbors/colex from geometry; frequency + tier from a baked corpus-rank table; POS from a baked tagged-corpus table + closed-class overrides. `concepts.ts` becomes a façade. Retire `expanded_concepts.ts` + `basic240` hand data. Guarded by G0's reproducibility + re-baked metric bands + divergence/proto floors.

**Tech Stack:** TypeScript, Vitest. Data under `src/engine/semantics` (embeddings) + `src/engine/lexicon` (registry).

**Reference spec:** `docs/superpowers/specs/2026-06-13-g1-geometric-meaning-inventory-design.md`
**Depends on:** G0 landed (reproducibility gate + metric bands present). **Defer execution to a subagent.**

**Determinism:** per-machine reproducibility must stay green (deterministic derivation). The inventory shift is a deliberate behavioral change → re-bake the G0 metric bands; divergence/proto floors must still pass (a broken floor is a real regression, not an auto-rebake).

---

## Batch A — Baked data inputs (rank + POS)

### Task A1: Corpus-rank table

**Files:** Create `src/engine/semantics/corpusRank.ts`

- [ ] **Step 1:** Obtain the original glove-wiki-gigaword-50 vocabulary in its native **frequency order** (the source the existing `embeddingData.ts` was built from, before it was alphabetized). For every meaning key present in `EMBED_TABLE`/`ANCHOR_EXTRA_TABLE`, record its 0-based frequency rank.
- [ ] **Step 2:** Emit `src/engine/semantics/corpusRank.ts`:

```ts
/** 0-based GloVe corpus frequency rank per meaning (lower = more frequent). Baked
 *  from glove-wiki-gigaword-50's native frequency order. Meanings absent here fall
 *  back to a max rank (treated as rare). */
export const CORPUS_RANK: Readonly<Record<string, number>> = { /* baked */ };
export const MAX_RANK = /* number of ranked entries */ 0;
export function rankOf(meaning: string): number {
  return CORPUS_RANK[meaning] ?? MAX_RANK;
}
```

- [ ] **Step 3:** Sanity-check: `rankOf("the") < rankOf("water") < rankOf("abacus")` (function/core words rank low, rare words high). Commit.

### Task A2: POS table

**Files:** Create `src/engine/lexicon/posTable.ts`

- [ ] **Step 1:** Source a public, redistributable `word → dominant POS` mapping (e.g. WordNet's most-common POS per lemma, or a POS-tagged frequency list) for the embedding vocabulary. Map to the engine's `POS` union (`pos.ts`). Mark proper nouns as `"propn"` (used by the filter to drop them).
- [ ] **Step 2:** Emit `src/engine/lexicon/posTable.ts`:

```ts
import type { POS } from "./pos";
/** Baked dominant POS per meaning, from a public tagged lexicon. Closed-class
 *  function words are overridden in pos.ts (taggers mishandle them). */
export const POS_TABLE: Readonly<Record<string, POS | "propn">> = { /* baked */ };
export function bakedPosOf(meaning: string): POS | "propn" | undefined {
  return POS_TABLE[meaning];
}
```

- [ ] **Step 3:** Sanity-check a sample (`run`→verb/noun, `red`→adjective, `London`→propn). Commit.

---

## Batch B — Derivation layer + façade

### Task B1: `conceptRegistry.ts` — the continuous registry

**Files:** Create `src/engine/lexicon/conceptRegistry.ts`

- [ ] **Step 1:** Implement the derivation, preserving the `concepts.ts` interface. Memoize. Use the existing closed-class sets in `pos.ts` as overrides:

```ts
import type { Meaning } from "../types";
import type { POS } from "./pos";
import { posOf as closedClassPosOf, isClosedClass } from "./pos"; // existing closed-class logic
import { bakedPosOf } from "./posTable";
import { rankOf, MAX_RANK } from "../semantics/corpusRank";
import { EMBED_TABLE } from "../semantics/embeddingData";
import { ANCHOR_EXTRA_TABLE } from "../semantics/anchorExtrasData";
import { fnv1a } from "../rng";

export type Tier = 0 | 1 | 2 | 3;

// POS: closed-class override (precise) → baked open-class → "other".
export function posOf(m: Meaning): POS {
  const cc = closedClassPosOf(m);
  if (isClosedClass(cc)) return cc;            // articles/prep/conj/pronoun… stay precise
  const baked = bakedPosOf(m);
  return baked && baked !== "propn" ? baked : cc; // cc falls back to noun/verb/adj/other heuristic
}

// Meaning set: embedding vocab, filtered (real word-class, not propn).
function deriveConceptIds(): Meaning[] {
  const keys = new Set<Meaning>([...Object.keys(EMBED_TABLE), ...Object.keys(ANCHOR_EXTRA_TABLE)]);
  const out: Meaning[] = [];
  for (const m of keys) {
    if (bakedPosOf(m) === "propn") continue;   // drop proper nouns
    out.push(m);
  }
  return out.sort();
}
export const CONCEPT_IDS: readonly Meaning[] = Object.freeze(deriveConceptIds());
const ID_SET = new Set(CONCEPT_IDS);
export function isRegisteredConcept(m: Meaning): boolean { return ID_SET.has(m); }

// Tier: rank-percentile coreness bands (top decile → 0 … → 3).
const tierCache = new Map<Meaning, Tier>();
export function tierOf(m: Meaning): Tier {
  let t = tierCache.get(m);
  if (t === undefined) {
    const pct = rankOf(m) / Math.max(1, MAX_RANK);
    t = pct < 0.1 ? 0 : pct < 0.35 ? 1 : pct < 0.7 ? 2 : 3;
    tierCache.set(m, t);
  }
  return t;
}
export function conceptsAtOrBelow(tier: Tier): readonly Meaning[] {
  return CONCEPT_IDS.filter((m) => tierOf(m) <= tier);
}

const TIER_BASE_FREQ: Record<Tier, number> = { 0: 0.88, 1: 0.58, 2: 0.36, 3: 0.2 };
export function zipfFrequencyFor(m: Meaning): number {
  const base = TIER_BASE_FREQ[tierOf(m)];
  const jitter = ((fnv1a(m) % 1000) / 1000 - 0.5) * 0.18;
  return Math.max(0.08, Math.min(0.93, base + jitter));
}
```

(Note: `clusterOf`/`neighborsOf`/`colexWith` already live in `semantics/clusters.ts` / `drift.ts` and are geometric — B2 points the façade at them; this module does not duplicate them.)

- [ ] **Step 2:** Run `npx tsc --noEmit` → clean. Commit.

### Task B2: `concepts.ts` becomes a façade

**Files:** Modify `src/engine/lexicon/concepts.ts`

- [ ] **Step 1:** Replace `concepts.ts`'s hand-curation (`buildRegistry`, the `BASIC_240`/`EXPANDED_CONCEPTS` merge) with re-exports from `conceptRegistry.ts`, keeping every public name (`Tier`, `TIER_LABELS`, `FrequencyClass`, `Concept`, `CONCEPTS`, `CONCEPT_IDS`, `conceptFor`, `tierOf`, `zipfFrequencyFor`, `colexWith`, `conceptsAtOrBelow`, `isRegisteredConcept`). Build `CONCEPTS` lazily from the derivation (`{ id, pos: posOf(id), tier: tierOf(id), cluster: clusterOf(id), colexWith: colexWith(id) }`) so the `Concept` shape is preserved for any consumer that reads it.
- [ ] **Step 2:** Run `npx tsc --noEmit` → clean. Run `npx vitest run --dir src concepts` (and any registry unit test) → green. Commit.

---

## Batch C — Consumer migration + retire hand data

### Task C1: Migrate direct-internal users

**Files:** Modify the ~13 files using registry internals (audit: `git grep -nE "BASIC_240|EXPANDED_CONCEPTS|clusterOfBasic240|CONCEPTS\[|\bCLUSTERS\b" -- 'src/engine/**' | grep -v __tests__`).

- [ ] **Step 1:** For each (`genesis/mechanisms/compound.ts`, `genesis/need.ts`, `lexicon/synthesis.ts`, `semantics/anchorLabeled.ts`, `semantics/anchorQueries.ts`, `semantics/clusters.ts`, `semantics/drift.ts`, `steps/genesis.ts`, `translator/abstraction.ts`, `translator/englishWordlist.ts`): replace direct `BASIC_240`/`EXPANDED_CONCEPTS`/`CLUSTERS`/`CONCEPTS[...]` access with the façade API (`CONCEPT_IDS`, `tierOf`, `posOf`, `clusterOf`, `conceptFor`). Run `npx tsc --noEmit` after each file.
- [ ] **Step 2:** Commit per logical group.

### Task C2: Retire hand data

**Files:** Delete `src/engine/lexicon/expanded_concepts.ts`; reduce `basic240.ts`.

- [ ] **Step 1:** `git rm src/engine/lexicon/expanded_concepts.ts`.
- [ ] **Step 2:** In `basic240.ts`, remove `CLUSTERS`/`BASIC_240`/`clusterOfBasic240` (now unused). Keep `generateForm`/`fillMissing` ONLY if `defaults.ts` still uses them; if `defaults.ts`'s `DEFAULT_LEXICON` needs a seed list, give it a small inline `CORE`-only list (no `BASIC_240` dependency).
- [ ] **Step 3:** `git grep -nE "expanded_concepts|BASIC_240|EXPANDED_CONCEPTS|clusterOfBasic240" -- 'src/**'` → no matches. `npx tsc --noEmit` → clean. Commit.

---

## Batch D — Determinism, realism, re-bake

### Task D1: Reproducibility + realism

- [ ] **Step 1:** `RUN_SLOW=1 npx vitest run --dir src reproducibility` → green (derivation is deterministic).
- [ ] **Step 2:** `RUN_SLOW=1 npx vitest run --dir src realism_scorecard` → expect metric-band FAILures (the inventory shift moved metrics). Inspect: are languages still sensible (Swadesh curve decays not collapses; inventory sane; no catastrophe-floor break)? If a `divergence_regression`/`proto_preservation` floor breaks, investigate as a real regression before proceeding.
- [ ] **Step 3:** Re-bake the metric snapshot: re-capture the current metric values (per G0's capture procedure) into `metric_bands.snapshot.ts` with a dated comment ("re-baked: G1 geometric inventory — meaning set now the GloVe vocabulary; frequency/tier from corpus rank"). Re-run → green.

### Task D2: Inventory sanity audit

- [ ] **Step 1:** Add a one-off check (or console dump) listing a random sample of the derived `CONCEPT_IDS` and their `posOf`/`tierOf`; confirm the vocabulary is sensible (content + closed-class, no proper-noun/junk leakage). Tighten the filter if junk appears. Commit any filter fix.

### Task D3: Final gate

- [ ] **Step 1:** `npx tsc --noEmit` clean.
- [ ] **Step 2:** `npx vitest run --dir src` (FAST) green; once `RUN_SLOW=1 npx vitest run --dir src` green.
- [ ] **Step 3:** `git grep` confirms no references to the retired hand-curation remain.

---

## Self-review

**Spec coverage:** meaning set from filtered vocab (B1) ✓; frequency/tier from rank (A1+B1) ✓; POS baked + overrides (A2+B1) ✓; clusters/neighbors geometric (B2 points at existing) ✓; façade preserves interface (B2) ✓; retire hand data (C2) ✓; ripple migration (C1) ✓; reproducibility + re-bake + floors (D1) ✓; vocab sanity (D2) ✓.

**Placeholder scan:** the baked `CORPUS_RANK`/`POS_TABLE` contents are data-sourcing steps (A1/A2), with explicit sourcing + sanity checks — analogous to G0's snapshot capture, not hand-wave placeholders.

**Type/name consistency:** `posOf`/`tierOf`/`zipfFrequencyFor`/`CONCEPT_IDS`/`conceptsAtOrBelow`/`isRegisteredConcept` match the `concepts.ts` exports they replace; `rankOf`/`MAX_RANK` (corpusRank), `bakedPosOf`/`POS_TABLE` (posTable) consistent across tasks.

**Risk note:** the corpus-rank re-baking (A1) is the critical-path dependency (the existing data lost frequency order); if the original GloVe frequency order can't be sourced, fall back to a frequency-list proxy and flag it.
