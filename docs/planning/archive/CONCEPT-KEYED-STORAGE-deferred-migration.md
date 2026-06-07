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
- **Increment 4 — core DONE (2026-06-06), green.** Keyless coinage now fires in the live genesis loop.
  **Staged plan (each step its own commit, re-bake where noted):**
  1. **Density/gap trigger — DONE (`9fc7588`), FAST green.** `findSemanticGap(lang)` in the new
     `genesis/semanticGap.ts`: a pure-geometry detector for a salient EMPTY anchor (unlexicalised, far
     from every existing word, yet inside a populated neighbourhood). Single early-breaking anchor scan;
     7 unit tests. Not consumed at commit time → additive/green.
  2. **Keyless coinage path — DONE (`045f8ff`), FAST green.** `coinKeylessForGap(lang, gap)` (same file):
     composes a kenning form for the gap's concept (`composeForGap`) and stores it point-natively via
     `coinKeylessLexeme(lang, gap.point, form)` — NO gloss key added. Deterministic; 4 unit tests.
  3. **Activate in the loop — DONE (`8b482fd`), re-baked, FAST + RUN_SLOW green.** `stepGenesis` ends
     with a low-rate (`KEYLESS_GAP_COINAGE_RATE = 0.1`) `rng.chance` gate → `findSemanticGap` →
     `coinKeylessForGap`. Silent (no event). Deliberate full GENN re-bake (rng-gate stream shift +
     `conceptIdSeq` advance reseeding the next gloss-keyed coinage's B1-Y sound-change sub-rng); GEN0
     byte-identical; reproducibility confirmed (identical hashes twice). FAST 2004/0; RUN_SLOW baseline
     + the RUN_SLOW-gated `keyless_coinage_loop` test (fires ≥1, deterministic, emergent gloss) green.
     This is the "actively coins keyless words" milestone. ZERO behavioural-test fallout.
  4. **Surface keyless lexemes — REMAINING (additive).** Dictionary/translator render
     `lang.keylessLexemes` via `keylessGloss` (emergent label) alongside the gloss-keyed words.
  5. **Migrate seeded words to keyless — REMAINING (the broad rework, optional end-state).** Make
     `WordSense`/the seam address by lexeme id + anchor index instead of `meaning`-gloss, so seeded
     words are stored like keyless ones; retire `lexemeIds` as the primary addressing. Full re-bake.
     Stage it module-by-module, re-baking per module.
  Step 4 is green/additive; step 5 is the deliberate re-baseline. Drive subagent-driven.

- **STEP 5 ("fully retire gloss addressing") IN PROGRESS** — decomposed into 6 sub-projects (spec
  `docs/superpowers/specs/2026-06-06-storage-step5-store-unification-design.md`, plan
  `docs/superpowers/plans/2026-06-06-storage-step5-store-unification.md`).
  - **Sub-project 1 (lexeme store unification) — DONE (2026-06-07), green.** Both `lang.lexicon` and
    `lang.keylessLexemes` are RETIRED; one canonical `lang.lexemes: Record<LexemeId, {form; point;
    gloss?}>` store. Tasks: T1 `8da700b` (record type + store primitives); T2 `fb7257d` (seeded words
    → `lang.lexemes`, ~110-file tsc-driven rename, byte-identical); T3 `fdb7d08` (keyless fold in as
    gloss-less records, byte-identical); T4 `5b26dfb` (keyless FIRST-CLASS in the sweep incl. the
    regular exceptionless `applyOneRegularChange` — deliberate GENN re-bake, **tokipona only**
    581f39fd→a8166cb8); T5 `919af66` (old-save `migrateLexemeStore` shim + keyless-evolve lock test).
    GATE each task: tsc 0 + FAST green + RUN_SLOW baseline (GEN0 always byte-identical).
  - **Sub-project 2a (satellite re-key) — DONE (2026-06-07), byte-identical.** The 14 per-meaning
    satellite maps (`wordFrequencyHints`, `lastChangeGeneration`, `wordOrigin`, `localNeighbors`,
    `registerOf`, `variants`, `wordOriginChain`, `colexifiedAs`, `inflectionClass`,
    `nounDeclensionClass`, `ablautClassAssignment`, `grammaticalizationStage`, `suppletion`,
    `etymology`) are now LexemeId-keyed behind a typed accessor seam. (`meaningPoints` deferred to S4;
    plan `docs/superpowers/plans/2026-06-07-storage-step5-s2a-satellite-rekey.md` + per-map playbook
    `docs/superpowers/plans/S2A-PERMAP-PLAYBOOK.md`.) Ledger:
    T1 `693d7fd` (typed seam `lexicon/satellites.ts`: `satGet/Set/Has/Delete/Keys/Entries` +
    `glossKeyedView` + `seedKeylessBirthSatellites`); T2 `5e45d05` (registry `keyedBy` discriminator +
    keyless birth-seed helper); T3 `5e21c6f` (`wordFrequencyHints`); seam hardened **non-minting**
    `4b5e9fe` (mint-free key resolution + registry purge — the systemic determinism fix that lets a
    satellite write never advance `conceptIdSeq`); T4–T14 the remaining 13 maps routed via per-task
    worktree branches `s2a-t4…s2a-t14` (merged); consolidation + 2 production determinism fixes
    (`registerOf` init-seed re-key, `localNeighbors` gloss-view to `driftOneMeaning`) + all test-fixture
    re-keys `f927f37`; T15 `cb148a3` (birth-time satellite data for keyless coinages); T16 `7c5c803`
    (load-time `migrateSatelliteMaps` in `restoreState`, mint-free + idempotent). Determinism: GEN0 +
    GENN **byte-identical across all 6 presets** (12/12 RUN_SLOW `meaning_layer_baseline`) — no re-bake;
    FAST suite green (2021 passed). Audit: no direct `lang.<satelliteField>[…]` indexing remains
    outside the seam.
  - **Sub-projects 2b-6 REMAIN:** S2b (process-widening) — widen the ~7 lazily-owned processes that
    still author satellite data by gloss so keyless words participate; S3 thread LexemeId through the
    ~381 seam call sites; S4 point-native `WordSense` identity (+ `meaningPoints` re-key); S5 intrinsic
    LexemeId RNG order (determinism re-bake); S6 translation via anchor index + persistence.

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
