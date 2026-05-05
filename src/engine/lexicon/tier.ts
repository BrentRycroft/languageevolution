import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import type { Tier } from "./concepts";
import { leafIds } from "../tree/leafIds";

const AGE_PER_TIER_STEP = 1500;

/**
 * Number of consecutive tier-check ticks (each = 20 gens) the language must
 * remain eligible for a higher tier before the transition fires. Provides
 * hysteresis: a one-off speaker spike that fades away within ~40 gens does
 * not trigger an upgrade. Two ticks ≈ 40-generation sustained eligibility.
 */
export const TIER_HYSTERESIS_TICKS = 2;

/**
 * Pure hysteresis transition rule: given prior tier, candidate tier
 * (computed by computeTierCandidate), and current streak, returns the
 * resulting tier and updated streak.
 *
 * - candidate > prior → streak grows; promote only when streak reaches
 *   TIER_HYSTERESIS_TICKS (then resets to 0).
 * - candidate <= prior → streak resets to 0; no promotion.
 *
 * Extracted as a pure function so it's directly testable; consumed by
 * simulation.ts step().
 */
export function applyTierHysteresis(
  priorTier: Tier,
  candidate: Tier,
  priorStreak: number,
): { nextTier: Tier; nextStreak: number; promoted: boolean } {
  if (candidate <= priorTier) {
    return { nextTier: priorTier, nextStreak: 0, promoted: false };
  }
  const incremented = priorStreak + 1;
  if (incremented >= TIER_HYSTERESIS_TICKS) {
    return { nextTier: candidate, nextStreak: 0, promoted: true };
  }
  return { nextTier: priorTier, nextStreak: incremented, promoted: false };
}
const POP_TIER_FLOORS: ReadonlyArray<{ speakers: number; tier: Tier }> = [
  { speakers: 5_000, tier: 1 },
  { speakers: 80_000, tier: 2 },
  { speakers: 5_000_000, tier: 3 },
];

const TIER_POP_CAPS: Record<Tier, number> = {
  0: 6_000,
  1: 100_000,
  2: 8_000_000,
  3: 100_000_000,
};

export function populationCap(tier: Tier): number {
  return TIER_POP_CAPS[tier];
}

export function computeTierCandidate(
  lang: Language,
  tree: LanguageTree,
  generation: number,
  rng: Rng,
): Tier {
  const current = (lang.culturalTier ?? 0) as Tier;
  let candidate: Tier = current;

  const age = generation - lang.birthGeneration;
  const agePermittedTier = Math.min(
    3,
    Math.floor(age / AGE_PER_TIER_STEP),
  ) as Tier;
  if (agePermittedTier > candidate && rng.chance(0.1)) {
    candidate = (candidate + 1) as Tier;
  }

  const pop = lang.speakers ?? 10000;
  for (const { speakers, tier } of POP_TIER_FLOORS) {
    if (pop >= speakers && tier > candidate) {
      candidate = tier;
    }
  }

  const sisters = leafIds(tree)
    .filter((id) => id !== lang.id && !tree[id]!.language.extinct)
    .map((id) => tree[id]!.language);
  for (const s of sisters) {
    const sTier = (s.culturalTier ?? 0) as Tier;
    if (sTier > candidate && rng.chance(0.01)) {
      candidate = (candidate + 1) as Tier;
      break;
    }
  }

  return candidate > current ? candidate : current;
}

export function lexicalCapacity(lang: Language, generation: number): number {
  const tier = (lang.culturalTier ?? 0) as Tier;
  const age = Math.max(0, generation - lang.birthGeneration);
  const pop = Math.max(1, lang.speakers ?? 10000);
  const popFactor = 40 * Math.max(0, Math.log10(pop / 10000));
  // Phase 38g: amplify tier scaling so lexicons grow toward
  // realistic sizes: tier 0 → ~500, tier 3 mature → ~2000-3000.
  // Pre-38g this capped at ~720; far short of real lexicon growth.
  const ageFactor = Math.min(400, age / 25);
  return Math.round(400 + 250 * tier + ageFactor + popFactor);
}
