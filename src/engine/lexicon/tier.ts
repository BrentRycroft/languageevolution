import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import type { Tier } from "./concepts";
import { leafIds } from "../tree/split";

/**
 * Cultural-tier advancement machinery. A language's `culturalTier`
 * gates which concepts it's allowed to coin from the universal
 * dictionary (`lexicon/concepts.ts`). Tier 0 = forager; tier 3 =
 * modern. Advancement is deliberately slow — most runs of the sim
 * will stay within tiers 0–1 unless a descendant accumulates many
 * generations and a large population.
 *
 * Three pressures cause advancement:
 *   1. **Age** — a lineage that has run for many generations has
 *      had time to accumulate cultural innovations. Every ~2000 gens
 *      of age, there's a soft chance of advancing one tier.
 *   2. **Population** — sedentary populations develop agriculture,
 *      large states develop writing. Speaker counts above thresholds
 *      nudge the tier floor up.
 *   3. **Contact** — a language with a higher-tier sister may pick
 *      up the tier through areal diffusion of material culture.
 */

const AGE_PER_TIER_STEP = 1500;
const POP_TIER_FLOORS: ReadonlyArray<{ speakers: number; tier: Tier }> = [
  { speakers: 5_000, tier: 1 },
  { speakers: 80_000, tier: 2 },
  { speakers: 5_000_000, tier: 3 },
];

/**
 * Carrying capacity for a language at a given cultural tier — the
 * speaker count toward which logistic-growth simulation pulls. Tied
 * to material-culture realism: foragers max out at hundreds-of-bands
 * scale, agriculturalists at small kingdoms, iron-age states at low
 * millions, modern at hundreds of millions. The deliberate
 * staircase is what makes tier advancement self-reinforcing —
 * advancing the tier raises the cap, populations grow toward it,
 * and the larger population then pushes the tier further (Diamond's
 * Guns-Germs-Steel feedback in miniature).
 */
const TIER_POP_CAPS: Record<Tier, number> = {
  0: 6_000,
  1: 100_000,
  2: 8_000_000,
  3: 100_000_000,
};

export function populationCap(tier: Tier): number {
  return TIER_POP_CAPS[tier];
}

/**
 * Return the tier this language should now be at, given its current
 * age, speaker count, and the cultural tier of any alive sister that
 * has been in contact. Never regresses — a language that reached
 * tier 2 through population growth then shrank doesn't lose writing.
 */
export function computeTierCandidate(
  lang: Language,
  tree: LanguageTree,
  generation: number,
  rng: Rng,
): Tier {
  const current = (lang.culturalTier ?? 0) as Tier;
  let candidate: Tier = current;

  // 1. Age pressure. After AGE_PER_TIER_STEP generations, each
  //    subsequent step has a 10% chance per generation in the
  //    calling cadence to advance. The caller decides cadence.
  const age = generation - lang.birthGeneration;
  const agePermittedTier = Math.min(
    3,
    Math.floor(age / AGE_PER_TIER_STEP),
  ) as Tier;
  if (agePermittedTier > candidate && rng.chance(0.1)) {
    candidate = (candidate + 1) as Tier;
  }

  // 2. Population floor. Sedentary agricultural communities and
  //    large states jump the tier floor. This is deterministic
  //    given the threshold so populations that cross it reliably
  //    advance (though the tier can never exceed 3).
  const pop = lang.speakers ?? 10000;
  for (const { speakers, tier } of POP_TIER_FLOORS) {
    if (pop >= speakers && tier > candidate) {
      candidate = tier;
    }
  }

  // 3. Contact diffusion. A higher-tier alive sister within the same
  //    tree can pass cultural technology in over time. Low per-gen
  //    probability (1%) but compounds over long runs.
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

  // Never regress.
  return candidate > current ? candidate : current;
}

/**
 * Target lexicon size for this language given its tier + age +
 * speakers. Used by the dictionary-pull genesis path: when the
 * current lexicon is smaller than capacity, the path fires; once
 * capacity is reached, coinage slows dramatically but doesn't stop.
 *
 *   base = 400 + 80 × tier                   (tier floor; calibrated
 *                                             above typical seed size
 *                                             so seeded proto-languages
 *                                             still have headroom)
 *       + min(120, age / 50)                 (maturation)
 *       + 40 × max(0, log10(speakers/10k))   (communicative scale)
 *
 * Real languages of course have tens of thousands of words; the
 * capacity here is an abstracted budget that the engine's coinage
 * tempo is tuned against. Bigger numbers just mean "more room for
 * discovery," not a one-to-one map to word count.
 */
export function lexicalCapacity(lang: Language, generation: number): number {
  const tier = (lang.culturalTier ?? 0) as Tier;
  const age = Math.max(0, generation - lang.birthGeneration);
  const pop = Math.max(1, lang.speakers ?? 10000);
  const popFactor = 40 * Math.max(0, Math.log10(pop / 10000));
  const ageFactor = Math.min(120, age / 50);
  return Math.round(400 + 80 * tier + ageFactor + popFactor);
}
