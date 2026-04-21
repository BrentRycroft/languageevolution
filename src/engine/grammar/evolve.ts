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

export interface GrammarShift {
  feature: string;
  from: string | boolean | number;
  to: string | boolean | number;
}

/**
 * One-step grammar drift. Returns the list of shifts applied (possibly empty).
 * Each feature has a small independent probability of drifting per call.
 */
export function driftGrammar(
  grammar: GrammarFeatures,
  rng: Rng,
): GrammarShift[] {
  const shifts: GrammarShift[] = [];

  // Word order drift — rare, move to adjacent type.
  if (rng.chance(0.2)) {
    const options = ADJACENT[grammar.wordOrder];
    const pick = options[rng.int(options.length)]!;
    shifts.push({ feature: "wordOrder", from: grammar.wordOrder, to: pick });
    grammar.wordOrder = pick;
  }

  // Affix position flip.
  if (rng.chance(0.1)) {
    const next = grammar.affixPosition === "suffix" ? "prefix" : "suffix";
    shifts.push({ feature: "affixPosition", from: grammar.affixPosition, to: next });
    grammar.affixPosition = next;
  }

  // Plural marking shifts.
  if (rng.chance(0.15)) {
    const options: GrammarFeatures["pluralMarking"][] = ["none", "affix", "reduplication"];
    const filtered = options.filter((o) => o !== grammar.pluralMarking);
    const next = filtered[rng.int(filtered.length)]!;
    shifts.push({ feature: "pluralMarking", from: grammar.pluralMarking, to: next });
    grammar.pluralMarking = next;
  }

  // Tense marking shifts.
  if (rng.chance(0.15)) {
    const options: GrammarFeatures["tenseMarking"][] = ["none", "past", "future", "both"];
    const filtered = options.filter((o) => o !== grammar.tenseMarking);
    const next = filtered[rng.int(filtered.length)]!;
    shifts.push({ feature: "tenseMarking", from: grammar.tenseMarking, to: next });
    grammar.tenseMarking = next;
  }

  // Case gain/loss.
  if (rng.chance(0.08)) {
    shifts.push({ feature: "hasCase", from: grammar.hasCase, to: !grammar.hasCase });
    grammar.hasCase = !grammar.hasCase;
  }

  // Gender drift.
  if (rng.chance(0.05)) {
    const options: GrammarFeatures["genderCount"][] = [0, 2, 3];
    const filtered = options.filter((o) => o !== grammar.genderCount);
    const next = filtered[rng.int(filtered.length)]!;
    shifts.push({ feature: "genderCount", from: grammar.genderCount, to: next });
    grammar.genderCount = next;
  }

  return shifts;
}

export function cloneGrammar(g: GrammarFeatures): GrammarFeatures {
  return { ...g };
}

export { ORDERS };
