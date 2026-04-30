import { fnv1a } from "../rng";

const PI = Math.PI;
const TWO_PI = 2 * PI;
const PI_SQ = PI * PI;

function sinApprox(x: number): number {
  let t = x - TWO_PI * Math.floor((x + PI) / TWO_PI);
  const sign = t < 0 ? -1 : 1;
  const at = t < 0 ? -t : t;
  const k = at * (PI - at);
  return (sign * 16 * k) / (5 * PI_SQ - 4 * k);
}

/**
 * Realism master multiplier — a single global knob that scales every
 * stochastic rate the engine consults. 1.0 = stock pacing; 5.0 = fast
 * / educational; 0.2 = slow / research-grade. Default 1.0 applied
 * when the config field is missing.
 */
export function realismMultiplier(
  config: { realismMultiplier?: number } | undefined,
): number {
  return Math.max(0.05, Math.min(10, config?.realismMultiplier ?? 1));
}

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
  const base = 1 + 0.4 * sinApprox(generation / 30 + seed * Math.PI * 2);

  // Burst window: every ~120 generations, a 5-generation spike.
  const phase = (generation + Math.floor(seed * 120)) % 120;
  const burst = phase < 5 ? 2 + sinApprox((phase / 5) * Math.PI) : 0;

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

/**
 * Geographic-isolation modulator. Languages separated from every other
 * living sister by a wide map gap innovate faster: founder populations
 * with no neighbouring prestige variety don't get their idiosyncratic
 * innovations corrected externally, and pushed-to-the-fringe
 * communities tend to develop unique features (Icelandic is a counter-
 * example but most islanders, highlanders, and desert-edge languages
 * drift idiosyncratically — e.g. Papuan isolates, Andamanese, Khoisan).
 *
 * Input: minimum map-space distance from this language to any other
 * alive sister. Output: 1.0 at d=0 (dense contact), rising to 1.5 at
 * d ≈ 800, capped at 1.6. Returns 1.0 if the distance is unknown
 * (the sole surviving leaf, or pre-map saves).
 */
export function isolationFactor(nearestNeighborDistance: number | undefined): number {
  if (nearestNeighborDistance === undefined || !isFinite(nearestNeighborDistance)) return 1;
  const d = Math.max(0, nearestNeighborDistance);
  // Linear climb with a soft cap. 1000 gives +1.0 before cap.
  return 1 + Math.min(0.6, d / 1000);
}

/**
 * Trudgill effect: large language communities shed morphological
 * complexity faster than small ones (Trudgill 2011; Lupyan & Dale
 * 2010). Adult L2 learners — proportionally more numerous in big
 * lingua francas — don't reliably acquire fine-grained morphology,
 * and the simplifications spread back into native speech. Small
 * isolated communities, by contrast, accumulate idiosyncratic
 * complexity (Pirahã, Archi, Tabassaran).
 *
 * Returns a multiplier on simplification-direction events
 * (paradigm merger, case loss, gender loss). 1.0 at ~10k speakers,
 * 0.5 at small (~1k), capped at 3.0 at very large (10M+).
 */
export function simplificationFactor(speakers: number | undefined): number {
  const n = speakers ?? 10000;
  if (!isFinite(n) || n <= 0) return 1;
  const factor = 1 + 0.5 * Math.log10(Math.max(1, n) / 10000);
  return Math.max(0.5, Math.min(3.0, factor));
}
