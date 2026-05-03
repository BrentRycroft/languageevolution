import type { Language } from "../types";
import type { Rng } from "../rng";

type StressPattern = NonNullable<Language["stressPattern"]>;

/**
 * Phase 28a: shared stress-pattern transition tables. Pre-28a these
 * lived as duplicate `STRESS_ADJACENT` consts in both
 * `steps/grammar.ts` (drift mode — incremental, fewer destinations)
 * and `tree/founder.ts` (split mode — broader, more dramatic). The
 * tables disagreed: grammar said `initial → penult` only, founder
 * said `initial → penult | final`. Each call-site reimplemented the
 * pick.
 *
 * Now there's one module per use-case with one picker each.
 *
 * Cross-linguistic note: the transitions encode typologically
 * plausible neighbours. Spanish-style penult is the "central" pattern
 * with the most neighbours; final/initial are reachable from each
 * other only via penult under drift, but a tree-split (more dramatic
 * change) can jump directly between them.
 */

export const STRESS_TRANSITIONS_DRIFT: Record<StressPattern, StressPattern[]> = {
  initial: ["penult"],
  penult: ["initial", "final", "antepenult"],
  final: ["penult"],
  antepenult: ["penult"],
  lexical: ["penult"],
};

export const STRESS_TRANSITIONS_SPLIT: Record<StressPattern, StressPattern[]> = {
  initial: ["penult", "final"],
  penult: ["initial", "final", "antepenult"],
  final: ["penult", "initial"],
  antepenult: ["penult"],
  lexical: ["penult", "initial"],
};

export function pickNextStressForDrift(
  current: StressPattern,
  rng: Rng,
): StressPattern {
  const options = STRESS_TRANSITIONS_DRIFT[current];
  return options[rng.int(options.length)]!;
}

export function pickNextStressForSplit(
  current: StressPattern,
  rng: Rng,
): StressPattern {
  const options = STRESS_TRANSITIONS_SPLIT[current];
  return options[rng.int(options.length)]!;
}
