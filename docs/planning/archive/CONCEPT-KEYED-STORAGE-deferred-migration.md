# Concept-keyed storage — archive + deferred point-native migration

> **Wave 4c (D-archive) of the Vector-Native Lexicon Flip.** The flip made meaning POINT-native and
> the gloss EMERGENT (see `../VECTOR-NATIVE-LEXICON-FLIP-PLAN.md` §10). This doc *archives* the
> concept-keyed storage that remains as the addressing substrate — kept, documented, and reversible,
> per decision **D-archive** — and specifies the one deferred piece: flipping the physical store.

## What is "kept" here (the archived system)

Nothing was deleted. The concept-keyed storage stays **live as a derived addressing cache**:

- **`lang.lexicon: Record<ConceptId, WordForm>`** — a ConceptId-keyed view of each meaning's surface
  form. It is **synced from the point-bearing lexeme entity** (`lang.words` senses, which carry
  `sense.point`) via `syncLexiconFromWords` / `syncWordsFromLexicon` (lexicon ⇄ words).
- **`lang.conceptIds: Record<gloss, ConceptId>`** + `conceptIdentity.ts` (`mintConceptId`,
  `conceptIdFor`, `orderedConceptIds`, the order contract) — the gloss→opaque-id map used for stable,
  deterministic addressing.
- **`access.ts`** (`lexGet`/`lexSet`/`lexKeys`/…) — the seam ~381 call sites use.

These are **not the meaning authority** anymore: a word's meaning is its `point` (which drifts) and its
label is the *emergent* nearest-anchor gloss. The ConceptId layer only provides a **stable handle for
addressing a word by its seed concept** — which the engine needs for deterministic, gloss-addressed
iteration (the RNG order contract, sound-change application, naming, reverse translation).

## Branch progress (`auto/storage-pointnative`, 2026-06-06)

The migration is UNDERWAY on branch `auto/storage-pointnative` (off `auto/realism` `f3b3338`):

- **Increment 1 (`888babf`) — DONE, green.** Re-keyed the store type/functions `ConceptId` →
  `LexemeId` across 39 files. `lang.lexicon` is now `Record<LexemeId, WordForm>` — keyed by lexeme
  identity, not concept identity. Pure rename; FAST 1989 / 0 fail.
- **Increment 2 (`29756f5`) — DONE, green.** Renamed the gloss→id index `lang.conceptIds` →
  `lang.lexemeIds` and the module `conceptIdentity.ts` → `lexemeIdentity.ts`. The "concept" framing is
  gone from the storage LAYER. Confirmed safe: the index is rebuilt on load (round-trip + autosave +
  determinism all green); FAST 1989 / 0 fail.
- **Increment 3 (`be69f55`) — DONE, green.** Delivered the KEYLESS-LEXEME capability:
  `coinKeylessLexeme(lang, point, form)` stores a lexeme defined PURELY by its point + form under a
  lexeme-intrinsic `LexemeId` in the new `lang.keylessLexemes`, with NO concept/gloss key at all; its
  label is emergent (`keylessGloss`). This is the "coin into an empty region of the space" primitive
  Track B deferred — the structural core. Additive (deep-cloned; no RNG/loop wiring), FAST 1993 / 0
  fail. The *capability* now exists.
- **Increment 4+ — remaining (multi-session).** WIRE keyless coinage into the genesis loop and migrate
  the gloss-addressed data-model. **Concrete staged plan (each step its own commit, re-bake where noted):**
  1. **Density/gap trigger** (additive, green): in `genesis/need.ts`, add a detector for a salient
     EMPTY region of the space (a point far from every existing lexeme but inside a populated cluster) —
     pure geometry over `meaningPointFor` + `anchorsWithin`. Unit-test only; not yet consumed → green.
  2. **Keyless coinage path** (additive, green): a function that, given a gap point, builds a form
     (reuse `composeForGap`/phonotactic samplers) and calls `coinKeylessLexeme(lang, point, form)`.
     Unit-test it produces a legal keyless lexeme; not yet called by the loop → green.
  3. **Activate in the loop** (BEHAVIOUR CHANGE → re-bake): call the gap trigger + keyless path from
     the genesis step (low rate). This fires keyless coinages during evolution → GENN shifts. Re-bake
     `meaning_layer_baseline` (RUN_SLOW), fix any behavioural-test fallout (as the cluster switch did),
     FAST + RUN_SLOW green. This is the "actively coins keyless words" milestone.
  4. **Surface keyless lexemes** (additive): Dictionary/translator render `lang.keylessLexemes` via
     `keylessGloss` (emergent label) alongside the gloss-keyed words.
  5. **Migrate seeded words to keyless** (the broad rework, optional end-state): make `WordSense`/the
     seam address by lexeme id + anchor index instead of `meaning`-gloss, so seeded words are stored
     like keyless ones; retire `lexemeIds` as the primary addressing. Full re-bake. This is the bulk —
     stage it module-by-module, re-baking per module.
  Steps 1–2 + 4 are green/additive; 3 + 5 are the deliberate re-baselines. Drive subagent-driven.

## The deferred migration (true keyless point-native store)

Replacing `lang.lexicon` (ConceptId-keyed) with a point-native lexeme store unlocks the last bits:
true **keyless coinage** (a word at an arbitrary point with no seed concept) and full retirement of
`access.ts` / `conceptIdentity.ts`. The codebase flags this as a **1–2 week dedicated migration**
(`conceptIdentity.ts` header, option (a)). Blast radius:

- ~**381** `lexGet/lexSet/lexKeys/…` seam calls (mostly survive if the seam keeps its gloss-in/form-out
  API; re-implemented on the lexeme entity + anchor index).
- **33** direct `lang.lexicon[…]` indexings that bypass the seam — each must move to the seam.
- The **RNG order contract** (`access.ts` ORDER CONTRACT, `orderedConceptIds`): several RNG-coupled
  sites draw per-word in sorted-gloss order, so the lexeme store MUST expose a deterministic order
  (port `orderedLexiconKeys`/`orderedConceptIds` to lexeme ids) or every evolved form diverges.
- **Persistence** (`persistence/migrate.ts`): old ConceptId/gloss saves → lexeme entities (round-trip
  + old-save-load tests gate it).

Reproducibility (same config → identical output) must hold; byte-identity-vs-old-baseline was waived
by the user, so a full deliberate GENN re-bake is expected. Not landable byte-green in one session;
it is the natural next project, built on the point identity + emergent gloss + anchor index already
shipped.

## Reversal procedure (D-archive: "so we can revert")

The behavioural geometric switches accept noise and are **reversible** one function at a time. To
revert any switch, restore the curated table as the live source (the tables were kept in place):

- **Neighbours** (`semantics/neighbors.ts` `neighborsOf`): revert the `hasEmbedding(…) ?
  geometricNeighbors(…)` branch to `return SEMANTIC_NEIGHBORS[meaning] ?? []`.
- **Clusters** (`semantics/clusters.ts` `clusterOf`): revert the `hasEmbedding(…) ?
  clusterRegionOf(lexPoint(…))` branch to `return MEANING_TO_CLUSTER[meaning]`.
- **Anchor-coverage extras** (`semantics/embeddings.ts`/`anchors.ts`): drop the `ANCHOR_EXTRA_TABLE`
  fallback to revert the 179 content words to hash points.

After any revert, re-bake the `meaning_layer_baseline` GENN deliberately (the trajectory shifts back)
and run the FAST suite + RUN_SLOW; the realism scorecard is diagnostic-only.
