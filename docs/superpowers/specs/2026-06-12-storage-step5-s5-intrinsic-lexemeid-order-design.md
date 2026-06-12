# Storage step 5 — sub-project S5: intrinsic LexemeId RNG order

**Branch:** `auto/storage-pointnative` (local commits only; do NOT push/PR).
**Status:** design approved 2026-06-12; ready for implementation plan.
**Predecessors:** S1 (store unification) · S2a (satellite re-key) · S2b (process-widening) · S3 (barcode-native addressing) · S4 (point-native WordSense + meaningPoints re-key) — all DONE, all byte-identical.
**Successor:** S6 (translation via anchor index + persistence) — the last sub-project.

## 0. Context — the deferred iteration-order flip

Through S4 the engine became LexemeId-native end to end while staying **byte-identical** to the original baseline: the per-word RNG draw order was deliberately kept **gloss-sorted** (`orderedLexemeIds` sorts seeded ids by their English gloss) so the trajectory never moved. S5 performs the flip that S3 and S4 deferred: make the canonical RNG-draw order **intrinsic to the LexemeId**, not the gloss — so the simulation trajectory no longer depends on the English label of each concept. It is the first sub-project whose *purpose* is to change the trajectory: earlier sub-projects stayed byte-identical except for incidental keyless-coinage re-bakes (S1-T4 tokipona; S2b tokipona+english), whereas S5 re-bakes **all 6 presets by design**.

### Approved decisions (this session)

- **Intrinsic order = lexicographic by LexemeId string** (`Object.keys(lexicon).sort()`). Chosen over mint/insertion order and over a seeded-then-keyless hybrid. It matches the order the sweep already uses when `lang` is undefined ([apply.ts:908](../../../src/engine/phonology/apply.ts#L908)) and how keyless ids are already ordered, drops gloss resolution from the hot sweep path, and is recoverable from the ids themselves (robust to store rebuilds).
- **Determinism:** GEN0 byte-identical is mandatory (the order only matters once the per-step sweep runs); GENN re-bakes for all 6 presets; reproducibility (same config → identical output) is required and verified by two independent full runs; only the vs-old-baseline identity is intentionally broken.

## 1. The flip

`orderedLexemeIds` in [lexemeIdentity.ts](../../../src/engine/lexicon/lexemeIdentity.ts) becomes a one-liner:

```ts
export function orderedLexemeIds(lexicon: Record<string, unknown>): LexemeId[] {
  return (Object.keys(lexicon) as LexemeId[]).sort();
}
```

It drops the `lang` parameter, the gloss-sort, the seeded/keyless split, and the `buildLexemeIdToGloss` call. The result is the canonical RNG-draw order, now **lexicographic by LexemeId** — gloss-independent.

**Why this propagates to the whole trajectory:** the phonology sweep iterates `orderedLexemeIds` and returns its output store keyed in that order; `mergeFormsIntoStore` then rebuilds `lang.lexemes` in that key order every step. So after the first sweep the store's key order — and therefore `lexIds` (insertion order, walked by ~30 RNG-coupled sites) — follows the new intrinsic order. Flipping the single sort thus re-orders every downstream per-word RNG draw. That is the intended deliberate flip.

The per-word sound-change sub-rng is seeded from each word's own LexemeId ([apply.ts:912-918](../../../src/engine/phonology/apply.ts#L912)), so it is already iteration-order-independent and unchanged; the trajectory shift comes from the main shared-rng draw sequence reordering and the store-key reorder propagating to `lexIds` sites.

## 2. Consumers, comments, the order test

Three direct call sites; each re-bakes gracefully (identical *set* of ids, new order — no structural break):

- **[apply.ts:906-908](../../../src/engine/phonology/apply.ts#L906)** — the `lang ? orderedLexemeIds(lexicon, lang) : Object.keys(lexicon).sort()` ternary collapses to `orderedLexemeIds(lexicon)` (both branches are now identical).
- **[naming.ts:21-27](../../../src/engine/naming.ts#L21)** — drop the `lang` arg (`orderedLexemeIds(parent.lexemes)`); keep the keyless filter (`meaningForLexemeId(...) !== undefined`); the `rng.int(ids.length)` bound is unchanged (seeded count), but the picked word changes → the generated language name re-bakes. Update the "gloss-sorted, byte-identical to orderedLexiconKeys" comment to describe the id-sorted order.
- **[reverse.ts:99-101](../../../src/engine/translator/reverse.ts#L99)** — drop the `lang` arg; update the "GLOSS-SORTED … byte-identical" comment. This is the `else` branch (only when the `words` table is absent — rarely hit in the live sim, but kept correct).

Test:
- **[concept_order_seam.test.ts](../../../src/engine/__tests__/concept_order_seam.test.ts)** — currently locks the OLD contract (`orderedLexemeIds(...)` resolved to glosses equals the sorted glosses). Rewrite to lock the NEW contract: `orderedLexemeIds(lang.lexemes)` equals `Object.keys(lang.lexemes).sort()`, across all 6 presets. Drop the now-unused `meaningForLexemeId` / `tGlosses` imports. No other test references `orderedLexemeIds`.

## 3. Determinism & re-bake protocol

- **GEN0 byte-identical — mandatory guard.** The order only affects the per-step sweep; gen-0 seed forms are untouched. The GEN0 hashes for all 6 presets must NOT change. If any GEN0 hash moves, that is a bug (the flip leaked into seed state), not a re-bake — stop and fix.
- **GENN re-bakes for all 6 presets.** The reorder reaches every preset's sweep and every downstream `lexIds` draw, so all 6 GENN hashes shift. Expected and authorized.
- **Reproducibility required.** Run the full RUN_SLOW baseline twice; the new GENN hashes must be identical across both runs before they are locked.
- **The re-bake:** capture the new GENN hashes, verify GEN0 unchanged, update only the 6 GENN entries in `meaning_layer_baseline.test.ts`, re-run → 12/12 green.

## 4. Decomposition

Two commits; every commit green.

- **Batch 1 — flip + re-bake (one commit).** Apply the `orderedLexemeIds` change + the 3 consumer/comment updates + the `concept_order_seam` test rewrite. Gate: tsc 0 + targeted tests green (`concept_order_seam`, `naming`, `reverse`, plus a sweep-adjacent run); then full RUN_SLOW baseline → confirm GEN0 unchanged, capture new GENN hashes, run a second time for reproducibility, update the 6 GENN hashes, re-run → 12/12 green. Commit code + updated hashes together (so the commit is green — the code change alone would leave GENN red).
- **Batch 2 — verification + ledger.** Full FAST suite (the polluting worktrees were pruned 2026-06-12, so it is clean now) + ledger update (`docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md`: add S5-DONE, change "Sub-projects 5-6 REMAIN" → "Sub-project 6 REMAINS / S6 NEXT") + memory. Commit docs.

## 5. Out of scope (deferred)

- **S6** — translation via anchor index + persistence end-state (the final sub-project).
- No change to `lexIds`, the satellite seams, or `meaningPoints`; those re-order automatically via the store rebuild and need no code change.
