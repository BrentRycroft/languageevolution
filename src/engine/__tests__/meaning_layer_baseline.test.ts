import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetGermanic } from "../presets/germanic";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { formToString } from "../phonology/ipa";
import { fnv1a } from "../rng";
import { lexKeys, lexGet } from "../lexicon/access";
import type { SimulationConfig } from "../types";

/**
 * meaning_layer_baseline.test.ts — the byte-identical SAFETY NET for the
 * meaning-layer migration (see docs/planning/archive/MEANING-LAYER-MIGRATION.md).
 *
 * The migration decouples word MEANING from English strings and turns words
 * into morphological building blocks. Its hard invariant is byte-identical
 * determinism: no phase may change any language's evolved forms. This test
 * locks a hash of every preset's lexicon (meaning → IPA form) + word forms.
 *
 * Two tiers:
 *  - FAST (every run): gen-0 forms for all 6 presets — catches init/shim
 *    regressions cheaply (no stepping).
 *  - RUN_SLOW: the full 30-step trajectory for all 6 presets — catches any
 *    determinism perturbation along the evolution path. Run this explicitly at
 *    each migration phase gate: `RUN_SLOW=1 npx vitest run meaning_layer_baseline`.
 *
 * Expected hashes are the CURRENT (pre-migration) baseline. If a future change
 * legitimately alters forms, re-baseline DELIBERATELY (and justify it).
 */

const RUN_SLOW = !!(globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.RUN_SLOW;

const PRESETS: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  bantu: presetBantu,
  romance: presetRomance,
  germanic: presetGermanic,
  tokipona: presetTokipona,
  english: presetEnglish,
};

const STEPS = 30;

/** Deterministic hash of every tree node's sorted lexicon forms + word forms. */
function signature(sim: ReturnType<typeof createSimulation>): string {
  const tree = sim.getState().tree;
  const parts: string[] = [];
  for (const id of Object.keys(tree).sort()) {
    const lang = tree[id]!.language;
    // Route through the accessor seam (lexKeys/lexGet) so the signature locks
    // GLOSS → form, not the physical store key. Pre-flip the seam yields the
    // glosses directly; post-flip (concept re-key R2) it resolves the
    // ConceptId store key back to its gloss. Either way the linguistic
    // content — what this test guards — is identical, so the locked hashes
    // survive a pure storage refactor and still catch any real form change.
    // NB: sort the GLOSSES (as the original Object.keys(...).sort() did), not
    // the combined "gloss=form" strings — a prefix gloss with a low-ASCII
    // continuation (e.g. "a" vs "a-thing") would otherwise reorder.
    const lex = lexKeys(lang)
      .sort()
      .map((m) => `${m}=${formToString(lexGet(lang, m)!)}`)
      .join("|");
    const words = (lang.words ?? [])
      .map((w) => w.formKey)
      .sort()
      .join("|");
    parts.push(`${id}#${lex}#${words}`);
  }
  return fnv1a(parts.join("\n")).toString(16).padStart(8, "0");
}

// Baseline hashes from the current (pre-migration) engine. Locked.
// GEN0 re-baselined 2026-06-01 (item 3 enrichment, all presets): each preset
// gained appended seedCompounds built from existing primitives (verified to
// materialise as exact part concatenations), so each gen-0 lexicon gained those
// entries. Per preset (authentic, family-calibrated): pie +master (*dem-pótis);
// bantu +student/citizen/fisherman (mwana/mu-+X); romance +wallet/scarecrow (V+N);
// germanic +rainbow/firewood/daylight/seabird (N+N); english +rainbow/firewood/
// seaside/sunflower/footpath; tokipona +king/soldier/city (landed 2026-05-31).
const GEN0: Record<string, string> = {
  pie: "8e1e516d",
  bantu: "cb709a71",
  romance: "28661e99",
  germanic: "442a10cb",
  tokipona: "963106db",
  english: "77c30563",
};
// RE-BASELINED 2026-05-31 (B1-Y — content-addressed per-concept RNG). ALL SIX
// presets shifted, as expected and intended: sound change in apply.ts now draws
// from a per-concept sub-rng seeded by `config.seed|lang.id|generation|conceptId`
// instead of the shared sequential stream, so a word's phonological draws depend
// on its own identity rather than its position in the iteration order. This is
// the ONE deliberate full-trajectory re-baseline the migration plan reserved for
// the (Y) work (see docs/planning/archive/STAGE-B-PLAN.md §5). GEN0 is unchanged
// (no draws in the seed state). The payoff: adding vocabulary no longer scrambles
// existing words' sound trajectories — verified 0/427 perturbation in an
// append-a-concept probe. Machinery cost is negligible (isolated per-call delta
// within noise). Reproducibility-determinism is fully preserved (same config →
// identical output; re-run confirmed).
// GENN re-baselined 2026-06-01 (item 3 enrichment): each preset's gen-30 shifted
// by ITS OWN appended compounds + their localized genesis/obsolescence cascade.
// Each enrichment is ISOLATED — appending one preset's compounds left every OTHER
// preset byte-identical (B1-Y insulates existing words' per-concept sound
// trajectories), proven by the staged re-baseline (tokipona unchanged when the
// other 5 were enriched, and vice-versa). This is the clean, reviewable enrichment
// diff B1-Y was built to enable.
// GENN re-baselined 2026-06-01 (genesis-records-coinage, fossilized records):
// genesis now stamps the structure of COINED compounds/derivations into
// lang.compounds (recordCoinageStructure, fossilized:true so the recompose
// machinery leaves the already-final coinage form alone), so bootstrapNeologism-
// Neighbors integrates a coinage's frequency + semantic neighbours from its content
// constituents — like seed compounds. Only bantu/romance/tokipona shifted (they coin
// bootstrappable compounds within 30 gens); pie/germanic/english are BYTE-IDENTICAL
// to their enrichment values (the record is invisible without recompose). GEN0
// unchanged (no coinage at gen 0). Makes recordedParts() cover coinage (unblocks
// item-4 batch 2). NB: an earlier fossilized:false attempt let updateCompounds
// re-derive coinages post-UR-snapshot and degraded a PIE word to an illegal
// no-nucleus "f" — caught by ipa_pie syllabicity, hence fossilized:true.
// GENN re-baselined 2026-06-01 (item-4 batch 2, derivation skip-guards): the
// productive-derivation base guards in attemptProductiveDerivation
// (targetedDerivation.ts) and pickRuntimeDerivedMeaning (morphology/derivation.ts)
// now read the language's RECORDED compound/derivation structure
// (`recordedParts(lang,m) !== null`, covering coinage post-genesis-recording) OR a
// bound morpheme, instead of the anglocentric `m.includes("-")` gloss-hyphen test.
// Net effect: the item-3 NON-hyphen seed compounds (rainbow, firewood, king, …) —
// previously eligible as derivation bases because their gloss has no dash — are now
// correctly skipped as already-structured words. ALL SIX presets shifted (each
// gained such compounds in item 3); zero -er-er pyramids (probe: 0/6) confirming
// recordedParts covers coinage. GEN0 unchanged (no coinage at gen 0). NB: the
// matching 60-gen ipa_pie run drove out two LATENT final-erosion bugs (cliticize
// 3aeae6b, grammaticalization-fusion 86e98ca) — both committed separately, both
// byte-identical to THESE hashes (the malformation they fix is post-gen-30).
// GENN re-baselined 2026-06-02 (evolution-realism Phase 1b — lenition/
// fortition counterweight + /h/ exit). Two deliberate phonology changes
// shift every preset's gen-30 trajectory (GEN0 unchanged — no phonology at
// gen 0): (1) lenition/voicing bias now DAMPS as the inventory's voiced-
// obstruent share saturates (self-limiting; voiceless stops survive
// instead of being eroded one-way — scorecard voiceless-stop onset share
// rose across presets); (2) deletion.h_initial enabled by default and no
// longer unstressed-only, giving /h/ an EXIT instead of being an absorbing
// onset sink (scorecard /h/ share: romance 5.9→0%, bantu 11.5→2.1%,
// pie 8.2→3.8%). This is an approved milestone re-baseline (see
// docs/planning/EVOLUTION-REALISM-MILESTONE.md §1b) — the gate is the
// realism scorecard, not byte-identity. Reproducibility-determinism is
// preserved (same config → identical output; re-run confirmed).
// GENN re-baselined 2026-06-02 (evolution-realism Phase 2 — word-formation
// coherence, 2a+2b+2c). All coinage mechanisms now require SEMANTICALLY-
// COHERENT parts instead of random lexemes:
//  2a compound.ts — prefers the concept's curated cross-linguistic
//     `decomposition` (head-final kenning: breeze=small+wind, hail=hard+rain,
//     hurricane=big+storm); refuses a sibling mashup for a decomposable
//     target whose parts aren't lexicalised yet.
//  2b reduplication.ts/clipping.ts — base must be a RELATED root (the
//     mechanisms previously reduplicated/clipped a random word and filed it
//     under an unrelated target; reduplication literally did `void target`).
//  2c genesis/catalog.ts — dropped the fully-random pickMeanings(rng,2)
//     fallback in the legacy spontaneous-compound rule (a second mashup
//     generator); always requires a related pair now.
// Every preset coining within 30 gens shifts. GEN0 unchanged (no coinage at
// gen 0). Approved milestone re-baseline; scorecard compound decomp-match
// rose from a meaningless 0% to 80–100%. Determinism preserved.
// GENN re-baselined 2026-06-02 (evolution-realism Phase 3a+3b — semantic-
// change integrity). Semantic drift now (3a) draws its candidate TARGET
// from the curated SEMANTIC_NEIGHBORS + recorded-colexification graph as the
// PRIMARY source, demoting the degenerate 12-dim embedding (where antonyms
// share a centroid) and whole-cluster relatedMeanings to fallbacks; and (3b)
// excludes a word's curated gradable antonym from the candidate pool (no
// alive→dead drift). Different drift targets shift every preset that drifts
// within 30 gens. GEN0 unchanged. Approved milestone re-baseline; scorecard
// antonym-drifts=0 and drift targets land on curated neighbours where the
// source has them. Determinism preserved.
// GENN re-baselined 2026-06-02 (evolution-realism Phase 3d — taboo on
// referents). maybeTabooReplace now gates candidates on a curated
// dangerous-referent set (death / supernatural / predator / disease / sex /
// in-law) instead of freq ≥ 0.7, so it no longer tabooes go/take/want/see.
// pie/romance/tokipona/english shifted (a taboo event fired on a different
// target within 30 gens); bantu/germanic byte-identical (no eligible
// referent fired in their 30-gen window). GEN0 unchanged.
// GENN re-baselined 2026-06-02 (evolution-realism Phase 4a — synthesis
// ratchet break). Two changes close the one-way "everything drifts
// polysynthetic" ratchet: (1) maybeDropCollapsedParadigm removes a paradigm
// whose affix has eroded to ∅ (surface-neutral — inflect() already bailed it
// to bare stem — but paradigm count, hence the synthesis target 0.8+0.2*count,
// could previously only GROW); it fires each grammar step via a new rng.chance
// draw, which reshuffles the shared stream → ALL SIX presets' gen-30
// trajectories shift. (2) stepTypologyDrift's synthesis target is now pulled
// DOWN by analytic case-marking (caseStrategy=adposition, hasCase=false), so a
// language can shed morphology (the Latin→French direction). Also routes
// stepTypologyDrift's type-drift event through the pushEvent cap chokepoint
// (was a raw push that could tip a long leaf to 81 events). GEN0 unchanged (no
// morphology at gen 0). Approved milestone re-baseline (gate = realism
// scorecard, not byte-identity). Determinism preserved (re-run confirmed).
// GENN re-baselined 2026-06-02 (evolution-realism Phase 4b/4c — grammaticalization
// cline + host-clitic reduction). Grammaticalization no longer TELEPORTS a free
// word to a bound affix in one gen: maybeGrammaticalize now routes a fresh word
// through the CLITIC stage (1) first and binds it into a paradigm only at a later
// transition (stage 2), using a phonologically-reduced bound allomorph
// (reduceToClitic) rather than the full free form. Fusion (stage 3) and
// maybeCliticize now reduce the BOUND AFFIX, never the free dictionary lemma
// (4c: pre-fix `form.slice(0,-1)` eroded the lemma itself, belly→bell). Only
// germanic/tokipona/english shifted — they grammaticalize/cliticize within 30
// gens; pie/bantu/romance are BYTE-IDENTICAL to their 4a values (no changed-path
// firing in their 30-gen window). GEN0 unchanged. Approved milestone re-baseline;
// determinism preserved (re-run confirmed).
// GENN re-baselined 2026-06-02 (evolution-realism Phase 5 — de-anglicise
// behaviour, 5a+5b+5d). Three agnosticism fixes shift every preset's gen-30
// trajectory: (5a) productive derivation chooses roots by the engine's posOf,
// not a hardcoded English verb/adjective wordlist, and excludes categoryless
// (Bantu noun-class prefix) suffixes from the productive path; (5b) the
// grammaticalisation pathway gate is now ALWAYS-ON, derived from each language's
// own typology (`deriveGrammaticalisedAxes`) when not explicitly declared, so an
// isolating language no longer grows IE case/tense/mood — plus a typological
// article-emergence gate (classifier / strongly-isolating languages don't
// grammaticalise articles from cultural tier alone); (5d) ablaut/umlaut
// irregulars now draw their vowel alternation from the language's OWN recorded
// vowel sound-changes (vowel_shift/reduction/harmony outputMaps), not a fixed
// German i-umlaut template. GEN0 unchanged. (5c — concept-registry-driven
// conservation brakes — folded into Phase 6a, where the frequency table is
// rebuilt; both flow from the same 89-entry DEFAULT_FREQUENCY_HINTS source.)
// Approved milestone re-baseline (gate = scorecard); determinism preserved.
// GENN re-baselined 2026-06-03 (evolution-realism Phase 6 — recalibrate rates,
// 6a+4e+6b+6d, + folded 5c). Frequency is no longer change-event accumulation:
// (6a) every concept gets a Zipfian-by-rank SEED frequency from its registry
// tier (the agnostic replacement for the 89-entry English DEFAULT_FREQUENCY_HINTS
// — the 5c broadening), the sound-change frequency bumps (+0.04 mutation, +0.06
// actuation) are GONE, and decayFrequencies now mean-reverts toward that seed
// instead of decaying toward zero — so hints stop saturating at the 0.95 cap
// (scorecard cap-pinned 12.7%→0%) and core Swadesh retention lands ~80%/1000yr.
// (6b) the high-frequency erosion brake is now GRADUATED in frequency, replacing
// the discrete hardcoded SWADESH_CONTENT_CORE ×0.6 list (also the 5c
// de-anglicisation of the brake). (4e) a low-frequency word-DEATH channel in
// stepObsolescence (tier-0/closed-class protected) consumes rng draws. (6d)
// split probability ×popFactor + binary-biased pickChildCount (85%→2) reshape
// the tree. All six presets shift; GEN0 unchanged (no dynamics at gen 0).
// Approved milestone re-baseline (gate = scorecard); determinism preserved.
const GENN: Record<string, string> = {
  pie: "edc6570b",
  bantu: "8bf74abc",
  romance: "9e9c4ad6",
  germanic: "b1be7ef7",
  tokipona: "ab0bee33",
  english: "a24a3ee6",
};

describe("meaning-layer baseline — gen-0 forms byte-identical (fast)", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: gen-0 lexicon + word forms match the locked baseline`, () => {
      const sig = signature(createSimulation(build()));
      expect(sig, `${name} gen-0 byte-identity`).toBe(GEN0[name]);
    });
  }
});

describe("meaning-layer baseline — full trajectory byte-identical (RUN_SLOW)", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it.skipIf(!RUN_SLOW)(`${name}: lexicon + word forms match after ${STEPS} steps`, () => {
      const sim = createSimulation(build());
      for (let i = 0; i < STEPS; i++) sim.step();
      expect(signature(sim), `${name} gen-${STEPS} byte-identity`).toBe(GENN[name]);
    });
  }
});
