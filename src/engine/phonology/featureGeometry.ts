import type { Phoneme } from "../types";
import type { ConsonantFeatures, VowelFeatures, FeatureBundle } from "./features";
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

/**
 * Phase 59 T3: when a template's preferred output isn't in the
 * inventory, repair the outputMap by replacing each unattested
 * target with the closest available phoneme by feature distance.
 * Returns null when no repair is possible (i.e. inventory has no
 * candidate of the right major class for any target).
 */
export function repairOutputMapByFeatures(
  outputMap: Record<string, string>,
  inventory: ReadonlyArray<Phoneme>,
): Record<string, string> | null {
  const repaired: Record<string, string> = {};
  let anyRepaired = false;
  for (const [from, to] of Object.entries(outputMap)) {
    if (to === "" || inventory.includes(to)) {
      repaired[from] = to;
      continue;
    }
    const replacement = closestByFeatures(to, inventory, from);
    if (!replacement) return null;
    repaired[from] = replacement;
    anyRepaired = true;
  }
  void anyRepaired;
  return repaired;
}
