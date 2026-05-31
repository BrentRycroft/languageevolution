# Meaning-Layer Migration — Design & Plan

**Status:** Phase 0 (survey) complete 2026-05-30. Awaiting go-ahead on Phase 1.
**Scope (decided):** concept IDs + morpheme building blocks FIRST; low-D
conceptual-space vectors DEFERRED to a later, self-contained enhancement.

## Goal

Decouple word MEANING from English strings, and make words morphological
*building blocks* (roots + affixes + compounds) rather than atomic forms — while
preserving the project's hard invariant of **byte-identical determinism**.

## Headline finding from the Phase-0 survey (3 read-only agents)

**Most of the scaffolding already exists. This is ADOPT-and-EXTEND, not a
ground-up rewrite.** Already built and shipped:

- **Concept identity:** `lexicon/conceptIdentity.ts` — branded `ConceptId`,
  `mintConceptId(lang)` (deterministic: `fnv1a(lang.id:seq)`, does NOT consume the
  RNG stream), `lang.conceptIds` sidecar + `conceptIdSeq`, registry-driven
  split-inheritance + delete-purge (`perMeaningFields.ts`), and
  `ensureConceptIdsForLexicon` auto-lift already running at init.
- **Concept registry:** `lexicon/concepts.ts` `CONCEPTS` carries per-concept
  POS / cluster / tier / colexification / decomposition.
- **Morpheme building blocks:** `WordMorphStructure` (origin/parts/base/affix),
  `rootInventory`+`rootPatterns`+`MECHANISM_TEMPLATE`, `boundMorphemes`,
  `derivationalSuffixes`, `seedCompounds`, concept-decomposition synthesis.
- **A hand-authored vector layer already exists** (`semantics/embeddings.ts`:
  cluster centroids + `embed`/`cosine`/`nearestMeanings`, consumed by drift) — the
  deferred "vectors" are a precursor to build on, not greenfield.
- **Presets already declare morphemes:** bantu 3 prefixes, pie 11 bound morphemes,
  english 13 bound + 20 compounds, tokipona 7 compounds + 5 colexifications.

## The architectural decision: PRACTICAL, not FULL

The codebase already documents this exact fork (`conceptIdentity.ts` header):

- **FULL** — `Lexicon = Record<ConceptId, WordForm>` (re-key everything).
  Blast radius **L**: 532 `lang.lexicon[...]` sites across 163 files, AND it breaks
  determinism because `Object.keys(lexicon)` *insertion order* feeds seeded RNG by
  index at ~10 genesis/morphology/drift sites. ~1–2 weeks. → **DEFER.**
- **PRACTICAL** — lexicon stays string-keyed; **`Meaning` = gloss, `ConceptId` =
  identity**; IDs live in the existing sidecar; only the cross-linguistic AUTHORED
  tables re-key through a concept-ID indirection. Blast radius **S–M**, keeps
  byte-identity because lexicon key order is untouched. → **CHOOSE.** (Matches the
  "IDs + morphemes first, vectors later" scope decision.)

## Determinism invariants (the minefield — must preserve)

1. **Do NOT re-key `lang.lexicon`.** Preserve `Object.keys` insertion order — it
   feeds `rng.int`-by-index at drift (Fisher-Yates), grammaticalize, recarve
   merge/split, suppletion, productive derivation, and the genesis mechanisms.
2. **Route ID minting through `mintConceptId` / `conceptIdSeq`** (deterministic, no
   RNG draw). Never a module-global counter (the doc warns this broke determinism).
3. **`embed` jitter is seeded by `fnv1a(meaning-string)`** (embeddings.ts:160) —
   keep seeding on a STABLE gloss string, not the UUID, or every embedding shifts.
4. **Freeze canonical ordering** of `CONCEPT_IDS` (today `Object.keys(CONCEPTS)
   .sort()` by English), `relatedMeanings`, and `colexWith` (today sorted by
   English) — these orderings are load-bearing for `rng.int` picks.
5. Keep alphabetic tiebreaks (`disambiguateSense`, exports) keyed on the gloss.
6. **Save format:** bump to v11 with a near-identity migration (lazy-mint already
   backfills). Config-replay saves are auto-safe (replay re-steps from the seed);
   only `stateSnapshot` saves need a data migration.

## String-hacks that HARD-BREAK under opaque IDs (must fix in Phase 2)

These parse morphology out of the English meaning string and break the moment keys
stop being English words — replace with reads of `WordMorphStructure.parts/base`:
- `bootstrapNeologismNeighbors` — `m.split("-")` (steps/genesis.ts:417)
- `embed` — regex `-(er|ness|ic|al|ine)$` (semantics/embeddings.ts:160)
- `translate` — compound-key `m.split("-")` (translator/translate.ts:78)

## Phased plan

### Phase 1 — Spine adopt + shim + safety net  [GATED · serial · single effort]
- Establish the "`Meaning` = gloss, `ConceptId` = identity" boundary. Extend the
  init lift to materialize a ROOT morpheme + concept→root binding per lexicon
  entry; honor existing affix keys via the `boundMorphemes` set (don't re-parse
  `-`), and pass `seedCompounds`/`seedColexification` through as building blocks.
- Keep `lang.lexicon` a **gloss-keyed derived view** (same pattern as the existing
  words→lexicon sync), so the 532 `lang.lexicon["wolf"]` reads keep working.
- Save v11 + migration.
- **Byte-identical determinism harness:** assert post-shim `lang.lexicon` + every
  word's `formToString` are byte-identical to a pre-shim snapshot for **all 6
  presets**. This is the safety net everything else leans on.
- Acceptance: full `npx vitest run` green, byte-identical.

### Phase 2 — De-couple subsystems  [GATED · parallel once Phase 1 lands]
- **B · POS delegation** — `posOf` → `CONCEPTS[id].pos`; resolve the pos.ts
  import-cycle (kill the inline `VERB_HINTS`/`ADJECTIVE_HINTS` dupes). Keep the
  signature. (L by call-count [128 sites], S by logic.)
- **C · morphemes + string-hacks** — populate `WordMorphStructure` from presets;
  fix the 3 string-hacks above; make `MECHANISM_COMPOUND` root-aware (this is the
  already-logged **firewater** coinage backlog item). (S.)
- **A · concept-relation indirection** — route `neighborsOf`/`clusterOf`/
  `colexWith`/`relatedMeanings`/`semanticTagOf` through concept IDs; freeze
  ordering. (M.)
- **Translator** — one `english→conceptId` adapter at `resolveLemma`
  (sentence.ts:660) + `translate` (translate.ts:29); `lookupFormWithResolution` /
  `closedClassForm` take a concept ID; `FALLBACK_SKIP`/`isValidEnglishLemma` move
  into the adapter. The input tokenizer + `glossToEnglish.ts` are already
  English-clean and DO NOT change. (S–M.)
- **Narrative** — source `englishLemma` from `concept.gloss`; read POS/animacy from
  `Concept` instead of `posOf`-on-lexicon. (M.)

### Phase 3 — Presets  [shim = ZERO forced edits · enrich is opt-in/GATED]
- The shim auto-lifts all 6 presets **unchanged** (green, byte-identical) — no
  preset rewrite is required for correctness.
- Enrich opt-in, per preset, smallest→largest: **Toki Pona first** (~117 entries;
  already exercises root + 7 compounds + 5 colexifications), then bantu → germanic
  → romance → pie → english (english is L, last; can stay on the bare-root shim
  longest). Enrichment effort scales with *derivable* vocabulary, not raw size; the
  template already exists in-repo (english `darkness = dark + -ness`).

### Phase 4 — Flip / cleanup  [GATED]
- Remove dead old paths; full `RUN_SLOW` determinism pass; one justified snapshot
  re-baseline if any.

## Explicitly deferred
- FULL `Record<ConceptId, WordForm>` re-key (L everywhere; not needed for the win).
- Low-D conceptual-space vectors (a separate enhancement on the clean concept
  layer; precursor = `embeddings.ts`). See ROADMAP "Parked / future direction".

## Proving ground: Toki Pona
Smallest lexicon, no affix special-casing, already leans on `seedCompounds` +
`seedColexification`, and has authentic many-to-one colexification (`telo` =
water/blood/sea; `soweli` = dog/cow/wolf/horse) — it exercises the concept-vs-form
distinction in miniature with an easy byte-identical surface.

## Recommended first concrete step
**Phase 1's shim + the byte-identical determinism harness, with Toki Pona as the
proving ground.** Lowest risk, proves the model end-to-end, zero preset churn,
and establishes the safety net the rest of the migration relies on.

## How we'll run it (agent workflow)
- **Phase 1:** serial, single coordinated effort, gated review — it's the shared
  dependency and touches the save format + determinism. Not parallelized.
- **Phase 2:** parallel agents per independent subsystem, but engine/determinism-
  rippling → **gated** pick-list each.
- **Phase 3 enrich:** parallel per-preset agents, reviewed (linguistic judgment).
- Throughout: the byte-identical harness is the safety net; the adapter +
  gloss-keyed derived view mean there is never a long red window.
