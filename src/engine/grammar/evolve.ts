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

type Shifter = (g: GrammarFeatures, rng: Rng) => GrammarShift | null;

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
      const options = ADJACENT[g.wordOrder];
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
    shift: (g) => {
      const shift = { feature: "hasCase", from: g.hasCase, to: !g.hasCase };
      g.hasCase = !g.hasCase;
      return shift;
    },
  },
  {
    feature: "genderCount",
    probability: 0.05,
    shift: (g, rng) => {
      const next = pickOther(GENDER_COUNTS, g.genderCount, rng);
      const shift = { feature: "genderCount", from: g.genderCount, to: next };
      g.genderCount = next;
      return shift;
    },
  },
];

/**
 * One-step grammar drift. Each feature has a small independent probability
 * of drifting per call; returns the list of shifts that actually fired.
 */
export function driftGrammar(grammar: GrammarFeatures, rng: Rng): GrammarShift[] {
  const shifts: GrammarShift[] = [];
  for (const rule of DRIFT_RULES) {
    if (rng.chance(rule.probability)) {
      const applied = rule.shift(grammar, rng);
      if (applied) shifts.push(applied);
    }
  }
  return shifts;
}

export { cloneGrammar } from "../utils/clone";
export { ORDERS };
