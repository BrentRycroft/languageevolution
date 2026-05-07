import type { Language } from "../types";
import { PRODUCTIVITY_THRESHOLD } from "../lexicon/derivation";

/**
 * Phase 56 T1: per-affix productivity decay.
 *
 * Pre-Phase-56, `DerivationalSuffix.usageCount` only grew. Real
 * morphology decays: unused affixes lose productivity over time.
 * Romance Latin's `-tor` agentive lost ground to `-ist` over
 * centuries; English `-eth` (loveth) faded to nothing.
 *
 * Algorithm: every `DECAY_INTERVAL` generations, walk the language's
 * derivational suffixes. For each, compute generations-since-last-use
 * (current generation - lastUsedGeneration, or current - established
 * if never used). When an affix has been idle longer than the decay
 * window, halve its usageCount. When usageCount drops below the
 * productivity threshold, flip `productive` back to false.
 *
 * Active affixes (used recently) keep their counts; only neglected
 * ones decay. Floor: usageCount can't go below 0.
 */

const DECAY_INTERVAL = 10;
/** Generations of disuse before a single decay tick fires. */
const DECAY_THRESHOLD = 15;

export function decayAffixProductivity(
  lang: Language,
  generation: number,
): { decayed: number; demoted: number } {
  if (!lang.derivationalSuffixes) return { decayed: 0, demoted: 0 };
  // Only decay every DECAY_INTERVAL gens to avoid O(N) work each step.
  if (generation === 0 || generation % DECAY_INTERVAL !== 0) {
    return { decayed: 0, demoted: 0 };
  }
  let decayed = 0;
  let demoted = 0;
  for (const s of lang.derivationalSuffixes) {
    const count = s.usageCount ?? 0;
    if (count <= 0) continue;
    const lastUsed = s.lastUsedGeneration ?? s.establishedGeneration ?? 0;
    const idleGens = generation - lastUsed;
    if (idleGens < DECAY_THRESHOLD) continue;
    s.usageCount = Math.max(0, Math.floor(count / 2));
    decayed++;
    if (
      s.productive === true &&
      (s.usageCount ?? 0) < PRODUCTIVITY_THRESHOLD
    ) {
      s.productive = false;
      demoted++;
    }
  }
  return { decayed, demoted };
}
