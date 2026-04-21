import { fnv1a } from "../rng";

/**
 * Generation-and-language-specific multiplier that makes effective sound-change
 * rates vary realistically over time:
 *   - a gentle sinusoidal baseline (languages have calmer and faster eras)
 *   - rare "rapid change" bursts (Great-Vowel-Shift style) that spike the
 *     multiplier to ~3× for a handful of generations.
 *
 * The result is deterministic given (generation, languageId).
 */
export function rateMultiplier(generation: number, languageId: string): number {
  const seed = fnv1a(languageId) / 0xffffffff;
  const base = 1 + 0.4 * Math.sin(generation / 30 + seed * Math.PI * 2);

  // Burst window: every ~120 generations, a 5-generation spike.
  const phase = (generation + Math.floor(seed * 120)) % 120;
  const burst = phase < 5 ? 2 + Math.sin((phase / 5) * Math.PI) : 0;

  return Math.max(0.2, base + burst);
}
