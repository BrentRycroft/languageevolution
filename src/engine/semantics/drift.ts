import type { Language } from "../types";
import { satGet, satSet, satDelete } from "../lexicon/satellites";
import type { Rng } from "../rng";
import { neighborsOf } from "./neighbors";
import { relatedMeanings, clusterOf } from "./clusters";
import { nearestMeanings } from "./embeddings";
import { cosineFixed } from "./vec";
import { lexPoint, meaningPointFor, glideMeaningPoint } from "./meaningPoint";
import { axisBias } from "./readoutAxes";
import { areAntonyms } from "./antonyms";
import { colexWith, isRegisteredConcept } from "../lexicon/concepts";
import { complexityFor } from "../lexicon/complexity";
import { isFormLegal } from "../phonology/wordShape";
import { samePOS, isClosedClass, posOf } from "../lexicon/pos";
import { setLexiconForm, deleteMeaning, PROTECTED_MEANINGS } from "../lexicon/mutate";
import { lexGet, lexHas, lexKeys } from "../lexicon/access";
/**
 * drift.ts
 *
 * Semantic drift, recarving (split / merge), bleaching, colexification, neighbour relations. Key exports: SemanticShiftKind, SemanticDrift, classifyShift.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

// Phase 26e: corenessResistance import removed. Swadesh-membership-based
// drift protection was redundant with Phase 24c's frequency-direction
// split (high-freq content words are already conservative via
// freqInput = 1 - freq), and not accurate to real etymology.
import { CONCEPT_IDS, tierOf, zipfFrequencyFor, type Tier } from "../lexicon/concepts";
import { recordColexification } from "./colexification";
import { BASIC_240 } from "../lexicon/basic240";

const EXPANSION_IDS_BY_TIER: ReadonlyMap<Tier, readonly string[]> = (() => {
  const basicSet = new Set<string>(BASIC_240);
  const buckets: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const id of CONCEPT_IDS) {
    if (basicSet.has(id)) continue;
    const t = tierOf(id);
    buckets[t]!.push(id);
  }
  const m = new Map<Tier, readonly string[]>();
  m.set(0, Object.freeze([...buckets[0]!]));
  m.set(
    1 as Tier,
    Object.freeze([...buckets[0]!, ...buckets[1]!]),
  );
  m.set(
    2 as Tier,
    Object.freeze([...buckets[0]!, ...buckets[1]!, ...buckets[2]!]),
  );
  m.set(
    3 as Tier,
    Object.freeze([
      ...buckets[0]!,
      ...buckets[1]!,
      ...buckets[2]!,
      ...buckets[3]!,
    ]),
  );
  return m;
})();

/**
 * LANE-C — strength of the Zipfian frequency-retention skip in
 * driftOneMeaning. A meaning is passed over for drift with probability
 * `frequency × RETENTION_STRENGTH`, so the most frequent core meanings
 * (freq≈0.93) are skipped ~84% of the time while peripheral meanings
 * (freq≈0.1) are skipped ~9% of the time. < 1 so even a top-frequency
 * meaning can still drift occasionally (PIE *méh₂tēr DID shift senses
 * across families), preserving deep-time turnover.
 */
const RETENTION_STRENGTH = 0.9;

/**
 * MEGA-overhaul (hybrid readout-axes): strength of the valence-axis bias on evaluative
 * drift. The source's position on the embedding's valence axis (≈ −1 … +1) scales its
 * pejoration weight by `1 + VALENCE_DRIFT_BIAS·valence` (and amelioration by the inverse),
 * so "good"-flavoured words pejorate more readily than already-negative ones — the
 * attested directional asymmetry. Modest, so it sharpens the register/frequency tendency
 * rather than overriding it.
 */
const VALENCE_DRIFT_BIAS = 0.3;

export type SemanticShiftKind =
  | "metonymy"
  | "metaphor"
  | "narrowing"
  | "broadening"
  | "amelioration"
  | "pejoration";

export interface SemanticDrift {
  from: string;
  to: string;
  kind: SemanticShiftKind;
  takeover?: boolean;
  polysemous?: boolean;
}

export function classifyShift(
  from: string,
  to: string,
  rng?: { next: () => number },
  fromRegister?: "high" | "low",
  lang?: Language,
  // LANE-C: optional source frequency in [0,1]. When supplied, biases the
  // direction of generality-changing shifts (Traugott: high-frequency,
  // general words tend to BROADEN; rare, specific words NARROW) and seeds a
  // weak baseline evaluative drift (the pejoration bias, below). Optional and
  // guarded so the no-freq callers (incl. the classifyShift unit test) keep
  // byte-identical behaviour.
  fromFreq?: number,
): SemanticShiftKind {
  const cFrom = clusterOf(from);
  const cTo = clusterOf(to);
  // Plan 7: distance from the meanings' CURRENT (possibly glided) points, not the static
  // anchors — drift navigates the living space. No-lang callers (the unit test) keep the
  // static lexPoint, so their behaviour is unchanged.
  const similarity = lang
    ? cosineFixed(meaningPointFor(lang, from), meaningPointFor(lang, to))
    : cosineFixed(lexPoint(from), lexPoint(to));
  const sameCluster = cFrom && cTo && cFrom === cTo;
  const complexityDelta = complexityFor(to) - complexityFor(from);

  const weights: Partial<Record<SemanticShiftKind, number>> = {};
  if (sameCluster && similarity >= 0.6) weights.metonymy = 3;
  if (complexityDelta <= -1) weights.narrowing = 2.5;
  if (complexityDelta >= 1) weights.broadening = 2.5;
  if (similarity >= 0.45) weights.metonymy = (weights.metonymy ?? 0) + 1.5;
  weights.metaphor = (weights.metaphor ?? 0) + 1;
  // LANE-C — pejoration asymmetry (Traugott & Dasher; Ullmann): evaluative
  // semantic change is heavily skewed NEGATIVE cross-linguistically (silly
  // holy→foolish, knave boy→villain, villain farmhand→criminal, vulgar
  // common→crude). Register still modulates — a "high"-register word can
  // ameliorate, a "low"-register word pejorates harder — but pejoration is
  // the more probable evaluative outcome even at neutral register, so it
  // carries a small baseline weight that amelioration does not.
  if (fromRegister === "high") {
    weights.amelioration = 1.2;
    weights.pejoration = (weights.pejoration ?? 0) + 0.6;
  } else if (fromRegister === "low") {
    weights.pejoration = (weights.pejoration ?? 0) + 1.6;
  } else if (fromFreq !== undefined) {
    // Neutral register but frequency known: a weak negative baseline so
    // some evaluative drift occurs without a register tag (the attested
    // default direction).
    weights.pejoration = (weights.pejoration ?? 0) + 0.5;
  }
  // LANE-C — frequency-conditioned generality (Traugott): bias the
  // direction of the generality shift by the source's corpus frequency.
  // Common, schematic words generalise (broaden); rare, specific words
  // restrict (narrow). Only nudges weights that the complexity heuristic
  // already opened, so it sharpens rather than overrides it.
  if (fromFreq !== undefined) {
    if (weights.broadening !== undefined) weights.broadening += fromFreq;
    if (weights.narrowing !== undefined) weights.narrowing += 1 - fromFreq;
  }

  // MEGA-overhaul (hybrid readout-axes ACTIVATED): give evaluative drift a DIRECTION from
  // the embedding's valence axis. Pejoration is the dominant evaluative cline, and a
  // positively-valenced source ("good"-flavoured) has the most room to fall — so its
  // pejoration weight scales UP and its amelioration DOWN; an already-negative source
  // resists further pejoration. This turns the interpretable readout-axes layer from an
  // inert readout into a real bias on the dense-space drift (the "hybrid" half of the
  // meaning model). It only touches the evaluative weights the register/frequency
  // heuristics already opened — so it sharpens an existing tendency rather than inventing
  // drift, and stays a no-op for the register/freq-free classifyShift unit callers (which
  // never set these weights).
  if (isRegisteredConcept(from)) {
    if (weights.pejoration !== undefined) {
      weights.pejoration *= axisBias(from, "valence", VALENCE_DRIFT_BIAS, true);
    }
    if (weights.amelioration !== undefined) {
      weights.amelioration *= axisBias(from, "valence", -VALENCE_DRIFT_BIAS, true);
    }
  }

  if (!rng) {
    let bestKind: SemanticShiftKind = "metaphor";
    let bestW = 0;
    for (const [k, w] of Object.entries(weights)) {
      if ((w ?? 0) > bestW) {
        bestW = w ?? 0;
        bestKind = k as SemanticShiftKind;
      }
    }
    return bestKind;
  }
  const entries = Object.entries(weights) as Array<[SemanticShiftKind, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return "metaphor";
  let r = rng.next() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

export type NeighborOverride = Record<string, string[]>;

export function driftOneMeaning(
  lang: Language,
  rng: Rng,
  override?: NeighborOverride,
  generation: number = 0,
): SemanticDrift | null {
  const meanings = lexKeys(lang);
  if (meanings.length === 0) return null;
  const shuffled = meanings.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  for (const strict of [true, false]) {
    for (const m of shuffled) {
      // Phase 26c: closed-class words (DET, AUX, PREP, CONJ, PRON, NEG,
      // COP) are NOT subject to semantic drift. Their meanings are
      // tightly tied to grammatical function and don't shift the way
      // content words do (English "the" never drifted into a content
      // noun; PIE *de-/to- demonstratives stayed demonstrative across
      // millennia in every IE branch). Drift mechanism gates here.
      if (isClosedClass(posOf(m))) continue;
      const reg = satGet(lang, "registerOf", m);
      if (reg === "high" && rng.chance(0.5)) continue;
      // LANE-C — Zipfian frequency-retention law (Pagel, Atkinson & Meade
      // 2007; Zipf): the rate of semantic (and lexical) change is inversely
      // proportional to a word's corpus frequency. High-frequency core
      // meanings are the slowest to shift; rare words turn over fast. The
      // drift loop previously took the FIRST eligible shuffled meaning with
      // no frequency weighting, so "water"/"eat" were as likely to drift as
      // a tier-3 rarity. Skip a candidate with probability proportional to
      // its frequency (≈0.85 for the core, ≈0.1 for the periphery), falling
      // through to the next shuffled meaning. The RNG draw is APPENDED after
      // the high-register draw above to keep the per-step draw order local.
      const freqHint = satGet(lang, "wordFrequencyHints", m) ?? zipfFrequencyFor(m);
      if (rng.chance(freqHint * RETENTION_STRENGTH)) continue;
      // Phase 26e: removed Swadesh-coreness drift-skip. The coreness-
      // based protection was redundant with Phase 24c's frequency-
      // direction split (high-freq content words are already conservative
      // via freqInput = 1 - freq) and double-protected Swadesh content
      // words like water/mother/father from any drift. Real etymology
      // shows these DO drift across families (PIE *méh₂tēr → English
      // mother / Sanskrit mātṛ́ / Latin māter / Greek mḗtēr).
      const overrideNeighbors = override?.[m];
      const langTier = (lang.culturalTier ?? 0) as Tier;
      const expansionExtras = EXPANSION_IDS_BY_TIER.get(langTier) ?? [];
      const candidates =
        expansionExtras.length === 0
          ? meanings
          : Array.from(new Set([...meanings, ...expansionExtras]));
      // Phase 3a (evolution-realism): drive drift from the CURATED graph —
      // SEMANTIC_NEIGHBORS (CLICS-aligned) + recorded colexifications — as
      // the PRIMARY candidate source, demoting the degenerate 12-dim
      // embedding (where antonyms share a centroid: cos(water,fire)=0.99) and
      // the coarse whole-cluster relatedMeanings to fallbacks. The curated
      // graph is tight and attested, so drift targets become realistic and
      // it never links a word to its element-/antonym-twin.
      const curated = Array.from(new Set([...neighborsOf(m), ...colexWith(m)]));
      const embeddingNearest =
        curated.length > 0 ? [] : nearestMeanings(m, candidates, 5);
      const related = relatedMeanings(m);
      const rawNeighbors =
        overrideNeighbors && overrideNeighbors.length > 0
          ? overrideNeighbors
          : curated.length > 0
            ? curated
            : embeddingNearest.length > 0
              ? embeddingNearest
              : related.length > 0
                ? related
                : neighborsOf(m);
      // Phase 3b: a content word must not drift into its own curated
      // (gradable/complementary) antonym. Excludes alive→dead, hot→cold,
      // etc.; converses (brother/sister) are NOT in the set and stay
      // eligible (they legitimately colexify).
      const neighbors = rawNeighbors.filter((n) => n !== m && !areAntonyms(m, n));
      if (neighbors.length === 0) continue;
      const posCompatible = neighbors.filter((n) => samePOS(m, n));
      const pool = posCompatible.length > 0 ? posCompatible : neighbors;
      const target = pool[rng.int(pool.length)]!;
      if (target === m) continue;
      const targetOccupied = lexHas(lang, target);
      if (strict && targetOccupied) continue;
      // `m` is a lexicon key, but the key set can include bound morphemes / affix
      // entries (lexicon-lifecycle + morphology lanes) that have no standalone form.
      // Those aren't driftable content words — skip rather than crash isFormLegal on
      // an undefined form. (Was an unsafe `!` assertion.)
      const form = lexGet(lang, m);
      if (!form) continue;
      if (!isFormLegal(target, form)) continue;
      const kind = classifyShift(m, target, rng, satGet(lang, "registerOf", m), lang, freqHint);
      // Phase 73e: a PROTECTED source meaning (be/eat/go/…) cannot be dropped
      // by deleteMeaning's Phase-71b guard. Pre-fix, drift still copied its
      // form to `target` and reported polysemous:false while the guard silently
      // kept `m` — leaving the form on BOTH meanings: an unrecorded
      // colexification with m's freq/register wrongly purged. Treat a protected
      // source as a polysemous (colexifying) drift so the bookkeeping matches
      // reality: m is kept, its freq/register are preserved, and the m↔target
      // colexification is recorded. The protected check is OR'd LAST so the rng
      // draw order — and thus determinism / every other meaning's trajectory —
      // is unchanged.
      const polysemous =
        (!targetOccupied &&
          (kind === "metaphor" || kind === "metonymy") &&
          rng.chance(0.3)) ||
        PROTECTED_MEANINGS.has(m);
      // Phase 29 Tranche 1a: route through chokepoint so words stays in sync.
      setLexiconForm(lang, target, form, { bornGeneration: 0, origin: lang.wordOrigin[m] ?? "drift" });
      const oldFreq = satGet(lang, "wordFrequencyHints", m);
      if (oldFreq !== undefined) {
        satSet(lang, "wordFrequencyHints", target, oldFreq);
      }
      if (!polysemous) satDelete(lang, "wordFrequencyHints", m);
      const oldReg = satGet(lang, "registerOf", m);
      if (oldReg !== undefined) {
        satSet(lang, "registerOf", target, oldReg);
      }
      if (!polysemous && oldReg !== undefined) satDelete(lang, "registerOf", m);
      if (lang.wordOrigin[m] !== undefined && !lang.wordOrigin[target]) {
        lang.wordOrigin[target] = lang.wordOrigin[m]!;
      }
      const lastChange = lang.lastChangeGeneration[m];
      if (lastChange !== undefined && lang.lastChangeGeneration[target] === undefined) {
        lang.lastChangeGeneration[target] = lastChange;
      }
      if (!polysemous) {
        // Phase 72d-2 (defer-1a): drift drops the source meaning when
        // it isn't kept polysemously alongside target. Record the
        // pathway so reverse translation can resolve "lost" senses.
        deleteMeaning(lang, m, {
          mergedInto: target,
          generation,
          reason: `drift:${kind}`,
        });
      } else {
        // Both meanings now share the same form. Persist the relationship
        // so the UI / reconstruction can surface "concept m is colexified
        // with target in this language."
        recordColexification(lang, m, target);
        // Plan 7: a kept metaphor/metonymy shift glides m's point toward the target —
        // the word's meaning drifts toward the sense it colexified with.
        if (kind === "metaphor" || kind === "metonymy") {
          glideMeaningPoint(lang, m, target);
        }
      }
      return {
        from: m,
        to: target,
        kind,
        takeover: targetOccupied,
        polysemous: polysemous || undefined,
      };
    }
  }
  return null;
}
