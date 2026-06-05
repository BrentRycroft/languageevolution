# Vector-Space-Native Overhaul — Roadmap (2026-06)

Status: **Overview roadmap — all 6 design decisions LOCKED (2026-06-04, see §9).** It decomposes
the 6 ideas into tracks, sequences them, and records the resolved decisions. Each track gets its
own spec → plan → implementation cycle.

**Progress (2026-06-05):**
- **Track A — DONE** (continuous meaning model: fixed-point vectors, morpheme space, `lexPoint` +
  gliding, homonyms, grounding; Dictionary + translator surfaced). Plans 1–9.
- **Track C — DONE** (`TRACK-C-SPEC-preset-morphemization.md`): per-language point+live-form
  morpheme accessors (`languageMorphemes`/`wordMorphemes`) + all 6 presets morphemized via the
  determinism-neutral `seedEtymologies` field. **Ran before B** (B's coiner needs per-preset
  morphemes-with-forms). Key finding: morphological-structure enrichment can't route through
  `lang.compounds` without re-baselining a preset; use the engine-inert `lang.etymology`.
- **Track B — NEXT** (gap-driven compositional generation): consumes `languageMorphemes(lang)`.
- Tracks D, E — not started.

Supersedes nothing; extends the meaning-model work locked in the MEGA overhaul
(`docs/planning/MEGA-OVERHAUL-2026-06.md`, continuous semantic space + hybrid readout-axes).

---

## 0. North star

Make the **continuous semantic vector space the *native* substrate** for the lexicon —
not a read-only layer bolted onto a concept-key model. Today a word's identity is an
English concept key (`"water"`) and its vector is *looked up* from that key. The overhaul
inverts this: a word's identity becomes its **position in the space**; English anchors
become a *coordinate system* for display/translation, not the meaning itself. Morphemes
live in the same space; words are *compositions* of morpheme-points; new words are coined
to **fill empty regions** (necessity-driven); homonyms are *distinct points that happen to
share a form*. Sound change, in parallel, is recalibrated to be **rare, regular, and
prosodically realistic** (roots resist, affixes erode).

---

## 1. The keystone insight (read this first)

The 6 ideas are **not peers**. Four of them (#3, #4, #5, and the realistic half of #6) all
require the *same* foundational change, and the other two (#1, #2) are a largely separate
sound-change concern.

**Foundational change:** flip the lexicon from `Record<ConceptKey, WordForm>` to a
**lexeme entity**:

```
Lexeme {
  id:        stable id
  form:      WordForm          // phonemes
  meaning:   Vector            // a POINT in the space — NOT a key
  morphs:    MorphRef[]        // ordered composition (root + affixes)
  pos, frequency, register, wordOrigin, ...
}

Morpheme {
  id, form, meaning: Vector, type: "root" | "prefix" | "suffix" | "infix"
}
```

Once meaning is a *point* and form is *not* the key:
- **#5 homonyms** fall out for free: two lexemes, same `form`, distant `meaning` points.
- **#3/#4 composition** becomes expressible: a word's `meaning` is some function of its
  `morphs`' meaning vectors; coinage = find morphemes whose vectors compose toward a target.
- **#6 grammar** *can* be expressed if grammatical morphemes get points (with caveats, §7).

This is the largest data-model change in the project's history and the largest determinism
re-baseline. It must be **serial and first**. Everything else builds on it.

---

## 2. Idea-to-track map

| Your idea | Track | Depends on |
|---|---|---|
| #5 homonyms = distinct words sharing sounds | **A** (lexeme model) | — |
| #3 gap-filling, necessity-driven, morpheme composition, rare random morpheme | **B** (generation) | A |
| #4 morphemize presets (words = summed morphemes) | **C** (preset re-encoding) | A |
| #1 remove phoneme-target homeostasis | **D** (sound change) | — (touches C) |
| #2 sound change rarer + calibrated + roots resist, affixes erode | **D** (sound change) | C for boundaries |
| #6 grammar in the vector space | **E** (exploratory) | A |

---

## 3. Track A — Vector-space-native lexeme model  *(FOUNDATIONAL · serial · first)*

**Goal.** Replace the concept-keyed lexicon with lexeme entities whose `meaning` is a point.
Anchors (English keys) become a display/translation coordinate system via nearest-anchor
readout (we already have `nearestLexicalisedMeaning` / `readoutProfile` from the meaning
model + translator work just shipped — those are the seam).

**What changes.**
- `lang.lexicon` storage + the access seam (`lexGet`/`lexKeys`/`lexSet` in `lexicon/access.ts`).
- Drift becomes "the point moves" (it already navigates the embedding; now it mutates a
  stored point rather than re-keying).
- Genesis creates points (Track B).
- Translator resolves an English prompt → nearest lexeme(s) by point distance (extends the
  grounding rung just shipped).
- Persistence + a migration from concept-keyed save files.
- UI: the Dictionary already shows nearest words + axes; extend to show homonym sets and
  morpheme composition.

**A1 → RESOLVED (b) own additive space** (§9): morpheme vectors are *defined* so they sum
exactly to known words; affixes get learned operation-vectors. Composition is exact.

**A2 → RESOLVED point + spread/region** (§9): a lexeme is a point + a breadth scalar; senses
= anchors within the region; broadening/narrowing move the spread. Homonyms = separate
lexemes sharing a form (distant points).

**Risk.** Biggest re-baseline ever; migration of all 6 presets; determinism story must be
rebuilt (same config → identical output preserved, but every locked hash moves).

---

## 4. Track B — Gap-driven compositional word generation  *(after A)*

**Goal.** Coin words to **fill empty regions of the space** (necessity), not for a
pre-named concept.

**Mechanism sketch.**
1. **Gap detection.** Find a region that is (i) *reachable* — near the language's existing
   concepts / cultural tier, and (ii) *unlexicalised* — no lexeme within radius `r`.
2. **Necessity score.** Pressure ∝ local density of related existing words × cultural tier
   × communicative demand. The highest-pressure gap gets lexicalised this step.
3. **Compositional coinage.** Search the morpheme inventory for a *small* combination whose
   vector-composition lands nearest the gap centroid (a nearest-vector subset search),
   choosing among near-ties by the seed. The new lexeme's `meaning` = the gap centroid (or
   the achieved composition point); `form` = the morphemes' forms joined per the language's
   morphology (root + affix order).
4. **Rare random morpheme.** With low probability, instead mint a brand-new morpheme:
   sample a phonotactically-legal form from the language's syllable structure and assign it
   the *residual* vector needed to complete the composition. This grows the morpheme
   inventory organically.

**B1 → RESOLVED: pure gap-driven, replaces concept-driven coinage** (§9). Determinism: all
new draws appended after existing ones, seeded. The translator no longer coins on demand —
a missing concept resolves to the nearest existing word (grounding rung already shipped).

---

## 5. Track C — Preset morphemization  *(after A · AGENT-DELEGABLE)*

**Goal.** Encode each preset's vocabulary as **morpheme compositions** whose vectors sum to
the word's meaning (Toki Pona is already effectively morphemized — each word is a stable
root).

**Approach (depends on A1).** For each preset word, factor it into morpheme(s) such that the
morpheme vectors compose to the word's anchor position. Two sub-modes:
- **Authored decomposition** where the etymology is known (behind = be-+hind, already done;
  firewater = fire+water; PIE *akʷ-).
- **Auto-factorization** for the bulk: assign morpheme vectors by a constrained fit so
  `Σ morphemes ≈ word` across the preset (a per-language least-squares / iterative solve).

**This is the parallelizable bulk work you flagged for agents.** Once A fixes the morpheme
schema + the factorization recipe, one agent per preset re-encodes its lexicon. Each agent's
task is mechanical and well-bounded (re-encode N words as morphemes, verify the composition
lands within ε of the anchor, keep forms phonotactically legal).

---

## 6. Track D — Sound-change recalibration  *(fairly independent · can parallel A)*

**Goal.** Sound change that is **rare, regular, calibrated to ~25 yr/step, and prosodically
realistic.**

**#1 — remove the phoneme-target homeostasis.** Today `tierInventoryTarget` +
`inventoryManagement` actively pull inventories toward a per-tier number. Remove it and let
inventory size emerge from merger/split balance.
> ⚠️ **Risk flagged:** that homeostasis was *added because inventories ran away* (one prune
> vs 5+ additions per gen). **D1 → RESOLVED: emergent via functional load** (§9) — no target
> number, but low-functional-load phonemes merge + distinctiveness limits packing, so size is
> bounded by real pressure. This makes the Track-D rate calibration (#2) load-bearing: merge
> and split rates must balance or size drifts.

**#2 — calibrate + root/affix asymmetry.**
- Tune rates so a sound change is an *occasional* event at 25 yr/step (today
  `PHONOLOGY_RATE_SCALE = 0.75`; this becomes a calibrated, much lower effective rate).
- **Roots resist, affixes erode — via prosody, not a "protect roots" flag.** Real sound
  change is *regular* (hits all segments); affixes erode faster because they're *unstressed
  and high-frequency* (grammaticalization erosion). So the lever is **stress/prominence +
  frequency**: stressed root syllables resist lenition/deletion; unstressed affixal
  syllables lenite and drop. This needs morpheme boundaries (from A/C) to know which
  segments are affixal → **D interacts with A/C here.**
- **D2 → RESOLVED: full stress/prosody model** (§9). Weight-sensitive metrical stress with
  placement + shift; lenition/deletion conditioned on stress. Large enough to be its own
  **sub-project D-prosody** with its own spec; bonus payoff is stress-driven vowel reduction
  (→ schwa), the real engine behind much attested change.

**Folds in the pre-existing red.** `frequency_direction.test.ts` (RUN_SLOW) currently fails
(held=1/8) — the *high-freq-content-words-drift-less* property. It is **already red on HEAD**
(verified — not introduced by the meaning-model work). The root-resists-via-stress change is
the natural fix; resolve it here and re-baseline the determinism tier deliberately.

---

## 7. Track E — Grammar in the vector space  *(exploratory · last)*

**Goal.** Put grammatical morphemes (verb prefixes/suffixes, polysynthetic noun+verb
incorporation) into the space so they compose like lexical morphemes.

**Caveat (correction).** Distributional vectors capture *lexical/derivational* meaning well
but *inflectional/grammatical* meaning (tense, case, agreement) poorly — "PAST" or
"ERGATIVE" doesn't have a clean distributional position.

**E1 → RESOLVED: orthogonal grammatical dimensions** (§9). Because A1=(b) lets us build the
space, reserve dimensions for grammatical features (tense/aspect/case/…) orthogonal to the
lexical-semantic dimensions. A PAST morpheme is a unit vector on the tense axis; vector sum
combines lexical meaning + grammar cleanly, and the lexical-anchor readout stays unpolluted.
Still **Wave 3 / exploratory** — validated only after A/B prove the model out.

---

## 8. Sequencing

```
Wave 1 (serial, foundational):
  Track A — lexeme model + compositional space (A1) + migration. Re-baseline #1.

Wave 2 (parallel, after A's schema is fixed):
  Track B — gap-driven compositional generation
  Track C — preset morphemization  ← AGENTS (one per preset)
  Track D — sound-change recalibration + D-prosody sub-project (full stress model)
            (can start earlier; syncs with C for morpheme boundaries)

Wave 3 (exploratory):
  Track E — grammar in the space (orthogonal grammatical dimensions)
```

User's stated working model (endorsed): **serial backend coding for the foundational pieces
(A, B, D), agents delegated to the mechanical preset re-encoding (C).**

---

## 9. Decisions — RESOLVED 2026-06-04

All six locked via the planning Q&A. These are now design constraints, not open questions.

- **A1 — Compositional model → (b) OWN ADDITIVE-BY-CONSTRUCTION SPACE.** Define morpheme
  vectors so that, for known words, `Σ morphemes = word` exactly (per-language constrained
  factorization, seeded from GloVe for roots; affixes get learned "operation" vectors).
  Composition is exact → gap-filling (B) and agent morphemization (C) have precise targets.
  GloVe stays as the anchor readout for display/translation. Irregulars/suppletion get a
  non-compositional escape hatch.

- **A2 — Polysemy → POINT + SPREAD (REGION).** A lexeme is a point plus a breadth scalar;
  senses = anchors within the region. Broadening grows the spread, narrowing shrinks it,
  metaphor moves the point — wiring the existing drift kinds to a real representation.
  Homonymy stays separate lexemes sharing a form (distant points).

- **B1 — Coinage → PURE GAP-DRIVEN (replace concept-driven).** All coinage is the language
  organically filling an empty region. **Consequence (accepted):** the translator never
  coins a requested word on demand — a missing concept maps to the nearest existing word
  (the grounding rung already shipped). Words exist because the *language* needed them.

- **D1 — Inventory bound → EMERGENT VIA FUNCTIONAL LOAD.** Remove the per-tier target number;
  low-functional-load phonemes merge, sound change adds, distinctiveness limits packing —
  size finds its own level. Requires the Track-D rate calibration to keep merge/split balanced.

- **D2 — Erosion driver → FULL STRESS/PROSODY MODEL.** Weight-sensitive metrical stress with
  placement + shift; lenition/deletion conditioned on stress (unstressed affixes erode,
  stressed roots resist). **This is large enough to be its own sub-project under Track D**
  (D-prosody) with its own spec; bonus payoff is stress-driven vowel reduction → schwa.

- **E1 — Grammar → ORTHOGONAL GRAMMATICAL DIMENSIONS.** Because A1=(b) lets us build the
  space, reserve dimensions for grammatical features (tense/aspect/case/…) orthogonal to the
  lexical-semantic dimensions. A PAST morpheme is a unit vector on the tense axis; vector
  sum cleanly combines lexical meaning + grammar. Still validated only after A/B prove out
  (Track E stays Wave 3 / exploratory).

---

## 10. Cross-cutting risks

- **Determinism re-baseline scale.** Track A re-bases *everything* (the lexeme flip changes
  every locked hash). Reproducibility-determinism (same config → identical output) stays an
  invariant; byte-identity-vs-old-baseline does not. Budget for a large, deliberate,
  documented re-baseline at each wave.
- **Embedding additivity** (A1) — the make-or-break technical bet.
- **Bundle size.** Already at the 6 MiB PWA precache cap. A factorized morpheme space adds
  data; may need lazy-loading / quantization (the province-raster lazy-load follow-up applies
  here too).
- **Inventory runaway** (D1) if the phoneme target is removed without a replacement bound.
- **Scope.** This is *larger* than the MEGA overhaul. Each track is a multi-week effort; the
  whole thing is a multi-month arc. Worth staging hard and shipping per-wave.

---

## 11. Success criteria (how we'll know each track worked)

- **A:** homonyms exist as distinct lexemes; the Dictionary shows a word's morpheme
  composition and its homonym set; translation still works via nearest-anchor; determinism
  re-baseline is clean and reproducible.
- **B:** a fresh language coins words into genuinely empty regions over a run; coined words'
  morphemes compose (within ε) to their meaning; the occasional novel morpheme appears.
- **C:** every preset's vocabulary is morpheme-encoded; compositions land within ε of anchors;
  forms stay phonotactically legal; Toki Pona is unchanged (already morphemic).
- **D:** sound change is visibly rarer and calibrated; root syllables out-survive affixal
  ones; `frequency_direction` is green again; inventory sizes stay bounded.
- **E:** (exploratory) verb affixes / incorporation compose in the space without breaking A–D.
```
