# Storage migration step 5 — sub-project 1: lexeme store unification (design)

**Status:** approved design (2026-06-06). Branch `auto/storage-pointnative`.
**Predecessor context:** `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md` (the staged
migration; increment 4 — active keyless coinage — is DONE and green). This is the FIRST sub-project of
**step 5** ("fully retire gloss addressing").

## Background & the bounded goal

The vector-native flip made meaning POINT-native and gloss EMERGENT, but storage is still split-brain:
seeded/concept-coined words are **gloss-addressed** (`lang.lexicon: Record<LexemeId, WordForm>` +
`lang.lexemeIds: Record<gloss, LexemeId>`), while keyless words coined into empty regions are
**point-addressed** in a separate store (`lang.keylessLexemes: Record<LexemeId, {form, point}>`).

The user's step-5 goal is to **fully retire gloss-keyed addressing**. That end-state is ~6–7
independently-shippable sub-projects. It is bounded by a hard constraint: **gloss-the-string cannot
fully vanish** — it is inherent to the authoring layer (presets author `seedLexicon` as gloss→form),
it is the deterministic stable identity the RNG-order contract and reproducibility depend on, and the
English anchor frame is itself concept-defined. So "retire" means: **gloss stops being a word's
*meaning* and the primary *addressing key*; it survives only as (i) authoring input, (ii) emergent
display label, (iii) the opaque `LexemeId` handle already in place.** The anchor index replaces exact
concept→word lookup (fuzzy / many-to-one — a real semantics change validated in later sub-projects).

### Step-5 decomposition (this spec = sub-project 1)

1. **Store unification (THIS SPEC).** One point-native lexeme store; keyless words become first-class.
2. Re-key the 15 per-meaning satellite maps (`perMeaningFields.ts`) → LexemeId.
3. Thread LexemeId through the ~381 seam call sites.
4. Point-native `WordSense` identity (meaning emergent).
5. Intrinsic LexemeId RNG order (determinism-critical re-bake).
6. Translation via anchor index + persistence migration.

## Sub-project 1 scope (decisions locked in brainstorming)

- **Goal of S1:** end the split-brain — ONE point-native record per lexeme — AND make keyless words
  **first-class** (they evolve), at the *minimal* level: first-class **for the sound-change sweep and
  emergent-gloss display**, using satellite-map **defaults**. Per-word satellite data for keyless and
  keyless semantic *drift* are explicitly deferred (sub-projects 2 / later).
- **Chosen approach (A):** a new canonical `lang.lexemes` record store (over a parallel point map or a
  read-only accessor band-aid). It is the genuine foundation everything else builds on.

## 1. Data model

A single canonical store replaces both `lang.lexicon` and `lang.keylessLexemes`:

```ts
interface LexemeRecord {
  form: WordForm;
  point: number[];      // fixed-point ints (clone/JSON friendly), as keylessLexemes already stores
  gloss?: Meaning;      // present = seeded/concept-coined; ABSENT = keyless
}
lang.lexemes: Record<LexemeId, LexemeRecord>;
```

- `point` for a SEEDED record is materialized at birth = `lexPoint(gloss)` — a cache of today's
  derived value, so byte-identical at birth. (Glided/semantic-drift overrides still live in the
  gloss-keyed `lang.meaningPoints` and are layered by `meaningPointFor`; S1 does not move them.)
- `point` for a KEYLESS record is the coined point (today's `keylessLexemes[id].point`).
- `lang.lexemeIds` (gloss→LexemeId) stays as the **derived authoring/lookup index**, rebuilt on load
  exactly as today, populated only from records that carry a `gloss`.
- `lang.lexiconUR` (stratal underlying forms) stays `Record<LexemeId, WordForm>` (form-only) —
  unaffected; it already keys by LexemeId.
- `lang.lexicon` and `lang.keylessLexemes` are removed from `Language`.

## 2. Accessor seam (`lexicon/access.ts`)

Re-implemented over `lang.lexemes`; the **gloss-in/form-out API is unchanged**, so the ~381 call
sites do not move:

- `lexGet(lang, gloss)` → `lang.lexemes[lang.lexemeIds[gloss]]?.form`.
- `lexHas` → record exists for the gloss's id.
- `lexSet(lang, gloss, form)` → mint/lookup id, write/update a record; materialize `point = lexPoint(gloss)`
  and set `gloss` on first insert. (An existing record updates `form` in place, preserving its point.)
- `lexDelete` → delete the record (+ the existing `lexemeIds` purge in `deleteMeaning`).
- `lexKeys / lexValues / lexEntries / lexSize` → **only gloss-bearing records** (keyless EXCLUDED) —
  preserving today's behaviour for every gloss-iterating caller.

The ~33 direct `lang.lexicon[cid]` indexings (in `phonology/stratal.ts`, `steps/phonology.ts`, all
already `cid as LexemeId`) → `lang.lexemes[cid].form`. Mechanical; ~3 files.

## 3. First-class keyless: sweep + order contract

- `orderedLexemeIds(lexicon, lang)` / `orderedLexiconKeys(lang)` return **all** records ordered
  **[seeded sorted by gloss] ++ [keyless sorted by LexemeId]**. Seeded relative order is byte-identical
  to today; keyless get a stable intrinsic (LexemeId) order — never the drifting emergent gloss, so the
  order is determinism-stable.
- `phonology/apply.ts` `applyChangesToLexicon` reads `lexemes[id].form`. It resolves the gloss `m` it
  feeds to `soundChangeSensitivity(m)` / `isFormLegal(m, …)` as the **stored `gloss`, or `glossOf(point)`
  (emergent)** when absent (keyless). The per-word content-addressed sub-rng is already seeded from the
  LexemeId (`key`), so keyless words get independent, position-stable draws.
- Result: keyless words **evolve phonologically** like any word. Their meaning-`point` is fixed in S1.
  Satellite maps: keyless records have no entry → callers fall through to existing defaults
  (e.g. `wordFrequencyHints[m] ?? 0.5`).

## 4. Coinage / detector touch-ups

- `coinKeylessLexeme(lang, point, form)` writes a `lang.lexemes` record (minted id, `point`, no `gloss`)
  instead of `lang.keylessLexemes`.
- `findSemanticGap` / `coinKeylessForGap` read existing keyless points from `lang.lexemes` records
  without a `gloss` (seeded points come via `meaningPointFor` as today).
- `keylessGloss(record)` unchanged (emergent from `point`).

## 5. Determinism & re-bake

- **GEN0 byte-identical.** No keyless words exist at gen 0; the store rename + materialized point do not
  affect `meaning_layer_baseline`'s `signature()` (it hashes gloss→form via the seam + `words` formKeys).
- **GENN re-bake (deliberate).** Keyless words now (a) are swept by sound change and (b) consume
  shared-rng draws via the genesis/drift/cross-word iterations that now include them, so every preset's
  gen-30 trajectory shifts. Seeded words' *sound* trajectories stay insulated (content-addressed sub-rng
  is position-independent). Byte-identity-vs-old-baseline is waived (user); **reproducibility (same
  config → identical output) is required** — capture the new GENN hashes twice and confirm identical.

## 6. Clone & persistence

- `utils/clone.ts cloneLanguage` deep-clones `lang.lexemes` (record = `{form: slice, point: slice,
  gloss}`); the separate `keylessLexemes` clone branch is removed.
- Birth `rekeyLexiconToLexemeIds` builds `lang.lexemes` with materialized points.
- **Back-compat shim:** a load-time migration converts an old-shape language (`lexicon` form-only +
  `keylessLexemes`) into `lang.lexemes`. Gated by an old-save round-trip test.

## 7. Testing

- **Unit (FAST):** seam parity (lexGet/lexHas/lexKeys/lexSet results identical to a gloss-keyed oracle);
  store round-trip; order contract (seeded-by-gloss ++ keyless-by-id, deterministic); old-save migration
  shim; keyless record carries no gloss and is excluded from `lexKeys`.
- **Integration (RUN_SLOW):** over a 30-gen English run, ≥1 keyless word's **form changes** (it evolves);
  determinism holds (same config → identical keyless forms). Extends the existing `keyless_coinage_loop`.
- **Baseline:** re-bake `meaning_layer_baseline` GENN (RUN_SLOW), GEN0 unchanged, reproducibility
  confirmed; full FAST + RUN_SLOW green; fix any behavioural-test fallout.

## 8. Out of scope (later sub-projects)

Per-word satellite data for keyless (sub-project 2); keyless semantic *drift* / point mutation; threading
LexemeIds through call sites (sub-project 3); point-native `WordSense` identity (sub-project 4); intrinsic
LexemeId RNG order (sub-project 5); translation via anchor index (sub-project 6).

## Key risk & mitigation

Any store-iterating path that assumes a gloss exists could choke on a keyless record. **Mitigation:** the
implementation audits each path that iterates `lang.lexemes` (or the old `lang.lexicon`) and either routes
the gloss through emergent resolution (`glossOf(point)`) or keeps it on the gloss-only `lexKeys` seam
(which excludes keyless). The seam's gloss-only iteration is the default safe path; only the sound-change
sweep is deliberately widened to include keyless.
