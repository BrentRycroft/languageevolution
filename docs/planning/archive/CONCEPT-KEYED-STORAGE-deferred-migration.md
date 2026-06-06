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
