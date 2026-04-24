import type { GrammarFeatures } from "../types";
import type { Rng } from "../rng";

const ORDERS: GrammarFeatures["wordOrder"][] = ["SOV", "SVO", "VSO", "VOS", "OVS", "OSV"];

const ADJACENT: Record<GrammarFeatures["wordOrder"], GrammarFeatures["wordOrder"][]> = {
  SOV: ["SVO", "OSV"],
  SVO: ["SOV", "VSO"],
  VSO: ["SVO", "VOS"],
  VOS: ["VSO", "OVS"],
  OVS: ["VOS", "OSV"],
  OSV: ["OVS", "SOV"],
};

const PLURAL_MARKINGS: GrammarFeatures["pluralMarking"][] = ["none", "affix", "reduplication"];
const TENSE_MARKINGS: GrammarFeatures["tenseMarking"][] = ["none", "past", "future", "both"];
const GENDER_COUNTS: GrammarFeatures["genderCount"][] = [0, 2, 3];

export interface GrammarShift {
  feature: string;
  from: string | boolean | number;
  to: string | boolean | number;
}

type Shifter = (
  g: GrammarFeatures,
  rng: Rng,
  simplification?: number,
) => GrammarShift | null;

interface DriftRule {
  feature: keyof GrammarFeatures;
  probability: number;
  shift: Shifter;
}

function pickOther<T>(options: readonly T[], current: T, rng: Rng): T {
  const filtered = options.filter((o) => o !== current);
  return filtered[rng.int(filtered.length)]!;
}

/**
 * Data-driven drift specification. Each entry is tried once per `driftGrammar`
 * call; probabilities were calibrated so word order is the most stable and
 * gender / case gain/loss are the rarest events.
 */
const DRIFT_RULES: readonly DriftRule[] = [
  {
    feature: "wordOrder",
    probability: 0.2,
    shift: (g, rng) => {
      // Caseless languages get pulled toward rigid SVO/SOV — without
      // morphological case, word order is the only way to keep
      // subject and object apart, so the "free" orders (OVS/OSV/VOS)
      // are unstable. A language with case can drift among any
      // adjacent orders freely.
      //
      // Empirical: WALS shows ~86 % of caseless languages are SVO or
      // SOV; ~56 % of case-rich languages are SOV with many OV-type
      // permutations attested.
      let options = ADJACENT[g.wordOrder];
      if (!g.hasCase) {
        const rigid: GrammarFeatures["wordOrder"][] = ["SVO", "SOV"];
        const pullTargets = options.filter((o) => rigid.includes(o));
        if (pullTargets.length > 0 && !rigid.includes(g.wordOrder)) {
          // Free → rigid: restrict to the rigid targets.
          options = pullTargets;
        } else if (pullTargets.length > 0 && rigid.includes(g.wordOrder)) {
          // Rigid → rigid: allowed, but bias the pick toward other
          // rigid orders (weight ×3).
          options = [...pullTargets, ...pullTargets, ...pullTargets, ...options];
        }
        // If no rigid target is adjacent, fall through with the
        // regular adjacency list (rare).
      }
      const pick = options[rng.int(options.length)]!;
      const shift = { feature: "wordOrder", from: g.wordOrder, to: pick };
      g.wordOrder = pick;
      return shift;
    },
  },
  {
    feature: "affixPosition",
    probability: 0.1,
    shift: (g) => {
      const next = g.affixPosition === "suffix" ? "prefix" : "suffix";
      const shift = { feature: "affixPosition", from: g.affixPosition, to: next };
      g.affixPosition = next;
      return shift;
    },
  },
  {
    feature: "pluralMarking",
    probability: 0.15,
    shift: (g, rng) => {
      const next = pickOther(PLURAL_MARKINGS, g.pluralMarking, rng);
      const shift = { feature: "pluralMarking", from: g.pluralMarking, to: next };
      g.pluralMarking = next;
      return shift;
    },
  },
  {
    feature: "tenseMarking",
    probability: 0.15,
    shift: (g, rng) => {
      const next = pickOther(TENSE_MARKINGS, g.tenseMarking, rng);
      const shift = { feature: "tenseMarking", from: g.tenseMarking, to: next };
      g.tenseMarking = next;
      return shift;
    },
  },
  {
    feature: "hasCase",
    probability: 0.08,
    shift: (g, _rng, simplification = 1) => {
      // Trudgill-effect bias: when simplification > 1 (large
      // language) and case is currently present, the flip skews
      // toward losing case. When simplification < 1 (small
      // language) and case is absent, the flip skews toward
      // gaining case (small isolated communities accumulate
      // morphology). At simplification = 1 the flip is symmetric.
      const wantsLoss = g.hasCase && simplification > 1;
      const wantsGain = !g.hasCase && simplification < 1;
      const flipBias = wantsLoss
        ? Math.min(0.95, 0.5 + 0.2 * (simplification - 1))
        : wantsGain
          ? Math.min(0.95, 0.5 + 0.2 * (1 / simplification - 1))
          : 0.5;
      // Use the rng held by the closure-bound deterministic shifter
      // — driftGrammar will pass it. Use chance() with the bias.
      // Fall through: when bias = 0.5, original symmetric behaviour.
      // Otherwise, only flip when the random sample agrees with the
      // bias direction (toward loss for big langs / gain for small).
      // Implemented as: with prob `flipBias` flip, otherwise no-op.
      // (This means the per-call probability already gates whether
      // we even get here, so this is the second-stage gate.)
      const r = (_rng as Rng).next();
      if (r > flipBias) return null;
      const shift = { feature: "hasCase", from: g.hasCase, to: !g.hasCase };
      g.hasCase = !g.hasCase;
      return shift;
    },
  },
  {
    feature: "genderCount",
    probability: 0.05,
    shift: (g, rng, simplification = 1) => {
      // Big communities preferentially drop genders (English lost
      // grammatical gender entirely; modern Persian dropped from
      // PIE 3-gender to none). Small communities can pick up
      // distinctions over time.
      let next = pickOther(GENDER_COUNTS, g.genderCount, rng);
      if (simplification > 1.2 && g.genderCount > 0 && rng.chance(0.7)) {
        // Force a step toward zero.
        next = (g.genderCount === 3 ? 2 : 0) as GrammarFeatures["genderCount"];
      } else if (simplification < 0.8 && g.genderCount === 0 && rng.chance(0.7)) {
        // Force a step toward more.
        next = 2;
      }
      if (next === g.genderCount) return null;
      const shift = { feature: "genderCount", from: g.genderCount, to: next };
      g.genderCount = next;
      return shift;
    },
  },
];

/**
 * One-step grammar drift. Each feature has a small independent
 * probability of drifting per call; returns the list of shifts that
 * actually fired. `simplification` (default 1) biases simplification-
 * direction events (case loss, gender drop) — see the Trudgill
 * effect comments on individual rules.
 */
export function driftGrammar(
  grammar: GrammarFeatures,
  rng: Rng,
  simplification: number = 1,
): GrammarShift[] {
  const shifts: GrammarShift[] = [];
  for (const rule of DRIFT_RULES) {
    if (rng.chance(rule.probability)) {
      const applied = rule.shift(grammar, rng, simplification);
      if (applied) shifts.push(applied);
    }
  }
  return shifts;
}

export { cloneGrammar } from "../utils/clone";
export { ORDERS };
