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

const ALIGNMENTS: NonNullable<GrammarFeatures["alignment"]>[] = [
  "nom-acc", "erg-abs", "tripartite", "split-S",
];
const HARMONIES: NonNullable<GrammarFeatures["harmony"]>[] = [
  "none", "front-back", "rounding", "atr",
];
const EVIDENTIALS: NonNullable<GrammarFeatures["evidentialMarking"]>[] = [
  "none", "direct-only", "three-way",
];

const DRIFT_RULES: readonly DriftRule[] = [
  // Phase 30 Tranche 30c: wordOrder drift moved out of DRIFT_RULES.
  // It now lives in `maybeDriftWordOrder` (below) so the call site
  // can gate on tier + synthetic index + cooldown — the data DRIFT_RULES
  // doesn't have access to. Removing it here so it doesn't fire twice.
  {
    feature: "alignment",
    probability: 0.04,
    shift: (g, rng) => {
      const current = g.alignment ?? "nom-acc";
      const others = ALIGNMENTS.filter((a) => a !== current);
      if (!g.hasCase && current !== "nom-acc") {
        const next = "nom-acc";
        g.alignment = next;
        return { feature: "alignment", from: current, to: next };
      }
      if (g.hasCase && current === "nom-acc" && rng.chance(0.4)) {
        const next: NonNullable<GrammarFeatures["alignment"]> = rng.chance(0.6) ? "erg-abs" : "split-S";
        g.alignment = next;
        return { feature: "alignment", from: current, to: next };
      }
      const next = others[rng.int(others.length)]!;
      g.alignment = next;
      return { feature: "alignment", from: current, to: next };
    },
  },
  {
    feature: "harmony",
    probability: 0.03,
    shift: (g, rng) => {
      const current = g.harmony ?? "none";
      if (current === "none" && !rng.chance(0.4)) return null;
      const others = HARMONIES.filter((h) => h !== current);
      const next = others[rng.int(others.length)]!;
      g.harmony = next;
      return { feature: "harmony", from: current, to: next };
    },
  },
  {
    feature: "evidentialMarking",
    probability: 0.03,
    shift: (g, rng) => {
      const current = g.evidentialMarking ?? "none";
      if (current === "none" && !rng.chance(0.3)) return null;
      const others = EVIDENTIALS.filter((e) => e !== current);
      const next = others[rng.int(others.length)]!;
      g.evidentialMarking = next;
      return { feature: "evidentialMarking", from: current, to: next };
    },
  },
  {
    feature: "classifierSystem",
    probability: 0.025,
    shift: (g) => {
      const current = !!g.classifierSystem;
      g.classifierSystem = !current;
      return { feature: "classifierSystem", from: current, to: !current };
    },
  },
  {
    feature: "relativeClauseStrategy",
    probability: 0.04,
    shift: (g, rng) => {
      const STRATEGIES: NonNullable<GrammarFeatures["relativeClauseStrategy"]>[] = [
        "gap", "resumptive", "relativizer", "internal-headed",
      ];
      const current = g.relativeClauseStrategy ?? "relativizer";
      const others = STRATEGIES.filter((s) => s !== current);
      const next = others[rng.int(others.length)]!;
      g.relativeClauseStrategy = next;
      return { feature: "relativeClauseStrategy", from: current, to: next };
    },
  },
  {
    feature: "serialVerbConstructions",
    probability: 0.025,
    shift: (g) => {
      const current = !!g.serialVerbConstructions;
      g.serialVerbConstructions = !current;
      return { feature: "serialVerbConstructions", from: current, to: !current };
    },
  },
  {
    feature: "politenessRegister",
    probability: 0.02,
    shift: (g, rng) => {
      const REGISTERS: NonNullable<GrammarFeatures["politenessRegister"]>[] = [
        "none", "binary", "tiered",
      ];
      const current = g.politenessRegister ?? "none";
      const others = REGISTERS.filter((r) => r !== current);
      const next = others[rng.int(others.length)]!;
      g.politenessRegister = next;
      return { feature: "politenessRegister", from: current, to: next };
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
      const wantsLoss = g.hasCase && simplification > 1;
      const wantsGain = !g.hasCase && simplification < 1;
      const flipBias = wantsLoss
        ? Math.min(0.95, 0.5 + 0.2 * (simplification - 1))
        : wantsGain
          ? Math.min(0.95, 0.5 + 0.2 * (1 / simplification - 1))
          : 0.5;
      const r = (_rng as Rng).next();
      if (r > flipBias) return null;
      const shift = { feature: "hasCase", from: g.hasCase, to: !g.hasCase };
      g.hasCase = !g.hasCase;
      // Phase 39m: coupled flip — when hasCase flips false, force
      // caseStrategy: "case" → "preposition" to avoid the incoherent
      // "no morphological case but caseStrategy: case" state. Models
      // English's coupled loss of case + adoption of prepositions.
      if (!g.hasCase && g.caseStrategy === "case") {
        g.caseStrategy = "preposition";
      } else if (g.hasCase && (g.caseStrategy === "preposition" || g.caseStrategy === "postposition")) {
        // Reverse pathway (rare, e.g., Hindi rebuilt case from postpositions).
        g.caseStrategy = "case";
      }
      return shift;
    },
  },
  // Phase 39m: caseStrategy can drift independently. Prior to this
  // it only changed via enforceTypologicalUniversals soft repair.
  // Adding it to DRIFT_RULES allows real synthetic→analytic
  // transitions visible in narrative output.
  {
    feature: "caseStrategy",
    probability: 0.04,
    shift: (g, rng) => {
      const cur = g.caseStrategy ?? "preposition";
      const synth = g.synthesisIndex ?? 0.5;
      // Analytic languages drift away from case; synthetic languages
      // drift toward it. Pre-existing universals.ts may then re-flip
      // for consistency, but the seed transition fires here.
      const opts: Array<{ to: GrammarFeatures["caseStrategy"]; weight: number }> = [];
      if (cur === "case") {
        opts.push({ to: "mixed", weight: 0.3 * (1 - synth / 3) });
      } else if (cur === "mixed") {
        opts.push({ to: "preposition", weight: 0.4 });
        opts.push({ to: "case", weight: 0.05 });
      } else if (cur === "preposition") {
        opts.push({ to: "postposition", weight: 0.05 });
        opts.push({ to: "mixed", weight: 0.05 });
        opts.push({ to: "case", weight: 0.05 });
      } else if (cur === "postposition") {
        opts.push({ to: "preposition", weight: 0.05 });
      }
      const totalW = opts.reduce((a, o) => a + o.weight, 0);
      if (totalW <= 0) return null;
      let r = rng.next() * totalW;
      let pick: GrammarFeatures["caseStrategy"] | null = null;
      for (const o of opts) {
        r -= o.weight;
        if (r <= 0) { pick = o.to; break; }
      }
      if (!pick || pick === cur) return null;
      const shift = { feature: "caseStrategy" as const, from: cur, to: pick };
      g.caseStrategy = pick;
      return shift;
    },
  },
  {
    feature: "genderCount",
    probability: 0.05,
    shift: (g, rng, simplification = 1) => {
      let next = pickOther(GENDER_COUNTS, g.genderCount, rng);
      if (simplification > 1.2 && g.genderCount > 0 && rng.chance(0.7)) {
        next = (g.genderCount === 3 ? 2 : 0) as GrammarFeatures["genderCount"];
      } else if (simplification < 0.8 && g.genderCount === 0 && rng.chance(0.7)) {
        next = 2;
      }
      if (next === g.genderCount) return null;
      const shift = { feature: "genderCount", from: g.genderCount, to: next };
      g.genderCount = next;
      return shift;
    },
  },
];

export function driftGrammar(
  grammar: GrammarFeatures,
  rng: Rng,
  simplification: number = 1,
  rateMultiplier: number = 1,
): GrammarShift[] {
  const shifts: GrammarShift[] = [];
  for (const rule of DRIFT_RULES) {
    if (rng.chance(rule.probability * rateMultiplier)) {
      const applied = rule.shift(grammar, rng, simplification);
      if (applied) shifts.push(applied);
    }
  }
  return shifts;
}

/**
 * Phase 30 Tranche 30c: gated word-order drift.
 *
 * Pre-fix the wordOrder rule fired at 0.2/gen unconditionally, so an
 * English-preset language at tier 3 with established morphology
 * could flip SVO → SOV in 60 gens. That's too fast — real-world
 * tier-3 isolating languages are typologically stable for centuries.
 *
 * Gate: probability scales with `(1 - tier × 0.25) × (1 -
 * syntheticIndex × 0.4)` and a 50-gen cooldown after every flip.
 * A tier-3 isolating language flips ~1/10 as often as tier-0
 * inflecting one. `lang.wordOrderLastFlipGen` records the last flip.
 */
const WORD_ORDER_FLIP_COOLDOWN = 50;

export function maybeDriftWordOrder(
  lang: import("../types").Language,
  rng: Rng,
  generation: number,
): GrammarShift | null {
  const tier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
  const synth = lang.grammar.synthesisIndex ?? 0.5;
  const lastFlip = lang.wordOrderLastFlipGen;
  if (lastFlip !== undefined && generation - lastFlip < WORD_ORDER_FLIP_COOLDOWN) {
    return null;
  }
  const tierFactor = Math.max(0.1, 1 - tier * 0.25);
  const synthFactor = Math.max(0.2, 1 - synth * 0.4);
  const baseRate = 0.2;
  const probability = baseRate * tierFactor * synthFactor;
  if (!rng.chance(probability)) return null;

  const g = lang.grammar;
  let options = ADJACENT[g.wordOrder];
  if (!g.hasCase) {
    const rigid: GrammarFeatures["wordOrder"][] = ["SVO", "SOV"];
    const pullTargets = options.filter((o) => rigid.includes(o));
    if (pullTargets.length > 0 && !rigid.includes(g.wordOrder)) {
      options = pullTargets;
    } else if (pullTargets.length > 0 && rigid.includes(g.wordOrder)) {
      options = [...pullTargets, ...pullTargets, ...pullTargets, ...options];
    }
  }
  const pick = options[rng.int(options.length)]!;
  const from = g.wordOrder;
  g.wordOrder = pick;
  lang.wordOrderLastFlipGen = generation;
  return { feature: "wordOrder", from, to: pick };
}

export { cloneGrammar } from "../utils/clone";
export { ORDERS };
