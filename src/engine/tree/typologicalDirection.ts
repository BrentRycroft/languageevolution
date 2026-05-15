import type { Language, TypologicalDirection } from "../types";
import type { Rng } from "../rng";
import type { RuleFamily } from "../phonology/generated-types";

/**
 * typologicalDirection.ts — Phase 73d Tier D Phase D1.
 *
 * Sample per-daughter latent direction vectors at split with
 * anti-correlation across siblings, then apply correlated bias
 * deltas to the child's `ruleBias`, `phonotacticProfile`,
 * `synthesisIndex`, and `fusionIndex`. The same direction tag
 * is also consulted by D3 (stress-target weighting) and D4
 * (inventory expansion).
 *
 * NOT preset-specific. Historical mode opts out via the gate
 * `hasHistoricalInitialBias(child)` — if a `SplitMilestone`
 * has just set `child.historicalRole`, the direction tag is
 * still assigned (for narrative colour) but the bias deltas
 * are SKIPPED. The schedule's `initialBias` wholesale-overwrites
 * `ruleBias` afterward, so Romance railroad daughters keep
 * their canonical Latin-daughter typologies.
 */

/**
 * Sample a `TypologicalDirection` for a freshly-split daughter.
 * The first sister in `previousSiblings` samples freely from
 * Gaussian(0, σ=0.8) clamped to [-1, 1] per axis. Each subsequent
 * sister samples with negative weight toward the previous
 * sisters' mean, producing anti-correlation.
 *
 * Anti-correlation strength: the next sister's mean is
 * −0.6 × meanOf(previousSiblings.axis). σ=0.6 so individual
 * sisters can still partially overlap if RNG rolls badly.
 */
export function sampleDirection(
  _parent: Language,
  rng: Rng,
  previousSiblings: ReadonlyArray<Language>,
): TypologicalDirection {
  const axes = ["simplification", "palatalization", "synthesis"] as const;
  const out: Partial<TypologicalDirection> = {};
  for (const axis of axes) {
    let mean = 0;
    let sigma = 0.8;
    const priors = previousSiblings
      .map((s) => s.typologicalDirection?.[axis])
      .filter((v): v is number => typeof v === "number");
    if (priors.length > 0) {
      const priorMean = priors.reduce((a, b) => a + b, 0) / priors.length;
      mean = -0.6 * priorMean;
      sigma = 0.6;
    }
    out[axis] = clamp(gaussian(rng, mean, sigma), -1, 1);
  }
  return out as TypologicalDirection;
}

function gaussian(rng: Rng, mean: number, sigma: number): number {
  // Box-Muller; rng.next() returns [0, 1).
  const u1 = Math.max(1e-9, rng.next());
  const u2 = rng.next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sigma * z;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Magnitude scalars for direction → ruleBias multiplicative
 * deltas. Each entry's sign + magnitude is intentional:
 *
 *   - `lenition`/`fortition` couple to `simplification` with
 *     opposite signs (a simplifier increases lenition, decreases
 *     fortition).
 *   - `deletion` couples to `simplification` (+).
 *   - `palatalization` and `harmony` couple to `palatalization` (+).
 *   - `vowel_reduction` couples to `synthesis` (+ for synthetic
 *     languages with fixed stress).
 *   - `place_assim`/`vowel_shift`/`metathesis`/`tone` are not
 *     direction-tied here; they jitter independently via the
 *     existing `jitterBias`.
 *
 * Magnitude 1.5 gives ±150% effective swing on rule families at
 * direction.X = ±1, which is meaningfully larger than the legacy
 * ±30% jitter and produces sister profiles that are sharply
 * different in their lenition character.
 */
const RULE_BIAS_COUPLING: Partial<Record<RuleFamily, {
  axis: keyof TypologicalDirection;
  scale: number; // multiplier = 1 + scale * direction.axis
}>> = {
  lenition: { axis: "simplification", scale: 1.5 },
  fortition: { axis: "simplification", scale: -1.2 },
  deletion: { axis: "simplification", scale: 1.0 },
  palatalization: { axis: "palatalization", scale: 1.5 },
  harmony: { axis: "palatalization", scale: 0.8 },
  vowel_reduction: { axis: "synthesis", scale: 0.8 },
};

/**
 * Apply correlated bias deltas to a child Language based on its
 * direction vector. Mutates the child in place. Caller is
 * responsible for the historical-mode gate.
 */
export function applyDirectionDeltas(
  child: Language,
  direction: TypologicalDirection,
): void {
  // (1) Multiplicative deltas on ruleBias families.
  if (child.ruleBias) {
    for (const [family, coupling] of Object.entries(RULE_BIAS_COUPLING)) {
      if (!coupling) continue;
      const factor = 1 + coupling.scale * direction[coupling.axis];
      const cur = child.ruleBias[family as RuleFamily];
      if (typeof cur !== "number") continue;
      child.ruleBias[family as RuleFamily] = Math.max(0.15, cur * factor);
    }
  }

  // (2) Phonotactic profile seed deltas. Simplifier → fewer
  // clusters; preserver → more. Clamped to documented ranges.
  if (child.phonotacticProfile) {
    const deltaCoda = Math.round(-direction.simplification * 2);
    const deltaOnset = Math.round(-direction.simplification * 1);
    const deltaCluster = Math.round(-direction.simplification * 1);
    child.phonotacticProfile.maxCoda = clampInt(child.phonotacticProfile.maxCoda + deltaCoda, 0, 5);
    child.phonotacticProfile.maxOnset = clampInt(child.phonotacticProfile.maxOnset + deltaOnset, 1, 4);
    child.phonotacticProfile.maxCluster = clampInt(child.phonotacticProfile.maxCluster + deltaCluster, 1, 5);
  }

  // (3) Synthesis / fusion index seed deltas. Synthetic →
  // higher; isolating → lower. Documented synthesisIndex range
  // is roughly [0, 5]; fusionIndex [0, 1].
  const synth = child.grammar.synthesisIndex;
  if (typeof synth === "number") {
    child.grammar.synthesisIndex = clamp(synth + direction.synthesis * 0.6, 0, 5);
  }
  const fusion = child.grammar.fusionIndex;
  if (typeof fusion === "number") {
    child.grammar.fusionIndex = clamp(fusion + direction.synthesis * 0.3, 0, 1);
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/**
 * True when the child's split-time bias has been (or is about to
 * be) overwritten by historical mode. Historical mode applies
 * `initialBias` from the `SplitMilestone` schedule AFTER
 * `splitLeaf` completes, via `applyBiasMilestone` in
 * `steps/historical.ts`. The signal here is the daughter's
 * `historicalRole` field, set by `assignHistoricalRole` at
 * split time.
 *
 * D1's contract: if `historicalRole` is set on the child at the
 * moment of direction-delta application, skip the deltas. The
 * direction TAG is still assigned (for narrative colour); only
 * the quantitative deltas are suppressed.
 */
export function hasHistoricalInitialBias(child: Language): boolean {
  return typeof child.historicalRole === "string" && child.historicalRole.length > 0;
}
