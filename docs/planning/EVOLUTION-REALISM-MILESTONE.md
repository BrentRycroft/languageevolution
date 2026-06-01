# Evolution Realism Milestone — implementation plan

Status: **PLAN ONLY** (no code changed). Source of findings: the 5-agent evolution
audit (2026-06-01), captured in ROADMAP.md "EVOLUTION REALISM AUDIT". This doc turns
those findings into a phased, verifiable milestone. The user has pre-authorized
"breaking what impedes" (re-baselines, mechanism replacement) as part of the milestone.

---

## 0. Why this is a milestone, not a backlog sweep

Every fix here is a **behavioural** change to how languages evolve, so:
- **Byte-identity is NOT the gate.** Each phase deliberately re-baselines
  `meaning_layer_baseline` (the locked GEN0/GENN hashes). That is expected and approved.
- The REAL gate is a **realism scorecard** (Phase 0) + the full `RUN_SLOW=1` behavioural
  suite staying green. We measure realism numerically before and after each phase.
- Determinism-as-reproducibility STAYS hard: no `Math.random()`; same seed → same output;
  new RNG draws appended after existing draws within a phase so intra-phase diffs are
  attributable. Each phase is its own reviewed re-baseline.
- Language-AGNOSTICISM is a first-class goal of this milestone (Phase 5), not a side note.

### Milestone success metrics (the "realism scorecard")
Targets the whole milestone drives toward (Phase 0 makes them measurable; later phases
move them):

| Metric | Now (audit) | Target | Owner phase |
|---|---|---|---|
| Swadesh-core retention @1000 yr | ~54% | **78–86%** (glottochronology) | 6 (rate), 1, 4 |
| Whole-lexicon identical retention @1000 yr | 5–11% | ≥ 30% | 1, 6 |
| Onset distribution (voiceless stops) | p/t/k marginal; /h/ 34% | p/t/k among top onsets; /h/ < 10% | 1 |
| Lexeme homophony rate | 6–16% | < 4%, concentrated in short/function words | 1 |
| Synthesis-index trajectory by type | ALL → polysynthetic (4+) | isolating stays low; type-appropriate; both directions possible | 4 |
| Compound coherence (head ∈ parts or hypernym) | ~0% (random siblings) | ≥ 80% endocentric/transparent | 2 |
| Antonym-drift rate (word → its opposite) | common | ~0 | 3 |
| Lexicon size stability (200 gens) | monotonic +12% to +47% | roughly stationary (births ≈ deaths) | 4 |
| Frequency distribution | saturated plateau at 0.95 | Zipfian (rank-1/rank-100 ≫ 1) | 4, 6 |
| Non-English preset can derive from own roots | NO (hardcoded English lists) | YES | 5 |

---

## Phase 0 — Realism scorecard harness (do FIRST)

**Why first:** these changes can't be gated on byte-identity, so we need a numerical
realism baseline to prove each phase helps and nothing regresses. This is the
"strong success criteria" that lets the rest proceed confidently.

**Build:** a RUN_SLOW test/probe (`src/engine/__tests__/realism_scorecard.test.ts`) that
runs each preset N gens and reports the scorecard metrics above. NOT a pass/fail
byte-lock — a tolerance-banded report (assert each metric within a realism band, wide at
first, tightened per phase). Reuse existing helpers: `lexGet`/`lexKeys` (access seam),
`levenshtein` (ipa.ts), `leafIds` (tree/split). Capture: Swadesh retention curve,
onset/segment distribution, homophony rate, synthesis index by preset, lexicon-size
curve, frequency Zipf ratio, compound-coherence %, antonym-drift count.

**Breakage:** none (new test only).
**Verify:** the harness runs and reproduces the audit's numbers (sanity check against the
agent findings).
**Effort:** S–M. **Risk:** low. Foundational — everything else measures against it.

---

## Phase 1 — Phonology rule integrity (cheap, highest cascade)

Audit theme A (phonology half) + D (the repair bug). The hand-written CATALOG is healthy;
the GENERATED-rule stack corrupts. Fixing the generator cascades into homophony, onset
distribution, and divergence rate.

**1a. Type-preserving feature repair** — `phonology/featureGeometry.ts:111`
`repairOutputMapByFeatures` replaces an unattested rule output with the nearest in-inventory
phoneme by raw feature distance (place 0–6, manner 0–3, voice +1), so palatalization→labials
(k→f), lenition→b→m, ejective-fortition→voicing. Design: constrain the replacement to
**preserve the defining feature-delta of `from`→ideal-`to`**. Compute the delta vector
(from input to ideal output); accept only candidates whose delta from `from` has the same
SIGN on the rule's defining dimension (lenition ⇒ manner strictly weaker than `from` &
not nasal/lateral; fortition ⇒ stronger/not voiced; palatalization ⇒ place moved toward
palatal/coronal; voicing ⇒ voice flipped, place/manner held). If no type-preserving
candidate exists, **return null (drop the rule)** rather than emit a corrupted change. The
rule's category (`change.category` / family) tells us which delta is defining.

**1b. Lenition↔fortition counterweight + /h/ exit** — `phonology/apply.ts:280` &
catalog. Lenition bias 1.5 vs fortition 0.5 is a 3× one-way push, and `deletion.h_initial`
is disabled so /h/ is an absorbing sink. Design: make the bias **self-limiting** — damp
lenition/voicing when the inventory is already voiced-obstruent-saturated (extend
`findSaturatedPhoneme`/inventory-pressure to count voiced-obstruent share), and enable an
/h/-loss / h→∅ exit by default so /h/ isn't terminal. Goal: stationary-ish onset
distribution with voiceless stops surviving.

**1c. Inventory drain vs founder re-introduction** — `inventoryManagement.ts:44` +
`founder.voiced_aspirated`. Inventories inflate past tier targets (english 38→48) and
re-acquire marked bʰ/dʰ/gʰ. Design: strengthen pruning pressure vs growth; let delab/deasp
decay rules win against founder re-introduction once a language has shed them.

**Breakage:** full re-baseline of all presets' phonology (meaning_layer GENN). Expected and
approved — this is the point.
**Verify (scorecard):** onset distribution (voiceless stops return, /h/ < 10%); homophony
< ~4%; Swadesh identical-retention rises; sample evolved forms are featurally coherent
(palatalization yields coronals/palatals, lenition yields fricatives/approximants).
**Effort:** M. **Risk:** medium (hot path; perf-sensitive — keep `closestByFeatures` O(inv)).

---

## Phase 2 — Word-formation coherence (cheap; kills the "weird mashup" feeling)

Audit theme B (genesis half). Compounds glue two random cluster-siblings; redup/clipping
file unrelated forms under the target.

**2a. Endocentric compounds** — `genesis/mechanisms/compound.ts:26`. Replace "two random
members of the target's cluster" with **MODIFIER (from a different, semantically-linked
domain) + HEAD (the target itself, or a hypernym/cluster-superordinate of it)**. Kenning
logic: `firewater` = fire(modifier) + water(head=the liquid referent). Source the modifier
from the curated colex/neighbor graph (Phase 3 shares this), not the coarse 116–509-member
cluster. Keep the existing refuse-to-mint-garbage guard (return null when no coherent
head+modifier), and the phonotactic/OT fit check.

**2b. Etymologically-linked reduplication/clipping/conversion** —
`reduplication.ts:23`, `clipping.ts:18`, `conversion.ts`. These pick a random base and file
it under the target. Design: constrain the base to be semantically linked to the target —
clip a *longer synonym/hypernym of T*, reduplicate an *iconic/related* root, convert a
*related sense*. If none available, return null (let the cascade fall through), don't mint
an orphan etymology.

**2c. Remove the legacy random-pair compound** — `genesis/apply.ts:103` `coinViaLegacy`
→ `catalog.ts:76` `genesis.compound` still calls `pickMeanings(rng, 2)` (two fully random
lexemes). Route the legacy fallback through 2a, or delete the random-pair branch (the user
authorized removing impediments — this is a maintenance hazard / second unfixed mashup
generator).

**Breakage:** re-baseline (coinage changes shift GENN where coinage fires < 30 gens);
delete/rewire a legacy code path.
**Verify (scorecard):** compound-coherence ≥ 80% (head ∈ parts or hypernym); spot-check
that coined words read like real neologisms (no `ape = seal+piglet`).
**Effort:** M. **Risk:** low–medium.

---

## Phase 3 — Semantic-change integrity

Audit theme B (semantics half). Drift navigates a degenerate embedding (antonyms ≈
identical) over coarse clusters; the rich curated colex/neighbor graph is unused.

**3a. Drive drift from the curated graph** — `semantics/drift.ts:159`,
`clusters.ts:55 relatedMeanings`, `concepts.ts:92 COLEX_PAIRS`. Make the PRIMARY drift
candidate source the curated colex + SEMANTIC_NEIGHBORS graph (tight, CLICS-aligned).
Demote whole-cluster `relatedMeanings` to a rare fallback. This also feeds Phase 2a's
modifier source.

**3b. Stop words drifting to their opposite** — `embeddings.ts`. Antonyms share a cluster
centroid + jitter, so `cos(water,fire)=0.987`, `cos(alive,dead)=0.952`. Cheapest robust
fix: maintain a curated **ANTONYM set** (like COLEX_PAIRS) and exclude opposite-polarity
pairs from drift candidates. Optionally also add a **dominant polarity/valence axis** so
gradable antonyms are far apart in embedding space (a single weak dim-8 isn't enough
against 11 shared dims).

**3c. Directional clines** — `drift.ts:73 classifyShift`. Drift currently labels by
post-hoc cosine, so metonymy is ~77% of shifts and direction is symmetric. Add an
**abstractness dimension** and make broadening/narrowing/metaphor follow its sign
(concrete→abstract is one-way; bleaching only loses meaning); reserve metonymy for genuine
part/whole/contiguity (cluster + contiguity flag).

**3d. Taboo on referents, not raw frequency** — `lexicon/taboo.ts:26`. Gate taboo
replacement on a referent tag set (death / predator / disease / sacred / body-sex / in-law)
instead of `freq ≥ 0.7` (which hit go/take/want/see). Most steps should find no eligible
target.

**3e. Recarve memory** — `semantics/recarve.ts:44`. Record split/merge history; damp
re-splitting/re-merging a recently-recarved pair (stop cold→cool→cold oscillation).

**3f. Colexification from recorded polysemy** — `colexification.ts:71`. `getColexifications`
infers colex from English HOMOPHONES (sun=son). Read `lang.colexifiedAs` (recorded
polysemy) as the source of truth instead. (Analysis/UI correctness; low evolution impact
but anglocentric.)

**Breakage:** re-baseline (drift trajectory changes); the embedding change shifts any
embedding-driven decision.
**Verify (scorecard):** antonym-drift ~0; drift targets are tight/attested; shift-kind
distribution is directionally sane (not 77% metonymy); taboo targets are referent-class
words; no recarve oscillation.
**Effort:** M–L. **Risk:** medium.

---

## Phase 4 — Restore the missing cycles (STRUCTURAL — the big one)

Audit theme A core. This is where "everything converges to one over-marked endpoint" lives.
Highest leverage on "feels right", highest risk.

**4a. Affix-loss → paradigm-removal + analytic pull (the synthesis ratchet)** —
`grammar/typology_drift.ts:26`, `morphology/evolve.ts:470/597`. `synthFromParadigms = 0.8 +
0.2*paradigmCount` and paradigm count only ever rises (`maybeMergeParadigms` fired 0× in 250
gens; the `inflect()` empty-affix guard defers removal to a non-existent "separate concern").
Design: (1) when a paradigm's affix erodes to ∅/near-∅ (track via `applyPhonologyToAffixes`),
**drop the paradigm** with some probability and decrement effective synthesis; (2) make the
synthesis target also pulled DOWN by analytic features (`caseStrategy=preposition`,
`hasCase=false`, periphrastic TAM), not paradigm count alone. (3, deeper/optional) close the
loop: when an inflectional category is lost, allow a **periphrastic construction** to emerge
(analytic renewal) that can later re-grammaticalize — the full Hodge/linguistic cycle.

**4b. Grammaticalization respects the cline** — `morphology/evolve.ts:106`. A high-freq word
teleports to a bound affix in one gen. Route it through the **clitic stage first**
(free → proclitic/enclitic), binding into a paradigm only at a later stage-transition.
Connect the currently-orphaned `maybeCliticize` to actually feed this (it presently just
truncates citation forms — see 4c).

**4c. Cliticization = reduction in a host+clitic context, not lemma truncation** —
`evolve.ts:451`, `progressGrammaticalizationChain` `evolve.ts:200`. Both do `form.slice(0,-1)`
on the free lemma (belly→/kʷefoː/). Design: reduce an *unstressed bound allomorph* in a
host+clitic unit (vowel reduction/assimilation), not delete the dictionary form's last
phoneme. (This also retires the two erosion-nucleus guards' root cause from earlier.)

**4d. TAM mutual exclusion** — `morphology/evolve.ts:625 inflectCascade`. Stacks past+future+
perfective on one verb. Group paradigm categories by AXIS (tense / aspect / mood / person /
case) and select at most one value per axis (the narrative composer already does this at
generate.ts:229 — lift that logic into the core).

**4e. Word death (low-frequency obsolescence)** — `steps/obsolescence.ts:41` (only
homophone-rivalry today) + `genesis/need.ts:97` (permanent +0.15 growth pressure). Add a
low-frequency obsolescence channel: probability of loss rises as `wordFrequencyHints[m]`
falls, protected for Swadesh-core/closed-class. Goal: births ≈ deaths, stationary lexicon
size. (Depends on Phase 6's frequency fix to have real signal.)

**Breakage:** heavy re-baseline; removes paradigms/words mid-trajectory; reworks
cliticization (the earlier nucleus-erosion guards may be revisited). This is the most
disruptive phase — sequence it after 1–3 are stable.
**Verify (scorecard):** synthesis-index trajectory is type-appropriate and BOTH directions
occur (Romance can shed morphology); isolating presets stay isolating without a pathway;
lexicon size stationary; no illegal TAM stacks; grammaticalization passes through a clitic
stage in the event log.
**Effort:** L (largest). **Risk:** high. Split into sub-PRs (4a, then 4b+4c, then 4d, then 4e).

---

## Phase 5 — De-anglicize behaviour (agnosticism)

Audit theme C. English-shaped BEHAVIOUR (distinct from legit English meaning-keys).

**5a. Productive derivation via `posOf`, not English wordlists** —
`genesis/mechanisms/targetedDerivation.ts:128`. Root eligibility is decided by membership in
literal English arrays (`["go","see","eat",…]`); the comment admits `posOf` was skipped to
avoid an import cycle. Resolve the cycle (or inject POS) and use `posOf(meaning)`. Also fixes
the **Bantu noun-class prefix bug**: ku-/mu-/ka- stored as `derivationalSuffixes` with
`category=undefined`+productive → smeared onto conjunctions/adjectives. Give them real
categories or exclude `category===undefined` affixes from the productive path.

**5b. Gate paradigm-creating pathways on typology** —
`semantics/grammaticalization.ts:105`, `evolve.ts:241 maybeArticleEmergence`. Isolating langs
grow case/mood/articles from the universal English/IE pathway map. Gate pathway firing on the
language's declared `morphological:paradigms` module / `grammaticalisedAxes`, or auto-derive
`grammaticalisedAxes` from each preset's typology at construction. Article emergence keyed on
a per-family propensity, not just cultural tier.

**5c. Conservation brakes off the concept registry, not English glosses** —
`apply.ts:348 SWADESH_CONTENT_CORE`, `frequency.ts:11 DEFAULT_FREQUENCY_HINTS` (89 English
hints for 707 words). Drive the Swadesh-stability + content/function brakes off concept
registry POS/coreness fields; broaden seed frequency coverage. (Overlaps Phase 6.)

**5d. Ablaut/umlaut conditioned by real sound change, not a German/English template** —
`evolve.ts:737 VOWEL_MUTATIONS`, `morphology/ablaut.ts:93`. Trigger ablaut emergence off an
actual recorded vowel-affecting sound change in the word's history, not a random pick from a
hardcoded i-umlaut-shaped map.

**Breakage:** re-baseline; some presets gain/lose derivation ability.
**Verify (scorecard):** non-English presets derive agentives from their own roots; isolating
presets don't spontaneously grow fusional case; no `because-mu-` artifacts.
**Effort:** M. **Risk:** medium (the import-cycle resolution in 5a needs care).

---

## Phase 6 — Recalibrate rates (LAST — tuning after mechanisms are fixed)

Audit theme D. Do last: phases 1/4 change the effective rates, so calibrate once they're in.

**6a. Frequency = Zipfian usage, not change-event accumulation** —
`lexicon/frequencyDynamics.ts:15`. Bumps (+0.04 per sound change, +0.06–0.1 per actuation/
borrow) dominate the ×0.998 decay → hints saturate at the 0.95 cap; "frequency" becomes word
age. Design: seed a Zipfian distribution by rank and keep it roughly stable (mild drift);
stop (or sharply cap) bumping frequency ON sound-change — changing a word shouldn't make it
more frequent. Make decay outpace residual bumps so the distribution spreads across
0.05–0.95.

**6b. Stronger, graduated high-frequency brake** — `apply.ts:446` (`freqExponent *= 0.6`
only at freq ≥ 0.85, loosened from 0.4). Restore/strengthen a graduated brake so high-freq
core vocab erodes dramatically slower than rare words (the frequency-conservation universal).

**6c. Core-vocab erosion to glottochronological rate** — `config.ts:52 globalRate=0.05`.
With 6a/6b giving real frequency signal, tune effective per-millennium throughput so
Swadesh-core 1000-yr retention lands ~80% and the retention curve decays MONOTONICALLY.

**6d. Split timing tied to population; binary-biased cladogenesis** — `steps/tree.ts:42`
(flat 0.012/gen), `tree/split.ts:102/336` (2–9-way multifurcation). Tie split probability to
population/territory growth (cut the gen-22-vs-gen-166 variance); bias `pickChildCount`
toward 2 so hard polytomies are the exception.

**Breakage:** re-baseline; tuning pass touches the most-locked rates.
**Verify (scorecard):** Swadesh retention ~80%/millennium and monotonic; Zipfian frequency
(rank-1/rank-100 ≫ 1); high-freq erosion ≪ low-freq; split timing low-variance.
**Effort:** M. **Risk:** medium (calibration is iterative — use the scorecard to converge).

---

## Sequencing & dependencies

```
0 (scorecard)  ──►  1 (phonology)  ──►  2 (word-formation) ──┐
                                   └──►  3 (semantics) ───────┤
                                                              ▼
                                          4 (cycles, structural) ──► 5 (agnosticism) ──► 6 (calibration, last)
```
- **0 before everything** — can't gate behavioural change without the scorecard.
- **1 before 6** — phonology integrity changes the erosion rate 6 must calibrate.
- **2 & 3 share the curated colex/neighbor graph** — do 3a (graph-driven) early; 2a consumes it.
- **4 is the keystone for "feels right"** but the riskiest; land 1–3 (visible, lower-risk
  wins) first, then 4 in sub-PRs.
- **4e (word death) depends on 6a** (frequency signal) — either do 6a early as a prerequisite
  to 4e, or land 4e after 6a. (The one cross-phase ordering wrinkle.)
- **5 & 6 overlap on the English-gloss frequency table** (5c/6a) — coordinate.
- Each phase: its own reviewed re-baseline + green full `RUN_SLOW` + scorecard within band.

## Risks & mitigations
- **Re-baseline fatigue / hidden regressions:** the scorecard + full RUN_SLOW behavioural
  suite are the gate (the audit was only possible because RUN_SLOW had rotted — keep it green
  every phase). [[one-vitest-at-a-time-full-output]]
- **Performance:** Phases 1 & 4 touch hot paths (apply.ts ~65%). Each must show no measurable
  regression; keep new per-word work O(1)/O(inventory).
- **Over-correction:** these interact (fix phonology erosion → divergence rate changes →
  recalibrate). That's WHY 6 is last and scorecard-driven, not guessed.
- **"Tests are tools":** when a phase re-baselines, decide what's CORRECT from the scorecard
  first, then set the lock — don't lock whatever the code happens to emit. [[tests-are-tools-not-ground-truth]]

## What we are NOT changing (healthy — protect)
Hand-written sound-change CATALOG; curated COLEX_PAIRS; borrowing hierarchy (Thomason/Haugen);
grammaticalization pathway DIRECTIONS; productivity threshold (no -er-er pyramids); closed-
class shielding; tree-branch shape; B2 de-anglicization (recorded-structure reads);
phonotactic repair; collision-revert; endangerment ladder. Regression-test these per phase.
