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

/**
 * Speaker-count modulator. Small speech communities innovate faster
 * than large ones — smaller networks mean a change originated by one
 * speaker reaches everyone sooner, and there's less adult-speaker
 * resistance to young-speaker innovations. Large national languages
 * are phonologically conservative for decades (standard-language
 * attractor + literacy + broadcast media all slow drift).
 *
 * Returns a multiplier centred on 1.0 at ~10 000 speakers and sliding
 * between ~2× (very small) and ~0.4× (very large). Capped both ways
 * so the sim can't stall or blow up.
 *
 * Reference: Nettle 1999, Lupyan & Dale 2010 for the correlation
 * between population size and morphosyntactic complexity.
 */
export function speakerFactor(speakers: number | undefined): number {
  const n = speakers ?? 10000;
  if (!isFinite(n) || n <= 0) return 1;
  // Log-scale: doubling speakers cuts drift rate by ~20 %.
  // log₁₀(10k) = 4 is the neutral point.
  const log10 = Math.log10(Math.max(1, n));
  const factor = Math.pow(0.8, log10 - 4);
  return Math.max(0.4, Math.min(2.2, factor));
}
