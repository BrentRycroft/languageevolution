# Vector-Space-Native Overhaul — Roadmap (2026-06)

Status: **DRAFT for review.** This is the overview roadmap (per user request "whole roadmap
first"). It decomposes the 6 ideas into tracks, sequences them, and surfaces the decisions
that must be made before any track gets a detailed spec. Each track will get its own
spec → plan → implementation cycle later. Nothing here is implemented yet.

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

**Open decision A1 (THE crux — see §6): the compositional model.** How literally do morpheme
vectors "add up" to a word's meaning?

**Open decision A2: polysemy vs homonymy.** Is a polysemous word ONE lexeme with a *broad
region*, or multiple near-points sharing a form? (Homonyms = *distant* points sharing a
form — that part is settled.) Recommended: polysemy = one lexeme, one point, with the
*nearest several anchors* read out as its senses; homonymy = separate lexemes.

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

**Replaces/augments** today's concept-id-driven genesis. Determinism: all new draws appended
after existing ones, seeded.

**Open decision B1:** does gap-driven generation *replace* concept-driven coinage entirely,
or run alongside it (concept-driven for "named" needs, gap-driven for organic growth)?

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
> vs 5+ additions per gen). Removing it without a replacement bound may reintroduce runaway
> growth. **Open decision D1:** accept fully-emergent sizes, or keep a *soft* entropy/functional-load
> bound (not a hard target)?

**#2 — calibrate + root/affix asymmetry.**
- Tune rates so a sound change is an *occasional* event at 25 yr/step (today
  `PHONOLOGY_RATE_SCALE = 0.75`; this becomes a calibrated, much lower effective rate).
- **Roots resist, affixes erode — via prosody, not a "protect roots" flag.** Real sound
  change is *regular* (hits all segments); affixes erode faster because they're *unstressed
  and high-frequency* (grammaticalization erosion). So the lever is **stress/prominence +
  frequency**: stressed root syllables resist lenition/deletion; unstressed affixal
  syllables lenite and drop. This needs morpheme boundaries (from A/C) to know which
  segments are affixal → **D interacts with A/C here.**
- **Open decision D2:** build a real stress/prosody model, or approximate prominence by
  `morpheme-position + frequency` (cheaper, ~80% of the realism)?

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
"ERGATIVE" doesn't have a clean distributional position. **Open decision E1:** represent
grammatical morphemes in the *same* space (accepting fuzziness), or with a *separate*
feature representation that the composition machinery treats specially? Recommend: lexical &
derivational morphemes in-space; inflectional features kept as today and *attached* to
lexeme points rather than embedded. Defer until A/B prove the model.

---

## 8. Sequencing

```
Wave 1 (serial, foundational):
  Track A — lexeme model + compositional space (A1) + migration. Re-baseline #1.

Wave 2 (parallel, after A's schema is fixed):
  Track B — gap-driven compositional generation
  Track C — preset morphemization  ← AGENTS (one per preset)
  Track D — sound-change recalibration (can also start earlier; syncs with C for boundaries)

Wave 3 (exploratory):
  Track E — grammar in the space
```

User's stated working model (endorsed): **serial backend coding for the foundational pieces
(A, B, D), agents delegated to the mechanical preset re-encoding (C).**

---

## 9. Open decisions (resolve these before spec-ing Track A)

**A1 — Compositional model (the single biggest decision).** How do morpheme vectors combine
into a word's meaning?
- **(a) Raw distributional additivity** — `word ≈ mean/sum of morpheme GloVe vectors`.
  *Pro:* reuse the shipped embedding, zero new data. *Con:* GloVe is only *approximately*
  additive (king−man+woman≈queen is real but noisy); "compose morphemes to fill a gap" will
  be unreliable — most sums miss.
- **(b) Own additive-by-construction space** *(recommended)* — define morpheme vectors so
  that, for known words, `Σ morphemes = word` exactly (factorize each preset's words into
  morpheme vectors via a constrained solve, seeded from GloVe for the roots). *Pro:*
  composition is exact; gap-filling is well-defined; morphemization (C) has a precise target.
  *Con:* we must *build* the factorization (per-language solve); more upfront work.
- **(c) Hybrid + tolerance** — GloVe positions for words/anchors (display, drift, translation)
  + a learned residual so morpheme sums approximate word positions within ε; a composition is
  "valid" if it lands within ε of the target. *Pro:* balances reuse and composability. *Con:*
  most moving parts.

  → Recommendation: **(b) or (c).** (a) is the cheapest but I think it won't actually deliver
  "morphemes add up to the word" reliably enough to drive gap-filling. **This is the decision
  I most need from you.**

**A2 — Polysemy vs homonymy representation** (see §3). Recommend: polysemy = one lexeme/one
point (multi-anchor readout); homonymy = separate lexemes sharing a form.

**B1 — Does gap-driven generation replace or coexist with concept-driven coinage?** (§4)

**D1 — After removing the phoneme target, keep a soft bound or accept emergent sizes?** (§6)

**D2 — Real stress/prosody model, or approximate prominence by morpheme-position + frequency?** (§6)

**E1 — Grammatical morphemes: same space or separate feature representation?** (§7)

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
