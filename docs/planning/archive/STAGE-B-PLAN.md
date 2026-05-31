# Stage B plan — meaning re-key (B1 focus)

Status: **PLAN ONLY (no code).** For review before greenlighting the Stage B
milestone. Supersedes the one-line B1 sketch in ROADMAP.md. Written 2026-05-30
after grounding probes (all deleted; findings below).

---

## 1. What the probes established

Three throwaway probes (deleted) characterised the determinism coupling that
blocked Stage-A enrichment:

1. **Adding 7 derived words → gen-0 byte-identical (0 diffs), gen-30 scrambled
   504 existing words.** Adding lexicon keys perturbs the *evolution trajectory*,
   not the seed state.
2. **Primary coupling site = `applyChangesToLexicon` ([apply.ts:737](src/engine/phonology/apply.ts#L737)):**
   `Object.keys(lexicon).sort()` then a sequential `rng.chance()` per word. A
   word's draw POSITION depends on its rank in sorted order, so inserting a key
   mid-order shifts every later word's draws.
3. **The coupling is DISTRIBUTED, not localised.** Forcing apply.ts to insertion
   order (instead of sorted) did NOT fix it — it made the add-7-words gen-30 diff
   *worse* (2385 words). So genesis / semantics / obsolescence also draw RNG while
   iterating the lexicon. No single-site tweak fixes this.

## 2. The distinction that reframes everything

I previously told you "B1 (decoupling RNG from key-order) requires re-baselining
the entire 30-step trajectory for all 6 presets." **That conflated two different
properties. Only one is the migration's actual invariant:**

- **(X) Refactoring invariance — the REAL Stage-B invariant.** Re-keying the
  lexicon from English-string keys to `ConceptId` keys must produce
  byte-identical evolved forms for the *same vocabulary*. `ConceptId`s (hashes)
  sort differently than English strings, so a naive re-key WOULD change iteration
  order at apply.ts:737 → change every form. B1 must therefore **preserve
  iteration order** across the re-key. This is the "RNG-by-index minefield" the
  ROADMAP already flagged. **Achievable and byte-identical** (see §3).

- **(Y) Insertion robustness — a SEPARATE nice-to-have, NOT required by the
  migration.** "Adding a new word must not change existing words." This is what
  Stage-A enrichment (A1b/A2/A3) wanted. It requires content-addressed per-word
  RNG at every draw site so a word's draws depend only on its own identity, never
  on iteration position. This is the ONLY part that forces a full-trajectory
  re-baseline, and it is **optional** — the migration proper does not need it.

**Correction:** the core Stage-B re-key (B1+B2) is **byte-identical — zero
re-baseline** — if order is preserved. The scary full re-baseline only appears if
we also do the optional (Y) work. Enrichment without (Y) is still possible; it
just means each enrichment is a deliberate, reviewed re-baseline of that preset's
trajectory rather than a byte-safe append.

## 3. B1 design — the order-preserving ConceptId seam

**Goal:** introduce `ConceptId` as the canonical iteration/draw key with **zero
change to evolved forms** (invariant X). The harness `meaning_layer_baseline`
must stay green at its CURRENT hashes — that green is the pass/fail gate.

**Steps**

1. **Audit (precise blast radius).** Enumerate every site that draws RNG while
   iterating the lexicon / words / compounds / suppletion, and record its order
   (sorted vs insertion). Known: apply.ts:737 (sorted, dominant), naming.ts:20
   (sorted, per-split), + distributed sites in genesis/semantics/obsolescence
   (proven by probe 3; exact list TBD). Translator/narrative sites
   (e.g. reverse.ts:96) are READ-only on a frozen state → NOT trajectory-coupled,
   exclude.
2. **Centralise iteration order.** Add one helper, `orderedConcepts(lang)`,
   returning concepts in an order **isomorphic to today's** `Object.keys(lexicon)
   .sort()` (i.e. ordered by current gloss string during the transition). Route
   every RNG-coupled site through it. This is a pure refactor: same order →
   same draws → byte-identical.
3. **Dual-key the lexicon behind an adapter** (the existing `conceptIdFor` /
   `meaningForConceptId` boundary already exists from Phase 72d). Reads resolve
   through ConceptId; the gloss string becomes a sidecar label.
4. **Prove byte-identical.** `meaning_layer_baseline` green at unchanged hashes
   (gen-0 AND RUN_SLOW gen-30, all 6 presets). Plus a new lock test:
   `orderedConcepts(lang)` equals `Object.keys(lexicon).sort()` at gen-0 for every
   preset (freezes the order contract so a future change can't silently break X).

**Why this seam is the right first move:** it is byte-identical (low risk, harness
proves it), it puts the ConceptId identity in the hot path centrally, and it
becomes the SINGLE place where optional (Y) could later swap the shared stream for
a per-concept sub-RNG — without re-touching every site.

## 4. B2 / B3 (sketch, after B1)

- **B2** — flip the canonical store to `Record<ConceptId, WordForm>` + gloss
  sidecar; mechanically re-point the ~532 `lang.lexicon[...]` read sites through
  the adapter; make translator/narrative/genesis concept-native; fix the 3
  meaning-string morphology hacks (genesis.ts:417, embeddings.ts:160,
  translate.ts:78). Byte-identical (iteration via `orderedConcepts`).
- **B3** — save-format vNext migration + flip default + remove shim. Re-baseline
  ONLY if the persisted payload changes shape (forms unchanged).

## 5. Optional (Y): content-addressed RNG — the enrichment unlock

If/when you want byte-safe vocabulary growth (A2/A3 become clean appends):
- At the `orderedConcepts` seam, replace the shared sequential `rng` in per-word
  loops with a per-concept sub-RNG seeded from `(conceptId, generation, site-tag)`
  via `fnv1a`. Each word's draws then depend only on its own stable identity.
- **Cost:** one deliberate full-trajectory re-baseline of all 6 presets (all GENN
  hashes change once; GEN0 unaffected — seed state has no draws). Plus a small
  per-word hashing cost (must be measured against the phonology hot-spot budget).
- **Benefit:** adding/removing/reordering vocabulary never perturbs other words →
  A1b/A2/A3 enrichment becomes byte-safe; and it encodes a real principle
  (lexicon size should not drive sound change — uniformitarian).
- **New permanent guard:** the "add a dummy word ⇒ all existing words
  byte-identical at gen-30" test (currently fails with 504 diffs) flips to green
  and stays green.

This is cleanly separable from B1/B2/B3 and can be done before, after, or never.

## 6. Risk & rollback

- **B1/B2 risk: LOW.** Byte-identical by construction; the harness is a hard gate
  on every commit. Main hazard is missing a coupled site in the audit → a hash
  flips → caught immediately by the harness; fix the missed site.
- **(Y) risk: MEDIUM.** Forces a full re-baseline (lose the "did this change
  anything?" signal for one commit) + perf sensitivity. Mitigate: land it as ONE
  isolated commit, re-baseline + full green, with a before/after perf number.
- **Rollback:** B1/B2/(Y) are compute-only refactors with no save-format change
  (that is isolated to B3), so any step is a clean `git revert`. Convert
  incrementally — one coupled site per commit, harness green each time — so a bad
  site is bisectable.

## 7. The decision this plan surfaces

Greenlighting Stage B now means two separable commitments:

1. **Core re-key (B1→B3): byte-identical, low-risk, zero forced re-baseline.**
   Delivers the meaning/English decoupling. Safe to run under the existing
   tiered-trust automation.
2. **Optional (Y) content-addressed RNG: one deliberate re-baseline, MEDIUM risk,
   but the thing that actually unblocks byte-safe enrichment (A2/A3).**

You can greenlight (1) alone, (1)+(2), or keep planning. My recommendation:
**do (1) first** (it's safe and mechanical, and B1's seam is the prerequisite for
(2) anyway), then decide on (2) once the seam exists and we can measure its perf.
