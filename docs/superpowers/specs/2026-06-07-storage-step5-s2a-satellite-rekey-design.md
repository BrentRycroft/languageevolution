# Storage migration step 5 — sub-project 2a: satellite-map re-key (design)

**Status:** approved design (2026-06-07). Branch `auto/storage-pointnative`.
**Predecessor context:** `2026-06-06-storage-step5-store-unification-design.md` (S1 — lexeme store
unification, DONE: `lang.lexicon` + `lang.keylessLexemes` retired into the canonical point-native
`lang.lexemes: Record<LexemeId, {form; point; gloss?}>`). This is the SECOND sub-project of **step 5**
("fully retire gloss addressing").

## Background & the bounded goal

S1 unified the *form* store under LexemeId keys and made keyless words first-class for the
sound-change sweep. But every **per-meaning satellite map** is still **gloss-addressed**: 14 fields on
`Language` shaped `Record<Meaning, X>` (frequency hints, register, age, neighbours, variants,
suppletion, inflection/declension/ablaut classes, grammaticalization stage, colexification, etymology,
origin chains). Keyless words have no gloss, so today they can carry none of this data.

**Step-5 decomposition (this spec = sub-project 2a):**

1. Store unification — **DONE** (S1).
2. **Re-key the per-meaning satellite maps → LexemeId.** Split into:
   - **2a (THIS SPEC):** typed accessor seam + flip the 14 maps to LexemeId-keyed + birth-time keyless
     population. Seeded behaviour preserved; keyless words become *addressable* in every satellite map
     and get the same birth-time fields a seeded word gets.
   - **2b (own brainstorm→spec→plan later):** widen the ~7 lazily-owned evolution processes (variants,
     suppletion, ablaut, grammaticalization, colexification, derivation, recarve split/merge) so keyless
     words *participate* and populate those maps too. Purely additive on top of 2a; overlaps S3.
3. Thread LexemeId through the ~381 seam call sites.
4. Point-native `WordSense` identity (meaning emergent) — **owns `meaningPoints`**.
5. Intrinsic LexemeId RNG order (determinism re-bake).
6. Translation via anchor index + persistence migration.

## Sub-project 2a scope (decisions locked in brainstorming)

- **Mechanism — accessor seam (Option B).** A new `lexicon/satellites.ts` module is the single choke
  point. Storage flips to `Record<LexemeId, X>`; callers go through generic typed `satGet/satSet/…`
  that resolve a gloss **or** an id internally. (Chosen over Option A "bare `satKey` resolver + direct
  indexing" and Option C "dual-key mirror".)
- **Keyless population — all eligible fields (target), delivered in two waves.** 2a delivers the
  *birth-time* subset for keyless words; 2b delivers process-driven population. The "all eligible"
  end-state is the goal; this spec is wave one.
- **`meaningPoints` is NOT in scope** — it is the semantic-drift point layer consumed by
  `meaningPointFor` and is owned by S4 (point-native `WordSense`). `lexemeIds` (gloss→LexemeId) also
  stays gloss-keyed: it *is* the addressing index, not a satellite map.

## 1. The accessor seam (`lexicon/satellites.ts`)

A type-safe field→value map drives generic accessors:

```ts
import type { Language, Meaning, WordForm, FormVariant } from "../types";
import type { InflectionClass, NounDeclensionClass, MorphCategory } from "../morphology/types";

// Value types are EXACTLY today's per-field value types (no value reshaping).
interface SatelliteTypes {
  wordFrequencyHints: number;
  lastChangeGeneration: number;
  wordOrigin: string;
  localNeighbors: string[];
  registerOf: "high" | "low";
  variants: FormVariant[];
  wordOriginChain: { tag: string; from?: Meaning; via?: string; donor?: string };
  colexifiedAs: Meaning[];
  inflectionClass: InflectionClass;
  nounDeclensionClass: NounDeclensionClass;
  ablautClassAssignment: number;
  grammaticalizationStage: { stage: 0 | 1 | 2 | 3 | 4; targetCategory?: MorphCategory; lastTransitionGen: number; affixForm?: WordForm };
  suppletion: Partial<Record<MorphCategory, WordForm>>;
  etymology: Meaning[];
}
type SatField = keyof SatelliteTypes;
```

**Key resolution** — the seam accepts a gloss or an id and never confuses them (a LexemeId is always
`c_…`-prefixed and lives in `lang.lexemes`; a gloss is an authoring string that lives in
`lang.lexemeIds`):

```ts
// read path: no minting (a gloss with no id yields undefined, which is the correct "no entry")
function readKey(lang, key: string): string {
  return lang.lexemes?.[key] ? key                 // already an id (keyless or seeded)
       : lang.lexemeIds?.[key] ?? key;             // gloss → its id, else pass through
}
// write path: mint an id for a brand-new gloss (matches today's lazy-mint via lexemeIdFor)
function writeKey(lang, key: string): LexemeId {
  return lang.lexemes?.[key] ? (key as LexemeId)   // already an id → use as-is (no spurious gloss mint)
       : lexemeIdFor(lang, key as Meaning);        // gloss → existing/new id
}
```

**Operations** (all generic over `SatField`, fully typed):

- `satGet(lang, field, key)` → `lang[field]?.[readKey(lang, key)]` (value or `undefined`).
- `satSet(lang, field, key, value)` → ensure `lang[field]`, write at `writeKey(lang, key)`.
- `satHas(lang, field, key)` → membership via `readKey`.
- `satDelete(lang, field, key)` → delete at `readKey`.
- `satKeys(lang, field)` → `Object.keys(lang[field] ?? {})` as `LexemeId[]`.
- `satEntries(lang, field)` → `[id, value]` pairs.

Seeded callers keep passing a gloss; ergonomics are unchanged. Keyless callers pass the id. The ~208
production index sites become `satGet/satSet` calls. The handful of `Object.keys(lang.<map>)` iteration
sites (`variants`, `suppletion`, `ablautClassAssignment`, `grammaticalizationStage`, `colexifiedAs`)
become `satKeys/satEntries`; their loop bodies now hold a **LexemeId**, so any inner use that needs the
gloss converts via `meaningForLexemeId(lang, id)` / emergent `glossOf(point)`.

## 2. Storage type flip + registry

- The 14 fields on `Language` change key type `Record<Meaning, X>` → `Record<LexemeId, X>` (values
  unchanged). `meaningPoints` and `lexemeIds` are untouched.
- `PerMeaningFieldSpec` gains `keyedBy: "gloss" | "lexemeId"`. All 14 satellite entries are
  `"lexemeId"`; `lexemeIds` is `"gloss"`.
- `purgeMeaningFromRegistry(lang, meaning)` purges a `"lexemeId"` field at `lexemeIdFor(lang, meaning)`
  and a `"gloss"` field at `meaning`. (Today it deletes everywhere by the gloss key.)
- `inheritMeaningFields` is key-agnostic (it copies by whatever key the map already uses) — **no
  change**; daughters inherit id-keyed maps verbatim.

## 3. Birth-time keyless population

At `coinKeylessLexeme(lang, point, form)` (and therefore `coinKeylessForGap`), seed the same birth-time
fields a seeded word receives, keyed by the new keyless id, using emergent properties where a value
needs a gloss/POS:

- `wordFrequencyHints[id]` — a coinage default (the same constant new seeded coinages use, e.g. `0.4`).
- `lastChangeGeneration[id]` — the current generation (so the sound-change diffusion clock starts now).
- `wordOrigin[id]` — `"keyless-gap"` (provenance marker, display/etymology only).
- `registerOf[id]` — neutral default (`"low"`, matching new-coinage default).

Lazily-owned maps (variants, suppletion, ablaut, declension, grammaticalization, colexification,
etymology, neighbours, origin-chain) are **left empty for keyless in 2a** — those are written by the
processes that own them, which 2b widens. They are now *addressable* (id-keyed), which is the point.

## 4. Determinism — target byte-identical

- **GEN0 byte-identical.** The maps are not in `meaning_layer_baseline`'s `signature()` (it hashes the
  gloss→form seam + `words` formKeys). The re-key is a pure relabel of seeded entries.
- **GENN target byte-identical.** Entries are written through the seam in the **same caller order**, so
  id-keyed insertion order mirrors today's gloss insertion order — every `satKeys`/`satEntries`
  iteration visits records in the same sequence. Seeded sound trajectories are already insulated
  (content-addressed sub-rng keyed by LexemeId, S1). Birth-time keyless entries are added only to the 4
  point-lookup maps in §3 (never iterated in an RNG-coupled seeded path) and keyless forms are excluded
  from `signature()`, so they are invisible to the baseline.
- **Re-bake is the audited fallback, not the plan.** Each iterated map's re-key is audited for a
  **key-string dependency** — a site that hashes/seeds an RNG from the gloss string, or feeds the key
  into a `lexGet`-style gloss lookup without an id→gloss conversion. If one is found and cannot be made
  order- and value-preserving, that single map's re-key is a deliberate, reproducible GENN re-bake,
  documented in the baseline with a dated justification. Byte-identity-vs-old is waived (user);
  **reproducibility (same config → identical output) is required** — capture any new GENN twice and
  confirm identical.

## 5. Clone & persistence

- `utils/clone.ts cloneLanguage` already deep-clones each satellite map by `Object.entries` — **key
  type-agnostic, no change** (it copies whatever keys exist).
- **Back-compat shim (load-time migration).** Old saves store these maps gloss-keyed. A migration pass
  (extending the S1 `migrateLexemeStore` rehydration in `simulation.restoreState`) re-keys each of the
  14 maps `map[gloss] → map[lexemeIdFor(lang, gloss)]` for any record that is still gloss-keyed, in a
  deterministic gloss order. No-op for already-id-keyed (new) saves. Gated by an old-save round-trip
  test.

## 6. Testing

- **Unit (FAST):** for each map, seam parity — `satGet(lang, field, gloss)` equals the value a
  gloss-keyed oracle would return; `satSet` then `satGet` round-trips; `satHas`/`satDelete` agree;
  `satKeys` yields ids in insertion order. Registry: `keyedBy` discriminator drives a correct
  `purgeMeaningFromRegistry` (id-keyed purged by id, `lexemeIds` purged by gloss). Old-save migration
  shim re-keys a gloss-keyed fixture; no-op on a new-shape fixture.
- **Keyless (FAST):** after `coinKeylessLexeme`, the 4 birth-time fields are present under the keyless
  id and absent for the lazily-owned maps; `satGet` reaches them by id.
- **Baseline (RUN_SLOW):** GEN0 unchanged; GENN byte-identical (or, where an audited map re-bakes, the
  new GENN captured twice and reproducible); full FAST + RUN_SLOW green; fix any behavioural-test
  fallout from iteration-site loop-variable changes.

## 7. Out of scope (later sub-projects)

Process-widening so keyless words participate in variants/suppletion/ablaut/grammaticalization/
colexification/derivation (sub-project **2b**); threading LexemeIds through the ~381 seam call sites
(S3); `meaningPoints` re-key + point-native `WordSense` identity (S4); intrinsic LexemeId RNG order
(S5); translation via anchor index (S6).

**Coverage gap (documented, not silently absorbed).** S2a re-keys exactly the 14 satellite maps in the
`perMeaningFields.ts` registry — the scope the step-5 decomposition named. There are *other* gloss-keyed
per-meaning fields on `Language` that are **not** in the registry and are therefore **not** re-keyed
here: `rootInventory`, `lexicalSpelling`, `gender`, `nounClassAssignments`, `boundMorphemeOrigin`. They
remain gloss-addressed after 2a. Folding them into the registry (and re-keying them) is a follow-on,
slated alongside S3/S4 where their owning subsystems are threaded; flagged here so it is a conscious
later decision, not an oversight.

## Key risk & mitigation

A re-keyed map iterated in an RNG-coupled path whose loop body uses the key as a **gloss** is the one
way 2a could silently change seeded behaviour. **Mitigation:** the per-map task audits every iteration
site, converts the loop variable id→gloss exactly where the old code consumed a gloss, and verifies
byte-identity against the baseline before committing — any genuine key-string dependency is surfaced
and re-baked deliberately, never papered over.
