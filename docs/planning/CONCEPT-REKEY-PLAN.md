# Concept re-key plan — `Lexicon = Record<ConceptId, WordForm>` (item 1, folding in 2 & 4)

**Status:** PLAN. Authorized 2026-05-31 (user chose "re-key first as the
foundation"). This is the FULL physical re-key the earlier
`archive/MEANING-LAYER-MIGRATION.md` deferred and B2 re-scoped away from. Execute
in byte-gated increments, ideally with fresh context per phase.

## Goal

Flip the canonical lexicon from gloss-keyed (`Record<Meaning, WordForm>`, where
`Meaning` is an English gloss string) to concept-keyed
(`Record<ConceptId, WordForm>`, opaque stable id). Fold in:
- **Item 2 — POS from the concept registry** (mandatory under opaque keys: you
  cannot parse English from a hash).
- **Item 4 — the string-hacks become moot** (keys stop being English strings;
  the `m.includes("-")` / suffix-regex checks are replaced by concept-native
  lookups, not string parsing).

Item 3 (preset enrichment) is a SEPARATE later phase on the clean foundation.

## Honest scope note (read before starting)

Stable concept identity ALREADY exists via the Phase-72d sidecar
(`lang.conceptIds: Record<Meaning, ConceptId>`), which closed the audit's
correctness gap. The physical flip is the **architectural endpoint**: it makes
ConceptId the PRIMARY key so glosses become pure labels that can never be
mistaken for identity or parsed as English. Benefit = robustness / true
decoupling; it is NOT a new capability. Effort is L (the design doc's "1–2
week"). Proceed because the user wants the endpoint — but keep the cost in view.

## The crux: the determinism hot path

`applyChangesToLexicon(lexicon, changes, rng, opts)` (apply.ts, ~65% of step
time) takes a **bare lexicon** and uses each key `m` as a GLOSS:
`soundChangeSensitivity(m)`, `applyChangesToWord(form, …, m)`, `isFormLegal(m,
next)`, `isContentWord(m)`, plus the homonym-collision `freq[m]` / `isContentWord`.
Under ConceptId keys these can't resolve without the concept→gloss/properties.

Three options (DECIDE at R2; this is the one genuine fork):
- **(a) Concept-native helpers** — `soundChangeSensitivity`/`isFormLegal`/
  `isContentWord` take a `ConceptId` and read the registry by id. Cleanest
  decoupling; touches those helpers + needs a conceptId→registry path.
- **(b) Thread `lang` (or a `glossOf` resolver) into the hot path** — `m` is a
  ConceptId; helpers get the gloss via `meaningForConceptId(lang, m)`. Adds a
  per-word lookup in the 65% hot loop → MUST measure perf.
- **(c) Hot path keeps iterating GLOSSES via accessors** — `orderedLexiconKeys`
  returns glosses; `lexGet(lang, gloss)` resolves the conceptId internally.
  Sidesteps the hot path entirely and is the least invasive, BUT the engine code
  stays gloss-centric (storage flips; code does not decouple). Weakest on the
  actual goal.

**Recommendation: (a) for the hot-path helpers** (real decoupling, no per-word
resolver alloc), with (c)-style accessors everywhere else. Confirm at R2.

## Determinism invariant (the thing that makes this byte-identical)

The B1 seam already centralises SORTED iteration order in
`orderedLexiconKeys(lexicon)` (today: `Object.keys(lexicon).sort()` on glosses).
The flip is byte-identical IFF:
1. **Sorted sites** (apply.ts, naming.ts, init.ts/seedRegister — the B1 audit
   set) keep drawing in the SAME order. `orderedLexiconKeys` is reimplemented to
   return ConceptIds **ordered by their gloss** → identical positional sequence
   → identical `rng` draws.
2. **Insertion-order sites** (~10 in genesis/semantics/obsolescence that do raw
   `Object.keys(lexicon)` feeding `rng.int`-by-index) keep insertion PARITY: the
   conceptId store must be built/mutated in the SAME sequence the gloss store is,
   so positions match. The accessor `lexSet` preserves insertion order; every
   construction (`applyChangesToLexicon`'s `out`, clones, splits) must insert in
   the same sequence.

The harness `meaning_layer_baseline` (gen-0 + RUN_SLOW 30-step, 6 presets) is the
hard gate on every increment. Hashes must stay UNCHANGED (the re-key is a pure
refactor — zero forced re-baseline if order is preserved). The
`concept_order_seam` lock test freezes the order contract.

## Phasing (each phase: byte-identical, harness-green, committed)

### R0 — accessor module (seam)
Add `lexicon/access.ts`: `lexGet/lexSet/lexHas/lexDelete(lang, m)`,
`lexKeys(lang)` (INSERTION order = raw `Object.keys`), `lexEntries/lexForms`,
distinct from the SORTED `orderedLexiconKeys`. Initially pass-through
(gloss-keyed). Establish the insertion-vs-sorted distinction in JSDoc — this is
the determinism footgun. Build green.

### R1 — route engine through the seam (the bulk, ~250–300 engine sites)
Mechanically replace `lang.lexicon[m]` reads/writes, `delete`, `in`,
`Object.keys/entries/values(lexicon)` with the accessors, in subsystem batches
(phonology → steps → genesis → semantics → morphology → lexicon → narrative →
translator → tree → contact). Pass-through ⇒ each batch byte-identical, build
never breaks. Serial (determinism-bearing) — do NOT fan out to agents. Targeted
tests per batch + periodic RUN_SLOW.

### R2 — the FLIP (determinism-critical, single focused effort)
1. `Lexicon = Record<ConceptId, WordForm>`; `lang.lexicon` flips; glosses become
   a sidecar label (the existing `conceptIds` map inverts to id→gloss).
2. Reimplement `orderedLexiconKeys` to return ConceptIds in gloss order; flip the
   accessor internals to gloss↔conceptId.
3. Resolve the hot path per the (a)/(b)/(c) decision above.
4. Fold in **item 2**: `posOf` takes ConceptId → registry; kill the pos.ts import
   cycle; keep the curated `VERB_HINTS`/`ADJECTIVE_HINTS` (they're intentional, not
   dupes — see ROADMAP) but re-key them.
5. **Item 4**: the bootstrap/genesis string checks become concept-native (use
   `peelDerivation`/registry, not `m.includes("-")`).
6. Serialization: persistence converts the conceptId store ↔ gloss-keyed JSON on
   save/load (keep save format gloss-keyed for now → no migration yet).
7. GATE: harness byte-identical at UNCHANGED hashes + full fast suite.

### R3 — fallout + cleanup
Route tests/UI/scripts (the remaining ~250 sites; LOW-risk, parallelizable).
Optional save-format vNext (only if the persisted payload shape changes). Full
RUN_SLOW determinism pass.

### Then — item 3 (enrichment), SEPARATE
Author preset words as building blocks (roots + affixes + compounds), per preset
smallest→largest (Toki Pona → … → english). NOT byte-identical (adding words
shifts trajectories) → one reviewed re-baseline per enrichment, like B2. Optional
prerequisite: content-addressed per-concept RNG (the old B1-Y) to make enrichment
byte-SAFE — decide separately.

## Risk & rollback
- R0/R1 byte-identical by construction; harness gates each commit; clean `git
  revert` (no save-format change until R3).
- R2 is the risk concentrate (hot path + insertion parity). Land it as a tight
  sequence; if a hash flips, a missed insertion-order site is the suspect.
- Convert one site/batch per commit so a regression is bisectable.

## Effort
Multi-session. R1 is the mechanical bulk; R2 is the careful core; R3 + item 3 are
follow-ons. Approach each phase with fresh context.

---

## PROGRESS

### R0 — DONE (36d1dd2)
`src/engine/lexicon/access.ts` — pass-through accessors (lexGet/lexHas/lexSet/
lexDelete/lexKeys/lexValues/lexEntries/lexSize), all `(lang: LexiconState, …)`.

### R1 — DONE (engine), byte-identical. Commits: cf1f997, 6afb96a, fec6eb6, 7e156a0, dd7271d.
Routed ~377 engine sites through the seam via 7 parallel sub-agents (disjoint
subsystem groups) + a few I did by hand. Each batch verified RUN_SLOW baseline
12/12 + tsc clean; full fast suite 1750 pass / 10 skip. Every per-meaning
`X.lexicon[m]` read/write/has/delete and every `Object.keys/entries/values(
X.lexicon)` iteration in engine code now goes through the accessors (insertion
order = `lexKeys`; sorted = `orderedLexiconKeys`).

### R2 — DONE (6dd6628 + R2.0 0502edc), byte-identical at UNCHANGED hashes.
The user chose the FULL flip + cid-native hot path. Delivered:
- **access.ts** bodies translate gloss↔ConceptId (reads use the non-minting
  conceptIds lookup; `lexSet` mints via `conceptIdFor`, insertion parity kept;
  `lexKeys`/`lexEntries` resolve via a FRESH reverse map).
- **conceptIdentity.ts**: `orderedLexiconKeys(lang)` → sorted glosses;
  `orderedConceptIds(lexicon, lang)` → matching store keys in gloss order (the
  RNG-draw order); `rekeyLexiconToConceptIds` (birth flip); `buildConceptIdToGloss`
  (fresh O(n) reverse map — the hot-path resolver).
- **apply.ts** hot path cid-native: iterate `orderedConceptIds`, resolve the gloss
  ONCE per word for sensitivity/legality/content/freq, compare RESOLVED GLOSSES in
  the collision tiebreak. Optional `lang` arg keeps the legacy gloss path
  byte-identical for unit tests (min_word_length).
- **phonology.ts / regular.ts / word.ts / stratal.ts / init.ts**: ages/momentum
  loop, post-apply change-recording loops, lexiconUR, and all whole-lexicon
  rebuilds produce/consume the cid store; satellite per-meaning maps STAY
  gloss-keyed (resolved per word). init flips the proto at birth.
- Baseline `signature()` projects through the seam → locks gloss→form, survives
  the storage refactor (R2.0).

**The one determinism bug (root cause):** three `stepPhonology` loops aliased
`const before = lang.lexicon` and treated it as gloss-keyed; post-flip `before`
is cid-keyed, so `lexHas(lang, cid)` was always false and the change-recording
loop (lastChangeGeneration / bumpFrequency / recordVariant) was wholly skipped →
next-gen ages all read 99 → different sound changes → wholesale divergence at
gen 4 (all presets). R1 routed `lang.lexicon[...]` but NOT local aliases — that's
the class of bug to watch. Also fixed a perf trap: `meaningForConceptId`'s
size-based staleness check is O(n)/call and stale on balanced add+delete within a
step; the hot path uses `buildConceptIdToGloss` instead (24s vs a 500s regression).

DEFERRED (intentionally, not blocking): (a) brand the `Lexicon` type to
`Record<ConceptId, WordForm>` — kept loose this phase to avoid a second tsc
ripple; (b) item 2 (POS-from-registry) and item 4 (kill the `m.includes("-")`
string-hacks) — the store is cid-keyed but the satellite maps + helpers still
speak glosses, so these are independent follow-ons, not forced by the flip;
(c) old-save migration / save-format vNext (loading pre-flip gloss-keyed saves).

### R3 — DONE (folded into 6dd6628). Test + UI/persistence routing.
~66 engine test files + lexicon/lookup tests routed through the seam (agents,
self-verified); 15 UI components + export.ts routed so the UI shows glosses, not
ConceptIds (GlobalSearch index via `lexEntries`; LexiconView badges gloss-keyed).
No expected values changed. Full `npx vitest run` 1750 pass / 10 skip; tsc clean.
