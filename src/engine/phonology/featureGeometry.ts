import type { Phoneme } from "../types";
import type { ConsonantFeatures, VowelFeatures, FeatureBundle, Place, Manner } from "./features";
import { featuresOf } from "./features";

/**
 * Phase 59 T3: feature-distance helpers for language-custom output
 * proposals.
 *
 * When a sound-change template wants to lenite /p/ to a fricative,
 * but the language doesn't carry /f/, the proposal previously
 * failed entirely. Real languages would adapt to whatever fricative
 * IS in their inventory — Spanish chose [β], Greek chose [φ→f]
 * via a different path, and so on. closestByFeatures lets each
 * language solve the change in its own phonological terms.
 */

const PLACE_DISTANCE: Record<string, Record<string, number>> = {
  labial: { labial: 0, dental: 1, alveolar: 2, palatal: 3, velar: 4, uvular: 5, glottal: 6 },
  dental: { labial: 1, dental: 0, alveolar: 1, palatal: 2, velar: 3, uvular: 4, glottal: 5 },
  alveolar: { labial: 2, dental: 1, alveolar: 0, palatal: 1, velar: 2, uvular: 3, glottal: 4 },
  palatal: { labial: 3, dental: 2, alveolar: 1, palatal: 0, velar: 1, uvular: 2, glottal: 3 },
  velar: { labial: 4, dental: 3, alveolar: 2, palatal: 1, velar: 0, uvular: 1, glottal: 2 },
  uvular: { labial: 5, dental: 4, alveolar: 3, palatal: 2, velar: 1, uvular: 0, glottal: 1 },
  glottal: { labial: 6, dental: 5, alveolar: 4, palatal: 3, velar: 2, uvular: 1, glottal: 0 },
};

const MANNER_DISTANCE: Record<string, Record<string, number>> = {
  stop: { stop: 0, affricate: 1, fricative: 2, nasal: 1, lateral: 2, approximant: 3, trill: 2, tap: 2 },
  affricate: { stop: 1, affricate: 0, fricative: 1, nasal: 2, lateral: 2, approximant: 3, trill: 2, tap: 2 },
  fricative: { stop: 2, affricate: 1, fricative: 0, nasal: 2, lateral: 2, approximant: 1, trill: 1, tap: 1 },
  nasal: { stop: 1, affricate: 2, fricative: 2, nasal: 0, lateral: 2, approximant: 2, trill: 2, tap: 2 },
  lateral: { stop: 2, affricate: 2, fricative: 2, nasal: 2, lateral: 0, approximant: 1, trill: 2, tap: 2 },
  approximant: { stop: 3, affricate: 3, fricative: 1, nasal: 2, lateral: 1, approximant: 0, trill: 1, tap: 1 },
  trill: { stop: 2, affricate: 2, fricative: 1, nasal: 2, lateral: 2, approximant: 1, trill: 0, tap: 1 },
  tap: { stop: 2, affricate: 2, fricative: 1, nasal: 2, lateral: 2, approximant: 1, trill: 1, tap: 0 },
};

function consonantDistance(a: ConsonantFeatures, b: ConsonantFeatures): number {
  let d = 0;
  d += PLACE_DISTANCE[a.place]?.[b.place] ?? 3;
  d += MANNER_DISTANCE[a.manner]?.[b.manner] ?? 2;
  if (a.voice !== b.voice) d += 1;
  if (!!a.aspirated !== !!b.aspirated) d += 1;
  if (!!a.palatalised !== !!b.palatalised) d += 1;
  if (!!a.labialised !== !!b.labialised) d += 1;
  return d;
}

const HEIGHT_ORDER = ["high", "mid-high", "mid", "mid-low", "low"] as const;
const BACKNESS_ORDER = ["front", "central", "back"] as const;

function vowelDistance(a: VowelFeatures, b: VowelFeatures): number {
  const heightA = HEIGHT_ORDER.indexOf(a.height);
  const heightB = HEIGHT_ORDER.indexOf(b.height);
  const backA = BACKNESS_ORDER.indexOf(a.backness);
  const backB = BACKNESS_ORDER.indexOf(b.backness);
  let d = Math.abs(heightA - heightB) + Math.abs(backA - backB);
  if (a.round !== b.round) d += 1;
  if (!!a.nasal !== !!b.nasal) d += 1;
  if (!!a.long !== !!b.long) d += 0.5;
  return d;
}

function bundleDistance(a: FeatureBundle, b: FeatureBundle): number {
  if (a.type !== b.type) return 100;
  if (a.type === "consonant" && b.type === "consonant") {
    return consonantDistance(a, b);
  }
  if (a.type === "vowel" && b.type === "vowel") {
    return vowelDistance(a, b);
  }
  return 100;
}

/**
 * Phase 59 T3: pick the phoneme in `inventory` closest to the
 * feature bundle of `targetExemplar` (an idealised target like /f/
 * for "fricative-of-labial"). Returns null when no candidate is in
 * the same major class (consonant/vowel).
 */
export function closestByFeatures(
  targetExemplar: Phoneme,
  inventory: ReadonlyArray<Phoneme>,
  exclude?: Phoneme,
): Phoneme | null {
  const targetFeats = featuresOf(targetExemplar);
  if (!targetFeats) return null;
  let best: Phoneme | null = null;
  let bestDist = Infinity;
  for (const candidate of inventory) {
    if (candidate === exclude) continue;
    const feats = featuresOf(candidate);
    if (!feats) continue;
    if (feats.type !== targetFeats.type) continue;
    const d = bundleDistance(targetFeats, feats);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

// ── Phase 1a (evolution-realism): type-preserving feature repair ──
//
// Front-to-back place ordering and an obstruent-lenition openness scale.
// Manners ABSENT from OBSTRUENT_OPENNESS (nasal, liquid, tap, trill,
// lateral-approximant) are sonorants OFF the lenition cline: a change can
// only target them by EXACT manner match, never as a "nearest" lenition
// output (which is how /b/→/m/ and /k/→/f/ corruptions arose).
const PLACE_ORDER: Record<Place, number> = {
  labial: 0, labiodental: 1, dental: 2, alveolar: 3, postalveolar: 4,
  retroflex: 5, palatal: 6, velar: 7, uvular: 8, pharyngeal: 9, glottal: 10,
};
const OBSTRUENT_OPENNESS: Partial<Record<Manner, number>> = {
  stop: 0,
  affricate: 1,
  fricative: 2,
  "lateral-fricative": 2,
  approximant: 3,
  glide: 3,
};

/**
 * Is candidate `c` a TYPE-PRESERVING realisation of the intended change
 * `from`→`to`? For every feature dimension the rule MOVES, `c` must move
 * the same direction (place/manner) or reach the same value (voice);
 * for every dimension the rule HOLDS, `c` must hold it (within a 1-step
 * tolerance on the ordinal place/manner scales so a language lacking the
 * exact ideal output can still solve the change in its own terms).
 */
function preservesChangeType(
  from: ConsonantFeatures,
  to: ConsonantFeatures,
  c: ConsonantFeatures,
): boolean {
  // Voice: flip must be achieved; if held, must stay.
  if (to.voice !== from.voice) {
    if (c.voice !== to.voice) return false;
  } else if (c.voice !== from.voice) {
    return false;
  }

  // Manner along the obstruent-lenition cline.
  const fO = OBSTRUENT_OPENNESS[from.manner];
  const tO = OBSTRUENT_OPENNESS[to.manner];
  const cO = OBSTRUENT_OPENNESS[c.manner];
  if (tO === undefined) {
    // Sonorant / off-cline target (nasalisation, rhotacism, …): exact only.
    if (c.manner !== to.manner) return false;
  } else if (cO === undefined) {
    return false; // candidate is off-cline but the change is along it.
  } else if (fO === undefined || tO === fO) {
    if (cO !== tO) return false; // manner held → hold it exactly.
  } else if (Math.sign(cO - fO) !== Math.sign(tO - fO)) {
    return false; // manner moved → must move the same direction (no reversals).
  }

  // Place along the front→back ordering.
  const fP = PLACE_ORDER[from.place];
  const tP = PLACE_ORDER[to.place];
  const cP = PLACE_ORDER[c.place];
  if (tP === fP) {
    if (Math.abs(cP - fP) > 1) return false; // place held (±1 tolerance).
  } else if (tP < fP) {
    if (cP > fP || cP < tP - 1) return false; // fronting: stay in (to−1 … from].
  } else if (cP < fP || cP > tP + 1) {
    return false; // backing: stay in [from … to+1).
  }
  return true;
}

// ── Vowel-space type preservation ──
//
// A vowel change NAMES a direction along the height/backness/round axes
// (raising, lowering, fronting, backing, rounding). When the ideal output
// is absent the substitute must move the SAME direction on every axis the
// rule moves, and HOLD (±1 ordinal step) every axis it keeps — otherwise a
// "raising" rule could be repaired into a lowering, a "fronting" into a
// backing, etc. (the vowel analogue of the k→f / b→m corruption).
function preservesVowelChangeType(
  from: VowelFeatures,
  to: VowelFeatures,
  c: VowelFeatures,
): boolean {
  const fH = HEIGHT_ORDER.indexOf(from.height);
  const tH = HEIGHT_ORDER.indexOf(to.height);
  const cH = HEIGHT_ORDER.indexOf(c.height);
  if (tH === fH) {
    if (Math.abs(cH - fH) > 1) return false; // height held (±1 tolerance).
  } else if (Math.sign(cH - fH) !== Math.sign(tH - fH)) {
    return false; // height moved → must move the same direction.
  }

  const fB = BACKNESS_ORDER.indexOf(from.backness);
  const tB = BACKNESS_ORDER.indexOf(to.backness);
  const cB = BACKNESS_ORDER.indexOf(c.backness);
  if (tB === fB) {
    if (Math.abs(cB - fB) > 1) return false; // backness held (±1 tolerance).
  } else if (Math.sign(cB - fB) !== Math.sign(tB - fB)) {
    return false; // backness moved → must move the same direction.
  }

  // Rounding: flip must be achieved; if held, must stay.
  if (to.round !== from.round) {
    if (c.round !== to.round) return false;
  } else if (c.round !== from.round) {
    return false;
  }
  return true;
}

/**
 * Phase 1a: pick the best in-inventory TYPE-PRESERVING realisation of the
 * intended consonant change `from`→`to`. Among directionally-valid
 * candidates, choose the one closest to the ideal `to`. Returns null when
 * the inventory holds no candidate that preserves the change type — the
 * caller drops the rule rather than emit a corrupted (wrong-type) change.
 */
function typePreservingReplacement(
  from: Phoneme,
  to: Phoneme,
  inventory: ReadonlyArray<Phoneme>,
): Phoneme | null {
  const fromFeats = featuresOf(from);
  const toFeats = featuresOf(to);
  if (!fromFeats || !toFeats) return null;

  // Cross-class targets (glide↔vowel: vocalisation /j/→/i/, gliding
  // /i/→/j/, /w/↔/u/, etc.) preserve the syllabicity TOGGLE: the
  // substitute must be in the same MAJOR CLASS as the intended `to`
  // (a vocalisation must land on a vowel, a gliding on a glide) and be
  // the nearest such by feature distance. closestByFeatures already
  // filters to `to`'s class, so this keeps "vocalisation stays a
  // vocalisation" without corrupting it into an arbitrary consonant.
  if (fromFeats.type !== toFeats.type) {
    return closestByFeatures(to, inventory, from);
  }

  // Vowel → vowel: direction-preserving along the height/backness/round
  // axes (raising stays raising, fronting stays fronting).
  if (fromFeats.type === "vowel" && toFeats.type === "vowel") {
    let bestV: Phoneme | null = null;
    let bestVDist = Infinity;
    for (const candidate of inventory) {
      if (candidate === from) continue;
      const feats = featuresOf(candidate);
      if (!feats || feats.type !== "vowel") continue;
      if (!preservesVowelChangeType(fromFeats, toFeats, feats)) continue;
      const d = bundleDistance(toFeats, feats);
      if (d < bestVDist) {
        bestVDist = d;
        bestV = candidate;
      }
    }
    return bestV;
  }

  // Consonant → consonant: direction-preserving along the place/manner/
  // voice axes.
  if (fromFeats.type !== "consonant" || toFeats.type !== "consonant") {
    return null;
  }
  const fromCons = fromFeats;
  const toCons = toFeats;
  let best: Phoneme | null = null;
  let bestDist = Infinity;
  for (const candidate of inventory) {
    if (candidate === from) continue;
    const feats = featuresOf(candidate);
    if (!feats || feats.type !== "consonant") continue;
    if (!preservesChangeType(fromCons, toCons, feats)) continue;
    const d = bundleDistance(toFeats, feats);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

/**
 * Phase 59 T3 / Phase 1a: when a template's preferred output isn't in the
 * inventory, repair the outputMap by replacing each unattested target with
 * the closest available phoneme that PRESERVES the change type (lenition
 * stays lenition, palatalisation stays palatalisation, …). Returns null
 * when no type-preserving repair is possible, so the caller drops the rule
 * instead of emitting a corrupted change.
 */
export function repairOutputMapByFeatures(
  outputMap: Record<string, string>,
  inventory: ReadonlyArray<Phoneme>,
): Record<string, string> | null {
  const repaired: Record<string, string> = {};
  for (const [from, to] of Object.entries(outputMap)) {
    if (to === "" || inventory.includes(to)) {
      repaired[from] = to;
      continue;
    }
    const replacement = typePreservingReplacement(from, to, inventory);
    if (!replacement) return null;
    repaired[from] = replacement;
  }
  return repaired;
}
