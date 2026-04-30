import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import type { Tier } from "./concepts";
import { leafIds } from "../tree/leafIds";

const AGE_PER_TIER_STEP = 1500;
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
  const ageFactor = Math.min(120, age / 50);
  return Math.round(400 + 80 * tier + ageFactor + popFactor);
}
