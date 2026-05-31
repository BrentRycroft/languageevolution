import type { Language, Phoneme } from "../types";
import type { Rng } from "../rng";
import { TEMPLATES } from "./templates";
import type { RuleTemplate } from "./templates";
import {
  countAffectedForms,
  hasAnyMatch,
  type GeneratedRule,
  type RuleFamily,
} from "./generated";
import { featuresOf, shiftHeight } from "./features";
import { markednessOf } from "./markedness";
import { repairOutputMapByFeatures } from "./featureGeometry";
import { lexGet, lexKeys, lexSize } from "../lexicon/access";

/**
 * propose.ts
 *
 * Phonological feature geometry, sound-change rules, syllable shape, stress, tone, sandhi, and inventory homeostasis. Key exports: DEFAULT_RULE_BIAS, ProposeOptions, proposeOneRule.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const INITIAL_STRENGTH = 0.3;
const DEATH_STRENGTH = 0.04;
const MAX_DORMANT_GENERATIONS = 60;
const MAX_RETIRED_RULES = 200;
const ACTIVE_RULE_CAP_CENTRE = 8;

export const DEFAULT_RULE_BIAS: Record<RuleFamily, number> = {
  lenition: 1,
  fortition: 1,
  place_assim: 1,
  palatalization: 1,
  vowel_shift: 1,
  vowel_reduction: 1,
  harmony: 1,
  deletion: 1,
  metathesis: 0.6,
  tone: 0.6,
};

/**
 * Phase 59 T1+T4: family-bias-aware template picker.
 *
 * - When a `pressureFamily` is supplied, the family's bias is
 *   multiplied by 4× to make pressure-driven proposals overwhelmingly
 *   prefer the requested family.
 * - When `bias[family]` < 0.05 the family is fully disabled (T4) —
 *   its templates are skipped entirely. Lets a language permanently
 *   "lose interest" in a phonological family.
 *
 * Returns undefined when no family is enabled (rare; means the
 *   language has been stripped of all proposal capacity).
 */
function pickTemplate(
  lang: Language,
  rng: Rng,
  active: GeneratedRule[],
  pressureFamily?: RuleFamily,
): RuleTemplate | undefined {
  const familyCounts: Record<string, number> = {};
  for (const r of active) familyCounts[r.family] = (familyCounts[r.family] ?? 0) + 1;

  const bias = lang.ruleBias ?? DEFAULT_RULE_BIAS;
  const weights: number[] = [];
  let total = 0;
  for (const t of TEMPLATES) {
    const familyWeight = bias[t.family] ?? 1;
    // Phase 59 T4: families below threshold are fully disabled.
    if (familyWeight < 0.05) {
      weights.push(0);
      continue;
    }
    const pressureMult = pressureFamily && t.family === pressureFamily ? 4 : 1;
    const penalty = 1 / (1 + 0.6 * (familyCounts[t.family] ?? 0));
    const w = Math.max(0, familyWeight * penalty * pressureMult);
    weights.push(w);
    total += w;
  }
  if (total <= 0) return undefined;
  let r = rng.next() * total;
  for (let i = 0; i < TEMPLATES.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return TEMPLATES[i];
  }
  return TEMPLATES[TEMPLATES.length - 1];
}

export interface ProposeOptions {
  /**
   * Phase 59 T1: family the language is under pressure to address
   * (e.g. "lenition" when stops are over-saturated). Boosts that
   * family's proposal weight 4× and bypasses the soft-cap roll.
   */
  pressureFamily?: RuleFamily;
  /**
   * Phase 59 T2: starting strength override. Pressure-born rules
   * pass 0.5 so they impact within fewer generations; baseline
   * stays at INITIAL_STRENGTH (0.3).
   */
  initialStrength?: number;
}

export function proposeOneRule(
  lang: Language,
  rng: Rng,
  generation: number,
  opts: ProposeOptions = {},
): GeneratedRule | null {
  const active = lang.activeRules ?? [];
  // Phase 59 T1: pressure-driven proposals bypass the soft cap so
  // an over-saturated phoneme can always trigger a response.
  if (!opts.pressureFamily) {
    const pSoft =
      1 / (1 + Math.exp((active.length - ACTIVE_RULE_CAP_CENTRE) / 1.5));
    if (!rng.chance(pSoft)) return null;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const template = pickTemplate(lang, rng, active, opts.pressureFamily);
    if (!template) continue;
    const proposal = template.propose(lang, rng);
    if (!proposal) continue;

    const validatedMap: Record<string, string> = {};
    for (const [from, to] of Object.entries(proposal.outputMap)) {
      if (featuresOf(from) === undefined) continue;
      if (to !== "" && featuresOf(to) === undefined) continue;
      validatedMap[from] = to;
    }
    if (Object.keys(validatedMap).length === 0) continue;

    // Phase 59 T3: feature-distance output repair. When the template
    // proposed an output phoneme that the language doesn't carry,
    // substitute the closest in-inventory phoneme by feature distance.
    // Lets each language solve the same change in its own
    // phonological terms — Spanish chose [β] for lenited /b/, Greek
    // chose [v] via [φ→f→v]. Same template, different outputs per lang.
    const inventory = lang.phonemeInventory.segmental;
    const repaired = repairOutputMapByFeatures(validatedMap, inventory);
    if (!repaired) continue;
    const finalMap = repaired;

    const candidate: GeneratedRule = {
      id: `${lang.id}.g${generation}.${template.id}`,
      family: proposal.family,
      templateId: proposal.templateId,
      description: proposal.description,
      from: proposal.from,
      context: proposal.context,
      outputMap: finalMap,
      birthGeneration: generation,
      lastFireGeneration: generation,
      strength: opts.initialStrength ?? INITIAL_STRENGTH,
    };

    if (!hasAnyMatch(candidate, lang)) continue;

    const affected = countAffectedForms(candidate, lang);
    const totalForms = Math.max(1, lexSize(lang));
    if (affected / totalForms > 0.8) continue;

    if (active.some((r) => r.templateId === candidate.templateId)) continue;

    return candidate;
  }
  return null;
}

/**
 * Lenition fallback step for consonantal push-chains. Maps each common stop /
 * voiced-stop to its first lenited variant (stop → fricative). When a fortition
 * rule e.g. b→p collides with the existing /p/ in the inventory, the existing
 * /p/ pushes to its lenition target /f/ rather than merging.
 */
const LENITION_STEP: Record<Phoneme, Phoneme> = {
  p: "f",
  t: "θ",
  k: "h",
  b: "v",
  d: "ð",
  g: "ɣ",
};

export function proposePushChain(
  lang: Language,
  seed: GeneratedRule,
  generation: number,
): GeneratedRule | null {
  // Vowel raising chain (legacy): when X raises to Y and Y already exists,
  // Y pushes one step further up the height ladder.
  if (seed.templateId === "vowel_shift.single_raise") {
    const entries = Object.entries(seed.outputMap);
    if (entries.length !== 1) return null;
    const [, target] = entries[0]!;
    if (!lang.phonemeInventory.segmental.includes(target)) return null;
    const pushed = shiftHeight(target, 1);
    if (!pushed || pushed === target) return null;
    if (seed.outputMap[pushed] !== undefined) return null;
    if (lang.phonemeInventory.segmental.includes(pushed)) return null;
    return {
      id: `${seed.id}.push`,
      family: "vowel_shift",
      templateId: "vowel_shift.push_chain",
      description: `push-chain: /${target}/ → /${pushed}/ (avoids collision from ${seed.description})`,
      from: { type: "vowel" },
      context: { locus: "any" },
      outputMap: { [target]: pushed },
      birthGeneration: generation,
      lastFireGeneration: generation,
      strength: INITIAL_STRENGTH,
    };
  }

  // Consonantal lenition chain: when a seed remaps a voiced stop to a
  // voiceless stop and the voiceless target was already in the inventory,
  // chain the existing target to its lenition step (e.g. devoicing.bdg
  // sends b→p; if /p/ existed, it now lenites to /f/).
  if (seed.family === "fortition" || seed.family === "lenition") {
    for (const target of new Set(Object.values(seed.outputMap))) {
      if (!lang.phonemeInventory.segmental.includes(target)) continue;
      // Only push if the target was a "victim" of the seed: something else
      // is mapping into it. Otherwise it's not a collision.
      const isVictim = Object.entries(seed.outputMap).some(
        ([from, to]) => to === target && from !== target,
      );
      if (!isVictim) continue;
      const pushed = LENITION_STEP[target];
      if (!pushed || pushed === target) continue;
      if (seed.outputMap[pushed] !== undefined) continue;
      if (lang.phonemeInventory.segmental.includes(pushed)) continue;
      const tFeatures = featuresOf(target);
      if (!tFeatures || tFeatures.type !== "consonant") continue;
      return {
        id: `${seed.id}.push.${target}`,
        family: "lenition",
        templateId: "lenition.push_chain",
        description: `push-chain: /${target}/ → /${pushed}/ (avoids collision from ${seed.description})`,
        from: { type: "consonant" },
        context: { locus: "any" },
        outputMap: { [target]: pushed },
        birthGeneration: generation,
        lastFireGeneration: generation,
        strength: INITIAL_STRENGTH,
      };
    }
  }

  return null;
}

export function ageAndRetire(
  lang: Language,
  generation: number,
): { retired: string[] } {
  const retired: string[] = [];
  const survivors: GeneratedRule[] = [];
  for (const rule of lang.activeRules ?? []) {
    const dormantFor = generation - rule.lastFireGeneration;
    const match = hasAnyMatch(rule, lang);

    let nextStrength = rule.strength;
    if (!match) nextStrength -= 0.02;
    else if (dormantFor > MAX_DORMANT_GENERATIONS / 2) nextStrength -= 0.01;
    nextStrength -= 0.002;
    nextStrength = Math.max(0, nextStrength);

    const shouldRetire =
      nextStrength < DEATH_STRENGTH ||
      dormantFor > MAX_DORMANT_GENERATIONS ||
      !match;

    if (shouldRetire) {
      retired.push(rule.id);
      if (!lang.retiredRules) lang.retiredRules = [];
      lang.retiredRules.push({ ...rule, deathGeneration: generation });
      if (lang.retiredRules.length > MAX_RETIRED_RULES) {
        lang.retiredRules = lang.retiredRules.slice(-MAX_RETIRED_RULES);
      }
      continue;
    }
    survivors.push({ ...rule, strength: nextStrength });
  }
  lang.activeRules = survivors;
  return { retired };
}

export function reinforce(rule: GeneratedRule, generation: number): GeneratedRule {
  const grown = Math.min(1, rule.strength + 0.05);
  return { ...rule, strength: grown, lastFireGeneration: generation };
}

export function jitteredBias(rng: Rng, scale = 0.5): Record<RuleFamily, number> {
  const out: Record<string, number> = {};
  for (const [family, w] of Object.entries(DEFAULT_RULE_BIAS)) {
    const delta = (rng.next() * 2 - 1) * scale;
    out[family] = Math.max(0.15, w + delta);
  }
  return out as Record<RuleFamily, number>;
}

export function inventory(lang: Language): Phoneme[] {
  return lang.phonemeInventory.segmental.slice();
}

/**
 * Phase 59 T6: wildcard rule mutation. Pick an existing active
 * rule, clone it, mutate ONE field (a mapping output, the context
 * locus, or the position bias). Produces never-templated rules
 * that give each language unique phonological signatures over time.
 *
 * Rare event (caller gates at ≤ 1%/gen). Returns null when the
 * language has no active rules to mutate.
 */
export function proposeMutationOf(
  lang: Language,
  rng: Rng,
  generation: number,
): GeneratedRule | null {
  const active = lang.activeRules ?? [];
  if (active.length === 0) return null;
  const source = active[rng.int(active.length)]!;
  const inv = lang.phonemeInventory.segmental;
  if (inv.length === 0) return null;

  const mutationKind = rng.next();
  let newOutputMap = { ...source.outputMap };
  const newContext = { ...source.context };
  if (mutationKind < 0.5 && Object.keys(newOutputMap).length > 0) {
    // Mutate one mapping entry — pick a different in-inventory output.
    const keys = Object.keys(newOutputMap);
    const k = keys[rng.int(keys.length)]!;
    const altCandidates = inv.filter(
      (p) => p !== k && p !== newOutputMap[k] && featuresOf(p)?.type === featuresOf(k)?.type,
    );
    if (altCandidates.length > 0) {
      newOutputMap[k] = altCandidates[rng.int(altCandidates.length)]!;
    } else {
      return null;
    }
  } else if (mutationKind < 0.8) {
    // Mutate the context locus.
    const loci: Array<"intervocalic" | "onset" | "coda" | "edge" | "any"> = [
      "intervocalic", "onset", "coda", "edge", "any",
    ];
    const candidates = loci.filter((l) => l !== newContext.locus);
    newContext.locus = candidates[rng.int(candidates.length)]!;
  } else {
    // Mutate the position bias.
    const positions: Array<"initial" | "medial" | "final" | "any"> = [
      "initial", "medial", "final", "any",
    ];
    const candidates = positions.filter((p) => p !== newContext.position);
    newContext.position = candidates[rng.int(candidates.length)]!;
  }

  const mutated: GeneratedRule = {
    ...source,
    id: `${lang.id}.g${generation}.mutation.${source.id.split(".").pop() ?? "rule"}`,
    templateId: `mutation:${source.templateId}`,
    description: `${source.description} (mutated)`,
    outputMap: newOutputMap,
    context: newContext,
    birthGeneration: generation,
    lastFireGeneration: generation,
    strength: INITIAL_STRENGTH,
  };
  if (!hasAnyMatch(mutated, lang)) return null;
  return mutated;
}

/**
 * Phase 59 T1: identify a saturated phoneme — one whose lexicon
 * frequency exceeds its expected (markedness-adjusted) baseline.
 * Returns the most over-saturated phoneme + the rule family best
 * suited to address it (lenition for stops; vowel_reduction for
 * vowels; deletion as a fallback). Used by stepInventoryManagement
 * to fire a pressure-driven proposeOneRule.
 *
 * Returns null when no phoneme is meaningfully over-saturated
 * (saturation ratio < 1.5×).
 */
export function findSaturatedPhoneme(
  lang: Language,
): { phoneme: Phoneme; family: RuleFamily; ratio: number } | null {
  const inv = lang.phonemeInventory.segmental;
  if (inv.length === 0) return null;
  const counts: Record<string, number> = {};
  let total = 0;
  for (const m of lexKeys(lang)) {
    const form = lexGet(lang, m);
    if (!form) continue;
    for (const ph of form) {
      counts[ph] = (counts[ph] ?? 0) + 1;
      total++;
    }
  }
  if (total === 0) return null;
  // Expected baseline = 1/inventory_size scaled by inverse markedness:
  // marked phonemes (clicks, ʕ) are EXPECTED to be rare, so the
  // baseline drops; common ones (p/t/k) get the full 1/N.
  const baseline = 1 / inv.length;
  let best: { phoneme: Phoneme; family: RuleFamily; ratio: number } | null = null;
  for (const [ph, c] of Object.entries(counts)) {
    if (!inv.includes(ph)) continue;
    const observed = c / total;
    const mk = (() => {
      try { return markednessOf(ph); } catch { return 0; }
    })();
    const expected = baseline * (1 - mk * 0.5);
    if (expected <= 0) continue;
    const ratio = observed / expected;
    if (ratio < 1.5) continue;
    if (best && ratio <= best.ratio) continue;
    const feats = featuresOf(ph);
    let family: RuleFamily = "lenition";
    if (feats?.type === "vowel") family = "vowel_reduction";
    else if (feats?.manner === "stop") family = "lenition";
    else if (feats?.manner === "fricative") family = "deletion";
    else family = "lenition";
    best = { phoneme: ph, family, ratio };
  }
  return best;
}
