# Storage step 5 — sub-project S6: translation via anchor index + persistence (FINAL)

**Branch:** `auto/storage-pointnative` (local commits only; do NOT push/PR).
**Status:** design approved 2026-06-13; ready for implementation plan.
**Predecessors:** S1 (store unification) · S2a (satellite re-key) · S2b (process-widening) · S3 (barcode-native addressing) · S4 (point-native WordSense + meaningPoints re-key) · S5 (intrinsic LexemeId RNG order) — all DONE.
**This is the FINAL sub-project of the vector-native storage migration.**

## 0. Context — what S6 finishes

After S1–S5 the lexeme store is point-native end to end: records keyed by `LexemeId`, id-keyed satellites + `meaningPoints`, `WordSense.lexemeId`, and a gloss-independent intrinsic RNG draw order. Two gloss-dependent things remain, and S6 ties them off:

1. **Concept→word resolution is by the STORED gloss, not geometry.** The forward translator resolves a concept via `lexFormById(lang, idForGloss(lang, m))` — the stored gloss→id index — rather than the point-native anchor index (the word whose *current/drifted* point is nearest the concept). S6 makes the user-facing *translation output* geometric.
2. **Persistence is informal.** `migrate.ts` does save-version bumps (v1→v10), but the point-native store migrations run as idempotent runtime shims in `simulation.restoreState` — a v10 save doesn't distinguish old gloss-keyed shape from new point-native shape. S6 formalizes this as a v11 bump.

### Approved decisions (this session)

- **Translation scope = geometric for open-class content-word OUTPUT only.** A new cached `idForConcept(lang, m)` resolves a concept geometrically (the lexeme whose emergent gloss is `m`), with a **stored-gloss fallback** that makes it a safe superset of `idForGloss`. It replaces `idForGloss` at the translator/narrative output-resolution sites + the reverse caption. The ~150 engine **bookkeeping** sites (satellite keying, existence checks, record writes), **closed-class** function words (`have`/`be`/pronouns/coordinators via `closedClassForm`), and `coinSeededLexeme` stay stored-gloss — geometry is semantically wrong for identity bookkeeping and for non-anchor function words.
- **`mutate.ts` stays stored-gloss (reversal of the initial "full geometric incl. mutate.ts" call).** Closer inspection showed making `setLexiconForm`'s `findPrimaryWordForMeaning` geometric would **corrupt `morphStructure`** for drifted words (inherit an unrelated word's structure, feeding sound-change boundary detection + reanalysis) — a bug, not a clean re-bake. `setLexiconForm` is identity bookkeeping ("update the word authored as X"), not translation. It keeps `findPrimaryWordForMeaning`.
- **Determinism = byte-identical baseline (the S4 pattern).** The geometric change is display-only (translator/narrative are NOT in the per-generation step pipeline — `steps/*.ts` import only translator utility tables, never the translation functions). GEN0 + GENN stay byte-identical across all 6 presets; persistence round-trip is preserved. The re-bake authorization is a **safety margin only** — verify, do not pre-edit hashes; re-bake only a preset that genuinely diverges, root-caused first.
- **Persistence = formalize as a v11 save-version bump**, keeping the `restoreState` shims as idempotent belt-and-suspenders.

## 1. The geometric resolver `idForConcept`

Add to the lexicon layer (alongside `access.ts` / `anchorIndex.ts`):

```
idForConcept(lang, m): LexemeId | undefined
  = the gloss-bearing lexeme whose EMERGENT gloss (nearest-anchor of its current/drifted point) is m,
    ties broken deterministically by sorted LexemeId (S5 order);
    falls back to idForGloss(lang, m) when m has no geometric match
    (closed-class / non-anchor / unlexicalised / no record currently glosses to m).
```

It is the id-level inverse of `effectiveGloss` over the record store — conceptually `anchorIndexOf` at the record level. **Safe superset of `idForGloss`:** for an un-drifted word it returns the same id, so output is byte-identical until a word actually drifts.

**Caching + determinism:** a `WeakMap<lang, Map<gloss, LexemeId>>` reverse index built from the records' current points, invalidated alongside the reverse-lex cache — the per-generation lang rewrite auto-invalidates (WeakMap), and mid-gen `setLexiconForm` invalidates explicitly (it already calls `invalidateReverseLexCache`; add the new cache there). Tie-break by sorted `LexemeId` so a concept with two equally-near lexemes resolves deterministically.

## 2. Geometric translation output

Replace `idForGloss` → `idForConcept` at the **output-resolution** sites only:
- **Translator:** the content-word lookups in `realise.ts` (`resolveOpen` + the main NP/verb content resolution — NOT the closed-class pronoun/aux/coordinator branches that fall through to `closedClassForm`), `sentence.ts`, `translate.ts`, `abstraction.ts`, `gracefulFallback.ts`.
- **Narrative:** content-word resolution in `narrative/composer.ts`, `narrative/generate.ts`, `narrative/discourse_generate.ts`.
- **Reverse caption** (`reverse.ts`): surface→**emergent** gloss (via `meaningForLexemeId`-then-`effectiveGloss`, or the anchor index) instead of the stored gloss, so a drifted word captions to its current meaning.

The per-site audit (which of the ~56 translator/narrative `idForGloss` calls are content-word *output* vs internal bookkeeping/closed-class) is performed task-by-task in the plan, guided by the rule: **convert a site iff it resolves an input *concept* to *its current target word for display*; keep it stored otherwise.** Because `idForConcept` falls back to `idForGloss`, an over- or under-conversion is byte-identical for un-drifted lexicons — the baseline + the drift lock test catch genuine divergences.

## 3. `mutate.ts` — unchanged

`setLexiconForm` keeps `findPrimaryWordForMeaning` (stored-gloss). No geometric resolution in the sim path. This is the deliberate boundary that keeps S6 byte-identical and avoids `morphStructure` corruption (see §0 decisions).

## 4. Persistence v11

- `migrate.ts`: bump `LATEST_SAVE_VERSION` 10 → 11. Add `MIGRATIONS[10]` (v10→v11): for each language node in `stateSnapshot.tree`, run `migrateLexemeStore(lang)` → `migrateSatelliteMaps(lang)` → `backfillSenseLexemeIds(lang)` (the same order `restoreState` uses), converting an old gloss-keyed v10 save to point-native v11. Old-shape detection is the shims' own (idempotent no-op for an already-point-native v10 save).
- New saves serialize at v11 (the records / id-keyed maps / `sense.lexemeId` are plain objects already serialized by the existing snapshot mechanism — no writer change needed).
- `simulation.restoreState`: keep `migrateLexemeStore` / `migrateSatelliteMaps` / `backfillSenseLexemeIds` as **idempotent belt-and-suspenders** — they guard non-file restore paths (worker round-trips, in-session restore) and are no-ops on a v11 save.
- Required by `migrate.ts`'s contract: a `migrate.test.ts` regression that loads a v10 (old gloss-keyed) fixture and confirms it migrates to a correct point-native v11 state.

## 5. Determinism & testing

- **GEN0 + GENN byte-identical, all 6 presets** (display-only geometric; `mutate.ts` stored; persistence round-trip preserved). Re-bake authorization is a safety margin only — if a preset diverges, STOP and root-cause before editing any hash.
- **New tests:**
  1. `idForConcept` unit tests — geometric match; stored fallback (closed-class / non-anchor); deterministic tie-break by sorted id; a drift case (override `meaningPoints[id]`, assert the resolver follows).
  2. *Translation-reflects-drift* lock test — glide a seeded content word onto another anchor, assert the forward translator now resolves the drifted word (the assertion justifying the geometric change).
  3. Persistence — a v10→v11 migration test (old gloss-keyed fixture → point-native) + a new point-native save→restore round-trip byte-identical test.
- **Existing translator/narrative tests:** mostly byte-identical (the `idForConcept` fallback returns the stored id for un-drifted seed lexicons); re-bake only a test that actually drifts a word and asserts specific output.
- **Per-batch gate:** tsc + the touched area's targeted tests + RUN_SLOW `meaning_layer_baseline` byte-identical (no hash edits).
- **Final gate:** lean full-FAST (exclude the multi-hour property tests — soundLaws/concept_smoke/phase72e — per the S5 efficiency lesson; the determinism baseline is the authoritative gate, and UI `document is not defined` results are known jsdom-load flakiness, re-run single-file before treating as real).

## 6. Decomposition

Four batches; every commit byte-identical (no re-bake expected).

- **Batch 1 — `idForConcept` resolver (additive).** Add the cached geometric resolver + cache invalidation hook + unit tests. Nothing consumes it yet → byte-identical. *Gate:* tsc + resolver tests + baseline byte-identical.
- **Batch 2 — geometric translation output.** Convert the audited translator/narrative output sites + the reverse caption to `idForConcept`; add the drift-reflects lock test. Display-only → byte-identical baseline; update any drift-asserting translator test. *Gate:* tsc + translator/narrative tests + baseline byte-identical.
- **Batch 3 — persistence v11.** Version bump + `MIGRATIONS[10]` + keep shims + migration/round-trip tests. *Gate:* tsc + migrate/persistence tests + baseline byte-identical.
- **Batch 4 — final.** Lean full-FAST + ledger (`CONCEPT-KEYED-STORAGE-deferred-migration.md`: S6 DONE → **the storage migration COMPLETE**) + memory.

## 7. Out of scope (deliberately retained)

- **`lang.lexemeIds`** (the gloss→id index) is KEPT as the authoring/boundary translator — gloss is still the authoring input and the deterministic id anchor; it is not retired.
- **Engine bookkeeping `idForGloss`** (~150 sites) stays stored-gloss — correct identity resolution.
- **Closed-class** function-word resolution stays on `closedClassForm`/`idForGloss`.
- No new keyless-coinage behavior; no change to the RNG order (S5) or satellites (S2a/S4).
