import type { Language, TypologicalDirection } from "../types";
import type { Rng } from "../rng";

type StressPattern = NonNullable<Language["stressPattern"]>;

/**
 * Phase 73d Tier D Phase D3: direction-vector-biased stress
 * selection. Fixed-stress patterns (initial / penult /
 * antepenult) are characteristic of synthetic languages with
 * predictable prosody (Latin, Czech, Hungarian). Final + lexical
 * stress is more typical of isolating + tone-bearing languages
 * (French, Russian, Macedonian). When a daughter's
 * `typologicalDirection.synthesis` is high, we weight the picker
 * toward fixed-stress patterns; low → toward lexical/final.
 */
const FIXED_STRESS_PATTERNS: ReadonlySet<StressPattern> = new Set(["initial", "penult", "antepenult"]);
const FREE_STRESS_PATTERNS: ReadonlySet<StressPattern> = new Set(["lexical", "final"]);

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

function weightedPick(
  options: ReadonlyArray<StressPattern>,
  direction: TypologicalDirection | undefined,
  rng: Rng,
): StressPattern {
  if (!direction) return options[rng.int(options.length)]!;
  // synthesis > 0.3 → weight fixed-stress patterns 2.5× more.
  // synthesis < -0.3 → weight free-stress 2.5× more.
  const synth = direction.synthesis;
  if (Math.abs(synth) <= 0.3) return options[rng.int(options.length)]!;
  const preferFixed = synth > 0;
  const weights = options.map((p) => {
    const isFixed = FIXED_STRESS_PATTERNS.has(p);
    const isFree = FREE_STRESS_PATTERNS.has(p);
    if (preferFixed && isFixed) return 2.5;
    if (!preferFixed && isFree) return 2.5;
    return 1.0;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return options[i]!;
  }
  return options[options.length - 1]!;
}

export function pickNextStressForDrift(
  current: StressPattern,
  rng: Rng,
  direction?: TypologicalDirection,
): StressPattern {
  const options = STRESS_TRANSITIONS_DRIFT[current];
  return weightedPick(options, direction, rng);
}

export function pickNextStressForSplit(
  current: StressPattern,
  rng: Rng,
  direction?: TypologicalDirection,
): StressPattern {
  const options = STRESS_TRANSITIONS_SPLIT[current];
  return weightedPick(options, direction, rng);
}
