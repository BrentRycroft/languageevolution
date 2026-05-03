import type { Language } from "../types";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

/**
 * Phase 25: time-varying volatility regime. Each language oscillates
 * between long stable periods and short upheavals. Upheavals model real-
 * history bursts: Norman conquest (Old English → Middle English), Great
 * Vowel Shift (Middle → Modern English), the Bantu expansion. Stable
 * periods model the long centuries between such upheavals when change
 * is incremental and slow.
 *
 * State machine per language:
 *   - default: phase = undefined → treated as "stable" with multiplier 1.
 *   - On each generation tick:
 *       1. If `until` is reached, roll the next phase.
 *       2. Stable → 1% chance per gen of flipping into upheaval.
 *       3. Upheaval → always flips to stable when `until` reached.
 *   - Triggers (besides random): tier promotion + heavy contact (called
 *     externally to seed an upheaval).
 *
 * Multiplier ranges:
 *   - Stable:   0.4 – 0.7  (slow drift)
 *   - Upheaval: 2.5 – 4.0  (rapid change)
 */
const STABLE_MIN_DURATION = 25;
const STABLE_MAX_DURATION = 80;
const UPHEAVAL_MIN_DURATION = 8;
const UPHEAVAL_MAX_DURATION = 22;
const UPHEAVAL_RANDOM_TRIGGER_RATE = 0.012;

/**
 * Multiplier exposed to phonology / genesis / grammar steps. Returns 1
 * when the language has no phase set (pre-Phase-25 saves get default
 * behavior); otherwise returns the current phase's multiplier.
 */
export function volatilityMultiplier(lang: Language): number {
  return lang.volatilityPhase?.multiplier ?? 1;
}

/**
 * Roll a fresh phase. Called on transitions (when `until` is reached)
 * or on triggered upheavals.
 */
function rollPhase(
  lang: Language,
  generation: number,
  rng: Rng,
  forceUpheaval = false,
  trigger?: string,
): void {
  const wasUpheaval = lang.volatilityPhase?.kind === "upheaval";
  const goUpheaval =
    forceUpheaval ||
    (!wasUpheaval && rng.chance(UPHEAVAL_RANDOM_TRIGGER_RATE));

  if (goUpheaval) {
    const duration =
      UPHEAVAL_MIN_DURATION +
      Math.floor(rng.next() * (UPHEAVAL_MAX_DURATION - UPHEAVAL_MIN_DURATION));
    const multiplier = 2.5 + rng.next() * 1.5; // 2.5 – 4.0
    lang.volatilityPhase = {
      kind: "upheaval",
      until: generation + duration,
      multiplier,
      trigger,
    };
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `volatility upheaval begins (×${multiplier.toFixed(1)} for ${duration} gens${trigger ? `, trigger: ${trigger}` : ""})`,
    });
  } else {
    const duration =
      STABLE_MIN_DURATION +
      Math.floor(rng.next() * (STABLE_MAX_DURATION - STABLE_MIN_DURATION));
    const multiplier = 0.4 + rng.next() * 0.3; // 0.4 – 0.7
    const wasUpheavalPhase = wasUpheaval;
    lang.volatilityPhase = {
      kind: "stable",
      until: generation + duration,
      multiplier,
    };
    if (wasUpheavalPhase) {
      pushEvent(lang, {
        generation,
        kind: "grammar_shift",
        description: `volatility upheaval ends → stable (×${multiplier.toFixed(2)} for ${duration} gens)`,
      });
    }
  }
}

/**
 * Per-generation volatility tick. Run before phonology/genesis steps so
 * the multiplier is fresh. On phase end, rolls the next phase. From a
 * cold start (no phase set), seeds an initial stable phase.
 */
export function stepVolatility(
  lang: Language,
  generation: number,
  rng: Rng,
): void {
  const phase = lang.volatilityPhase;
  if (!phase) {
    // Initialize: short randomized stable phase to spread initial entry
    // across daughters so they don't all hit the same volatility window.
    rollPhase(lang, generation, rng, false);
    return;
  }
  if (generation >= phase.until) {
    rollPhase(lang, generation, rng, false);
  }
}

/**
 * External trigger: a tier-2/3 transition or heavy-contact event seeds
 * an upheaval. Idempotent — if a language is already in upheaval, the
 * call is ignored (the existing upheaval continues).
 */
export function triggerVolatilityUpheaval(
  lang: Language,
  generation: number,
  rng: Rng,
  trigger: string,
): void {
  if (lang.volatilityPhase?.kind === "upheaval") return;
  rollPhase(lang, generation, rng, true, trigger);
}
