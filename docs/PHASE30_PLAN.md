# Phase 30 — narrative + phonology quality pass

## Context

Phase 29 closed structural gaps (dual-truth lexicon, deterministic RNG,
mode flags, snapshot tests, expanded catalog, inflection classes,
etc.). With the structure sound, the next bottleneck is *output
quality*: the tree is right, the words drift correctly, but the
narrative output and phoneme inventories don't read like the
languages they claim to model.

This plan was assembled from a 60-generation survey across all six
presets (`scripts/audit-narrative.ts` will be the canonical version
of `/tmp/survey.ts`). Each finding below is concrete and citable
from a specific leaf's output.

---

## Findings — what the survey actually shows

### F1. Phoneme inventory is 1.8-2.7× over its tier target — every preset

| preset | tier | target | observed | × |
|---|---|---|---|---|
| default | 0 | 22 | 55 | 2.5 |
| PIE | 0 | 22 | 40 | 1.8 |
| Germanic | 1 | 28 | 70 | 2.5 |
| Romance | 2 | 34 | 73 | 2.1 |
| Bantu | 1 | 28 | 76 | 2.7 |
| Toki Pona | 0 | 22 | 45 | 2.0 |
| English | 3 | 40 | 76 | 1.9 |

Cause: every tone-bearing allotone (`a˥˥`, `e˥˥˧˥˧˥`, `o˧˥˧˥˧˥`)
counts as a distinct phoneme in `phonemeInventory.segmental`. The
homeostatic pruner sees 76 "phonemes" and merges them, but tone
sandhi + tonogenesis regenerate the variants every gen. Every leaf's
last-6-events list is dominated by `homeostatic merger` spam.

Tier targets `[22, 28, 34, 40]` were calibrated against pure-segmental
inventories. They no longer reflect what's counted.

### F2. Tone-marker stacking is unbounded

Observed segments include `e˥˧˥˩˩˧`, `e˧˥˧˥˧˥`, `o˧˥˧˥˧˥`, `e˧˥˥˧˥`,
`a˥˧˥˧˥`, `e˥˥˧˥`, `iː˥˧˥˩`, `u˥˩˧˥˧˥ː`. Real languages have at most
4 contour tones per syllable. Six-mark stacks are emergent from
sequential tonogenesis + sandhi rules with no max-complexity ceiling.

### F3. mother == father homophone collapse

3 of 7 surveyed leaves show identical surface forms for the
high-frequency Swadesh kinship pair:

- **default**: mother /bə˥te˥˧d/, father /bə˥te˥˧d/
- **Bantu**: mother /ba˥˩˧˥˧˥ba˥˩˧˥˩/, father /ba˥˩˧˥˧˥ba˥˩˧˥˩/
- **Toki Pona**: mother /ma˥ma˧/, father /ma˥ma˧/

Phase 24's frequency-direction split was meant to keep high-freq
Swadesh content conservative. Either it isn't biting hard enough on
specific meanings, or the polysemy collision logic absorbs them
after they incidentally drift to the same form.

### F4. English drifts SVO → SOV in 60 gens

`presetEnglish` seeds `wordOrder: "SVO"` and `culturalTier=3`. After
60 generations one alive leaf shows `wordOrder: "SOV"`. A stable
language with established morphology and high cultural tier
shouldn't flip word order this fast.

### F5. Romance preset still emits articles on every NP

The preset has `articlePresence: "free"` (Latin had no articles in
the proto stage) but EVERY NP gets `i˩dd` prefixed:

```
the brother flied at the mountain → i˩dd hda˥˧˥dd ho˧˥˧˥˧˥da˥˧˥dawi
                                     tabo˩ i˩dd mo˩ːdeː
```

The translator emits "the" in NP rendering unconditionally. Latin
should produce "frater volavit ad montem", no articles.

### F6. Genre differentiation is shallow

Across all 7 presets the only consistent genre marker is **perfect
aspect** (myth/legend) vs simple aspect (others). Daily, dialogue,
and poetry produce structurally identical output, just with
different slot pools. A reader couldn't reliably guess the genre
from the text alone.

### F7. Poetry rhyme scheme rarely fires

Tranche 5i bumped the candidate pool 3× → 8×. Observed across 35
poetry stanzas: most "rhymes" are accidental verb-pool collisions
(every line ends in the same word for "dies" or "comes"). AABB
scheme assertion almost never holds intentionally.

### F8. Translator rendering pile-on

Single content nouns emerge as 12-character agglutinative tokens
with 4-5 stacked tone marks:

- Romance "mountain" = `ho˧˥˧˥˧˥da˥˧˥dawi`
- Bantu "bear" = `bu˥bo˧˧˧˥a˥˩˧˥˧˥bo˧˩`
- English "mother" = `mʌ˥˩˥˩fə˥˧˥˩d` (with the perpetual `-d` suffix)

Some is genuine agglutinative morphology (Bantu noun-class prefixes);
some is the realiser stacking too many morphemes per token without
visual word boundaries.

### F9. Event log dominated by inventory-merger spam

Every leaf's last-6-events list is uniformly `homeostatic merger:
/X/ → /Y/`. No grammaticalisation, no chain-shifts, no productivity
events surface despite each existing in the engine. Driven by F1.

### F10. "the X the Y" coordination breaks

Several outputs juxtapose two NPs without a coordinator:
- `fə˩ fbi˥u˥˧˥˩bā˩b fə˩ wadtaz guːlxāːdãn` ("the bull the black wolf")
- `i˩dd ga˥˧˥dd i˩dd de˥˧˥˧˥di˧˥d de˥˧˥˧˥dũmeː` ("the goat the weak king")

The composer sometimes does emit coordinators ("kʷe˧˥˥˧˥" for and in
PIE; "eː" in Romance) — but the bare-NP templates fall through to
juxtaposition.

### What's working

- Inflection classes (Phase 29 Tranche 5d) populate at language birth.
- Tone sandhi fires on adjacent-tone pairs; visible in events.
- Closed-class word evolution (Phase 29 Tranche 5k) — articles erode
  through phonology.
- Frame coherence (Phase 29 Tranche 5g) catches the worst nonsense; no
  "drink the start" in 140 surveyed sentences.
- Suppletion badge / sound-correspondence pane / volatility badge
  all surface their data correctly.
- Reverse translator handles 3-affix forms without silent failures.
- Determinism holds — same seed produces byte-identical state.

---

## Plan — prioritised tranches

### 30a — Phoneme inventory truth

**P1, P2 (F1, F2)**

- `Language.phonemeInventory.segmental` becomes the tone-stripped
  set. Tone information lives on `phonemeInventory.tones` only.
- `inventoryFromLexicon` + `refreshInventory` strip tones before
  collecting into `segmental`.
- `prunePhonemes` operates on tone-stripped phonemes only.
- New cap: at most 2 contour marks per segment. Anything beyond
  collapses to the leftmost or best-fitting standard contour during
  tone application.
- Tier targets `[22, 28, 34, 40]` stay; they now correlate with
  what real-language inventories look like.

Files: `src/engine/steps/helpers.ts`, `src/engine/phonology/pruning.ts`,
`src/engine/phonology/tone.ts`, `src/engine/phonology/sandhi.ts`,
`src/engine/types.ts`.

Verification: re-run survey — every preset's segmental count within
`1.2× tier_target`. No 3+ contour stacks anywhere.

### 30b — High-frequency Swadesh protection

**P3 (F3)**

- New gate in `applyChangesToWord`: if a sound change would produce
  a form-key collision with another high-freq Swadesh meaning
  (≥0.85 frequency hint AND core-vocabulary tag), reject the change
  with high probability (~95%).
- Audit `tryCommitCoinage` polysemy path — high-freq core meanings
  should not be eligible polysemy targets.

Files: `src/engine/phonology/apply.ts`, `src/engine/lexicon/word.ts`.

Verification: in survey, mother ≠ father in every preset; sun ≠
moon; i ≠ you.

### 30c — Word-order drift gate

**P4 (F4)**

- `morphology/typology.ts` (or wherever `wordOrder` drift lives):
  word-order changes scale with `(1 - tier × 0.25) × (1 -
  syntheticIndex × 0.4)`. Tier-3 isolating language flips ~1/10 as
  often as tier-0 inflecting one.
- Cooldown: once a language has had `>= 3` events of a given
  word-order tag, future flips need 50+ generations between them.

Files: `src/engine/morphology/typology.ts`,
`src/engine/types.ts` (add `wordOrderLastFlipGen?` field).

Verification: 100 random English-preset 60-gen runs, < 5% flip the
seeded SVO.

### 30d — Article presence honoured

**P5 (F5)**

- `translator/realise.ts` NP rendering checks
  `lang.grammar.articlePresence` and skips the article when
  `"none"`.
- For `"free"`, definite/indefinite via the closed-class word; for
  `"enclitic"`, attaches to the noun's surface; for `"proclitic"`,
  prefixes; for `"none"`, omitted entirely.

Files: `src/engine/translator/realise.ts`.

Verification: Romance preset survey produces "frater volavit ad
montem"-shape sentences. Survey assertion: ≤ 5% of NP renders
carry an article when `articlePresence: "none"`.

### 30e — Genre differentiation

**P6, P7 (F6, F7)**

Per-genre stylistic tweaks:

- **Daily / dialogue**: enable contraction/clitic compression — when
  `articlePresence: "free"` and the article precedes a vowel-initial
  noun, elide article-final vowel. For pronouns + auxiliaries:
  render fused clitic forms.
- **Myth**: longer NPs (allow optional adjective and possessor),
  ban contractions, prefer perfect aspect.
- **Poetry**: GENERATE candidate lines under a final-rhyme constraint
  (rather than generating freely and filtering). Per-position
  lexicon filter restricts the slot's pool to candidates whose final
  syllable matches the rhyme nucleus.

Files: `src/engine/narrative/composer.ts`,
`src/engine/narrative/poetry.ts`,
`src/engine/narrative/discourse_generate.ts`.

Verification: 100-stanza poetry sample produces `≥ 1` rhyme pair in
`≥ 50%` of stanzas. Daily/dialogue text < 80% of myth/legend mean
sentence length (elision + contractions fire).

### 30f — Coordination realisation

**(F10)**

The composer sometimes emits coordinators, sometimes drops to bare
NP NP. Audit the `coordinate` template path and ensure every
coordinated NP renders with the language's `and` form.

Files: `src/engine/narrative/composer.ts`,
`src/engine/translator/realise.ts`.

Verification: in 100 surveyed sentences, "the X the Y" pattern
(two adjacent NPs with no coordinator) appears 0 times outside
appositive constructions.

### 30g — Translator readability

**(F8)**

- When rendering a target token, cap displayed tone marks at 2 per
  segment. Internal storage stays full — display layer condenses.
- Visually break compound morphological forms with `‧` (interpunct)
  between morphemes, optionally toggleable per script setting.

Files: `src/engine/phonology/display.ts` (`formatForm`),
`src/engine/translator/realise.ts`.

Verification: max-token-length in 140-sentence survey drops from
12-char to ≤ 9-char content words; tone-mark density ≤ 2.

### 30h — Event-log signal-to-noise

**(F9)**

- Inventory mergers fire many times per gen. Collapse runs into a
  single rolled-up event when consecutive: "homeostatic pruning: 5
  segments merged this gen" instead of 5 separate event rows.
- Already-bounded by `MAX_EVENTS_PER_LANGUAGE`, but the rollup means
  the bounded slots showcase actually-interesting events.

Files: `src/engine/steps/inventoryManagement.ts`,
`src/engine/steps/helpers.ts` (`pushEvent`).

Verification: in any 60-gen English run, `last 20 events` shows ≥ 5
non-merger event kinds.

### 30i — Inflection class UI surface

**P11**

The data exists from Phase 29 Tranche 5d but isn't displayed.

- LexiconView gains a small `(I)`, `(II)`, `(III)`, `(IV)` badge in
  the meaning column for languages with `lang.inflectionClass`
  populated.
- DictionaryView shows per-class verb groupings.
- Filter chip in LexiconView: "Class I only" / "Class II only" etc.

Files: `src/ui/LexiconView.tsx`, `src/ui/DictionaryView.tsx`.

Verification: open the app on a Romance run, badges visible on
verbs; click filter shows only that class.

### 30j — Survey script lands as a real audit

The `/tmp/survey.ts` produced for this plan ships as
`scripts/audit-narrative.ts`. CI-runnable, deterministic.

- Outputs to a snapshot file under `__snapshots__/` and is diff'd
  against expectation.

Files: `scripts/audit-narrative.ts` (NEW),
`package.json` (add `audit:narrative` script),
`docs/AUDITS.md` (NEW, document the audit's purpose + how to read).

Verification: `npm run audit:narrative` produces deterministic output.

---

## Order

1. **30a** is upstream of everything — until tone allotones stop
   polluting `segmental`, every other measurement reads wrong. Land
   first.
2. **30b** (Swadesh protection) and **30c** (word-order gate) are
   independent correctness fixes. Land in parallel.
3. **30d** (articles) and **30f** (coordination) are translator
   surgery. Land together.
4. **30e** (genres) and **30g** (token readability) are output-quality.
5. **30h** (event log) and **30i** (inflection UI) are visibility.
6. **30j** (audit script) lands last so it captures the new baseline.

Each tranche is one PR, ≤ ~400 lines. Run
`scripts/audit-narrative.ts` before and after each tranche and diff.

---

## Verification — top-level

- Re-run survey: all 7 presets within 1.2× tier-target inventory,
  no 3+ contour stacks, no mother == father, English retains SVO,
  Romance has no articles, every genre distinguishable on first
  read.
- `npm test` clean (no regressions; existing snapshot tests
  regenerate to capture the new shape).
- `npx tsc --noEmit` clean.
- A linguist reading the survey output for Romance can identify the
  language as Romance-shaped.

## Out of scope for Phase 30

- Reverting Phase 29 tone-bearing rules (sandhi, tonogenesis) — those
  produce useful change; the issue is just how their output is
  ACCOUNTED in the inventory.
- Major morphology rework (no new categories, no organic suppletion).
- Web Worker / undo / rich UI redesigns — Phase 30 is engine + display
  fidelity.
