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

### R2 — NEXT (the flip; determinism-critical, do with fresh context)
Deliberately LEFT for R2 (still raw, by design):
1. **phonology/apply.ts** — `applyChangesToLexicon` / `stratalApplyChangesToLexicon`
   take a BARE `lexicon: Lexicon` (no lang). Bare `lexicon[m]` at lines ~746,749,
   755,765,768,819,847,851,859 + the `out[m]=` writes. THREAD `lang` (or a
   conceptId↔gloss resolver) in here; iterate via `orderedLexiconKeys` (which R2
   reimplements). This is the hot-path fork — see §"The crux" (recommend: thread
   lang, resolve gloss per word via `meaningForConceptId`; MEASURE perf).
2. **Whole-lexicon assignments / rebuilds** (must produce a ConceptId-keyed store
   at R2): `lexicon/word.ts:443` (`lang.lexicon = nextLexicon` in
   syncLexiconFromWords), `phonology/regular.ts:54` (`lang.lexicon = next`),
   `steps/phonology.ts:253,264` (`lang.lexicon = applyChangesToLexicon(...)`).
3. **`lexicon/conceptIdentity.ts`**: `orderedLexiconKeys(lexicon)` (line 58) →
   reimplement to return ConceptIds **in gloss order** (needs lang, or a variant);
   `ensureConceptIdsForLexicon` (line 165) iterates the gloss store — re-think for
   cid store.
4. **`steps/init.ts:33`** `observedInventorySize(lexicon)` — bare `lexicon` param
   (value-read; key-agnostic, likely fine but confirm).
5. Flip the **accessor bodies** (access.ts) to translate gloss↔ConceptId via
   `conceptIdFor` / `meaningForConceptId`; flip `Lexicon` type in types.ts.
6. **Fold in item 2 (POS from registry)** + **item 4 (string-hacks moot)**.
7. **Serialization** (persistence): convert cid-store ↔ gloss-keyed JSON on
   save/load (keep save format gloss-keyed → no migration yet).
8. GATE: full `npx vitest run` + RUN_SLOW byte-identical at UNCHANGED hashes.
`modules/legacyMigration.ts:111` reads `Object.values` (key-agnostic) — fine as-is.
