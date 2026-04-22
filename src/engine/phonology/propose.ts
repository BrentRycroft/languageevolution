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
import { featuresOf } from "./features";

const INITIAL_STRENGTH = 0.3;
/** Strength below which a rule is retired. */
const DEATH_STRENGTH = 0.04;
/** Generations without a successful fire before retirement. */
const MAX_DORMANT_GENERATIONS = 60;
/** Max active rules per language. */
const MAX_ACTIVE_RULES = 8;

/**
 * Default per-family bias. A language's actual `ruleBias` is seeded around 1.0
 * with ±0.5 jitter at split so sisters diverge in character.
 */
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
 * Sample a template weighted by the language's rule bias and penalised by
 * how many of the language's already-active rules come from that family
 * (anti-repetition).
 */
function pickTemplate(
  lang: Language,
  rng: Rng,
  active: GeneratedRule[],
): RuleTemplate | undefined {
  const familyCounts: Record<string, number> = {};
  for (const r of active) familyCounts[r.family] = (familyCounts[r.family] ?? 0) + 1;

  const bias = lang.ruleBias ?? DEFAULT_RULE_BIAS;
  const weights: number[] = [];
  let total = 0;
  for (const t of TEMPLATES) {
    const familyWeight = (bias[t.family] ?? 1);
    const penalty = 1 / (1 + 0.6 * (familyCounts[t.family] ?? 0));
    const w = Math.max(0, familyWeight * penalty);
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

/**
 * Try to propose exactly one new rule for the language, or return null.
 * Caller decides when to fire — normally every `PROPOSAL_CADENCE` gens.
 */
export function proposeOneRule(
  lang: Language,
  rng: Rng,
  generation: number,
): GeneratedRule | null {
  const active = lang.activeRules ?? [];
  if (active.length >= MAX_ACTIVE_RULES) return null;
  // 3 attempts; templates may return null if the inventory can't support them.
  for (let attempt = 0; attempt < 3; attempt++) {
    const template = pickTemplate(lang, rng, active);
    if (!template) continue;
    const proposal = template.propose(lang, rng);
    if (!proposal) continue;

    // Filter outputMap: every output must be either empty (deletion) or
    // a known phoneme in the feature table. Prevents templates from
    // emitting exotic characters that no downstream matcher understands.
    const validatedMap: Record<string, string> = {};
    for (const [from, to] of Object.entries(proposal.outputMap)) {
      if (featuresOf(from) === undefined) continue;
      if (to !== "" && featuresOf(to) === undefined) continue;
      validatedMap[from] = to;
    }
    if (Object.keys(validatedMap).length === 0) continue;

    const candidate: GeneratedRule = {
      id: `${lang.id}.g${generation}.${template.id}`,
      family: proposal.family,
      templateId: proposal.templateId,
      description: proposal.description,
      from: proposal.from,
      context: proposal.context,
      outputMap: validatedMap,
      birthGeneration: generation,
      lastFireGeneration: generation,
      strength: INITIAL_STRENGTH,
    };

    // Reject if the language doesn't currently have any site for this rule —
    // we don't want dead rules polluting the list.
    if (!hasAnyMatch(candidate, lang)) continue;

    // Reject if the rule would hit "too much" of the lexicon — 80 %+ is the
    // linguistic equivalent of turning the language into soup.
    const affected = countAffectedForms(candidate, lang);
    const totalForms = Math.max(1, Object.keys(lang.lexicon).length);
    if (affected / totalForms > 0.8) continue;

    // Reject near-duplicates of an existing active rule.
    if (active.some((r) => r.templateId === candidate.templateId)) continue;

    return candidate;
  }
  return null;
}

/**
 * Advance every active rule's lifecycle by one generation. Returns the ids
 * of rules that just retired so the caller can emit events.
 */
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
    // Small decay every gen so strength slowly trends down without reinforcement.
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
      continue;
    }
    survivors.push({ ...rule, strength: nextStrength });
  }
  lang.activeRules = survivors;
  return { retired };
}

/**
 * Reinforce a rule when it successfully fires this generation.
 */
export function reinforce(rule: GeneratedRule, generation: number): GeneratedRule {
  const grown = Math.min(1, rule.strength + 0.05);
  return { ...rule, strength: grown, lastFireGeneration: generation };
}

/** Factory for a fresh bias vector with ±jitter from the default. */
export function jitteredBias(rng: Rng, scale = 0.5): Record<RuleFamily, number> {
  const out: Record<string, number> = {};
  for (const [family, w] of Object.entries(DEFAULT_RULE_BIAS)) {
    const delta = (rng.next() * 2 - 1) * scale;
    out[family] = Math.max(0.15, w + delta);
  }
  return out as Record<RuleFamily, number>;
}

/** Convenience: the current inventory of every phoneme the language uses. */
export function inventory(lang: Language): Phoneme[] {
  return lang.phonemeInventory.segmental.slice();
}
