# Storage step 5 — sub-project S4: point-native WordSense identity + `meaningPoints` re-key

**Branch:** `auto/storage-pointnative` (local commits only; do NOT push/PR).
**Status:** design approved 2026-06-11; ready for implementation plan.
**Predecessors:** S1 (store unification) · S2a (satellite re-key) · S2b (process-widening) · S3 (barcode-native addressing) — all DONE.
**Successors:** S5 (intrinsic LexemeId RNG order — the deliberate iteration-order flip) · S6 (translation via anchor index + persistence).

## 0. Context — where S4 sits

After S3 the engine addresses lexemes by `LexemeId` everywhere and the gloss-in accessor API is retired. Two gloss-keyed things remain in the storage layer that S4 finishes:

1. **`lang.meaningPoints: Record<Meaning, number[]>`** — the *live* drifted-position override, written only by `glideMeaningPoint` and read only by `meaningPointFor`. It is structurally the **15th per-meaning satellite map; S2a deliberately deferred re-keying it to S4.**
2. **`WordSense`** (on `lang.words[].senses[]`) identifies itself purely by its `.meaning` gloss and carries no link to the canonical `lang.lexemes` store. Its `point`/`spread` fields are **vestigial in production** (never written by the engine; `syncWordsFromLexicon` creates senses with no point — [word.ts:713](../../../src/engine/lexicon/word.ts#L713)), so `sensePoint`/`effectiveGloss` are frozen at the static birth point and the anchor index never reflects drift.

S4 re-keys `meaningPoints` to `LexemeId` and makes a `WordSense` point-native: identified by its lexeme, reading its *current* (drifted) point so the anchor index / dictionary finally track drift.

### Approved decisions (this session)

- **Scope:** *id link + unify drift* (the most ambitious WordSense option) — add a `lexemeId` to `WordSense` AND wire the sense read path through the re-keyed `meaningPoints` so `effectiveGloss`/the anchor index reflect drift.
- **Determinism:** *S2b re-bake protocol, up front* — GEN0 byte-identical across all 6 presets + full reproducibility (run twice, identical) are mandatory; the `meaning_layer_baseline` GENN expected hashes ARE updated for whichever presets diverge. This deliberately overrides the byte-identical-only "never edit baseline hashes" rule that governed S3.
- **Point model:** *Approach 1 — keep `meaningPoints` as a separate, id-keyed sparse drift-override* (birth point stays on the lexeme record). Rejected Approach 2 (collapse into `lexemes[id].point`) because it makes every reader of a lexeme's position drift-aware — an unbounded re-bake surface across sound-change legality and gap-detection geometry, beyond the ask.

## 1. The point model

After S4 a lexeme's position is two clearly-roled layers, both addressed by `LexemeId`:

| Layer | Where | Role | Mutability |
|---|---|---|---|
| **Birth point** | `lang.lexemes[id].point` | Coinage position (`lexPoint(gloss)` for seeded; gap point for keyless) | Static |
| **Drift override** | `lang.meaningPoints[id]` | Sparse "has since moved to here" delta, written by `glideMeaningPoint` on a kept metaphor/metonymy colexification | Sparse, drift-mutated |

One new resolver expresses "where is it now":

```
currentPointForId(lang, id) = meaningPoints[id] ?? lexemes[id].point      // ?? lexPoint(gloss) when no record exists
```

`meaningPointFor(lang, key)` is its public face and accepts **either a gloss or an id** — the satellites seam's mint-free `resolveKey` normalizes both ([satellites.ts:57](../../../src/engine/lexicon/satellites.ts#L57)). A `WordSense` reads its current point through *its own lexeme id*.

The vestigial third layer — `WordSense.point` / `.spread` / `senseSpread` / `DEFAULT_SPREAD` — is **deleted**. Confirmed dead: no production consumer of `sense.point`, `sense.spread`, `senseSpread`, or `DEFAULT_SPREAD` (definitions + tests only).

## 2. Half A — `meaningPoints` re-key (gloss → `LexemeId`), byte-identical

The 15th satellite, done by the exact S2a playbook. **Byte-identical (GEN0 and GENN)** on its own, because `meaningPoints` is reached only through `meaningPointFor`/`glideMeaningPoint`; no production code iterates it by key (`clone.ts` copies entries key-agnostically; the registry handles purge/inherit).

Changes:

1. Add `meaningPoints: number[]` to `SatelliteTypes` in [satellites.ts](../../../src/engine/lexicon/satellites.ts).
2. Route the two accessors in [meaningPoint.ts](../../../src/engine/semantics/meaningPoint.ts) through the seam, keeping today's fallback exactly:
   - `meaningPointFor(lang, meaning)` reads via `satGet(lang, "meaningPoints", meaning)`; on a miss, falls back to `lexPoint(meaning)` — **unchanged** from today (callers still pass glosses in Batch A). The id-aware birth-point fallback (`?? lexemes[id].point` for an id input) is added in Batch B2, where it is first exercised; it does not touch Half A.
   - `glideMeaningPoint` writes via `satSet(lang, "meaningPoints", meaning, Array.from(...))`.
3. Flip the registry entry [perMeaningFields.ts:181](../../../src/engine/perMeaningFields.ts#L181) `keyedBy: "gloss"` → `"lexemeId"` so tree-split purge-on-delete resolves by id.
4. Add `"meaningPoints"` to `SATELLITE_FIELDS` in [store.ts](../../../src/engine/lexicon/store.ts#L84) so old gloss-keyed saves migrate on load. The migrator carries the value verbatim — correct here because the value is a point array (gloss-agnostic), not a gloss-valued array.

**Gate:** tsc + targeted tests (`meaningPoint`, `drift`, `grounding`, `gapComposition`, `semantic_gap`) + RUN_SLOW `meaning_layer_baseline` **byte-identical, no hash edits.**

## 3. Half B — WordSense id-link + drift unification (the re-bake)

### 3.1 Add `WordSense.lexemeId`

- Type: `lexemeId?: LexemeId` (optional, for back-compat with already-persisted `lang.words`).
- Populate at the three central sense-creation sites, via `idForGloss(lang, meaning)` (non-minting — the lexeme always already exists for a real sense; keyless gloss-less records never become senses, [word.ts:682](../../../src/engine/lexicon/word.ts#L682)):
  - `addSenseToWord` ([word.ts:357](../../../src/engine/lexicon/word.ts#L357))
  - the word-builder in `setLexiconForm` ([word.ts:405-429](../../../src/engine/lexicon/word.ts#L405))
  - the `syncWordsFromLexicon` rebuild ([word.ts:713](../../../src/engine/lexicon/word.ts#L713))
- Load-time backfill: set `sense.lexemeId ??= idForGloss(lang, sense.meaning)` for senses lacking it (old saves), in the existing save-rehydration path.
- Robustness: every reader resolves `sense.lexemeId ?? idForGloss(lang, sense.meaning)`, so a missing id never throws.

This batch is **additive / byte-identical** — the field is written but not yet read.

### 3.2 Thread `lang`, unify drift

In [meaningPoint.ts](../../../src/engine/semantics/meaningPoint.ts):
- Add `currentPointForId(lang, id)` per §1.
- `sensePoint(lang, sense)` → `currentPointForId(lang, <resolved sense id>)`.
- `senseGloss(lang, sense)` → `glossOf(sensePoint(lang, sense))`.
- `effectiveGloss(lang, sense)`: relabel by the drifted point when the sense sits at a geometrically authoritative point — **it has a drift override** (`meaningPoints[id]` present) **or** its meaning is a direct anchor (`hasEmbedding(sense.meaning)`); otherwise the authored key stands (un-drifted compounds/orphans). Replaces the old `sense.point !== undefined || hasEmbedding(...)` condition.

Update the consumer set (the bounded re-bake surface): `anchorIndex.ts` ([lines 40/55/67](../../../src/engine/semantics/anchorIndex.ts#L40)) and the `emergentGloss` / `meaningPoint` tests, threading `lang`.

**Behavioral change = what re-bakes:** previously a drifted word's anchor-index entry stayed frozen at its authored gloss (because `sense.point` was never written); now a word that has drifted relabels to its drifted nearest-anchor. Translation / concept-lookup — and any RNG-coupled selection flowing through them — shift for presets where drift fires within the run.

**GEN0 is byte-identical by construction:** at gen 0 `meaningPoints` is empty, so `currentPointForId` returns the birth point and every accessor equals today's. Divergence appears only at GENN.

### 3.3 Retire vestigial `sense.point` / `.spread`

Delete `WordSense.point`/`.spread` ([types.ts:1046-1053](../../../src/engine/types.ts#L1046)), `senseSpread`, `DEFAULT_SPREAD`, the `sense.point` deep-clone branch ([clone.ts:153](../../../src/engine/utils/clone.ts#L153)), and the dead cases in `clone_sense_point.test.ts` / `meaningPoint.test.ts`. Byte-identical cleanup.

## 4. Determinism & testing

- **Protocol (S2b):** GEN0 byte-identical across all 6 presets (mandatory; automatic per §3.2) + reproducibility (run twice, identical). Re-bake `meaning_layer_baseline` GENN expected hashes for whichever presets diverge — determined **empirically**, not guessed (likely english + the richer-drift presets).
- **Half A** keeps the baseline byte-identical — no hash edits (proves the re-key is inert).
- **New lock tests:**
  1. Glide a meaning, then assert its sense's `effectiveGloss` / anchor-index entry reflects the drifted point — the assertion that *justifies* the re-bake.
  2. `sense.lexemeId` is populated at creation and survives clone + save/restore round-trip.
- **Per-batch gate:** tsc + the touched module's targeted FAST tests + a fast determinism canary (`meaning_layer_baseline -t "pie"` ≈15s; tokipona as the fast re-bake canary).
- **Final gate (once, after the chain):** full FAST suite + RUN_SLOW baseline on the merged result.

## 5. Batch decomposition (sequential; inline-in-session)

The chain is coupled, not parallelizable, and worktree subagents are incompatible with this local unpushed branch — execute inline (controller reconciles), as in S2b/S3. One commit per batch with its own gate.

- **Batch A — `meaningPoints` re-key (byte-identical).** §2. *Gate:* tsc + meaningPoint/drift/grounding/gapComposition/semantic_gap + baseline byte-identical, no hash edits.
- **Batch B1 — add `WordSense.lexemeId` (additive, byte-identical).** §3.1. *Gate:* tsc + word/clone/round-trip tests + baseline byte-identical.
- **Batch B2 — thread `lang`, unify drift (behavioral).** §3.2. *Gate:* tsc + anchorIndex/emergentGloss tests + GEN0 byte-identical (verified) + drift-relabel lock test.
- **Batch B3 — retire vestigial `sense.point`/`.spread` (byte-identical cleanup).** §3.3. *Gate:* tsc + targeted tests + baseline unchanged.
- **Batch B4 — the re-bake.** Run RUN_SLOW baseline; confirm GEN0 byte-identical + reproducibility (twice); update GENN hashes for diverged presets; record them in the ledger ([CONCEPT-KEYED-STORAGE-deferred-migration.md](../../planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md)). *Gate:* baseline green with new hashes + reproducible.
- **Final gate:** full FAST suite + RUN_SLOW baseline on the merged result.

## 6. Out of scope (deferred)

- **S5** — intrinsic LexemeId RNG draw order (the deliberate iteration-order flip + its determinism re-bake that S3 deferred). S4 keeps today's gloss-sorted draw order.
- **S6** — translation via anchor index + persistence end-state.
- **Approach 2** (collapse `meaningPoints` into the lexeme record) — explicitly rejected; not a future task unless re-opened.
