import type { Language } from "../types";
import type { Rng } from "../rng";

/**
 * phonotacticDrift.ts — Phase 73d Tier D Phase D2.
 *
 * Drift `lang.phonotacticProfile.{maxOnset, maxCoda, maxCluster}`
 * over generations driven by cumulative rule firings. Lenition-
 * heavy daughters lose clusters over centuries (the Romance
 * trajectory: Latin maxCluster≈4 → Italian/Spanish ~2). Fortition-
 * heavy daughters preserve or expand them (the Slavic trajectory).
 *
 * Cadence: every 20 generations (`PHONOTACTIC_DRIFT_CADENCE`),
 * matching the existing `TYPOLOGY_CADENCE` rhythm in
 * `grammar/typology_drift.ts`.
 *
 * Pressure signals:
 *   - `lenitionPressure` = count of `lenition` + `deletion` rule
 *     entries in `lang.diffusionState` (proxy for "how many
 *     reductive rules have actuated").
 *   - `fortitionPressure` = count of `fortition` + (rules whose
 *     family is `place_assim` or `palatalization` — these don't
 *     necessarily expand clusters but they're non-reductive).
 *
 * Drift rule per call (every 20 gens):
 *   - When lenitionPressure > fortitionPressure: 35% chance to
 *     decrement maxCoda by 1; 20% chance to decrement maxCluster.
 *   - When fortitionPressure > lenitionPressure: 25% chance to
 *     increment maxCoda; 15% chance to increment maxCluster.
 *   - 3% per-axis stochastic noise (±1) regardless of pressure.
 *   - Clamps: maxOnset ∈ [1, 4]; maxCoda ∈ [0, 5];
 *     maxCluster ∈ [1, 5].
 */

const PHONOTACTIC_DRIFT_CADENCE = 20;

function readActivePressure(lang: Language): {
  lenitionPressure: number;
  fortitionPressure: number;
} {
  let lenitionPressure = 0;
  let fortitionPressure = 0;
  for (const rule of lang.activeRules ?? []) {
    if (!rule || typeof rule !== "object") continue;
    const family = (rule as { family?: string }).family;
    if (!family) continue;
    if (family === "lenition" || family === "deletion") lenitionPressure++;
    else if (family === "fortition" || family === "gemination") fortitionPressure++;
  }
  return { lenitionPressure, fortitionPressure };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

export function stepPhonotacticDrift(
  lang: Language,
  generation: number,
  rng: Rng,
): void {
  if (!lang.phonotacticProfile) return;
  if (generation === 0) return;
  if (generation % PHONOTACTIC_DRIFT_CADENCE !== 0) return;

  const { lenitionPressure, fortitionPressure } = readActivePressure(lang);
  const profile = lang.phonotacticProfile;

  // Bias toward simplification when lenition pressure dominates.
  if (lenitionPressure > fortitionPressure) {
    if (rng.chance(0.35)) profile.maxCoda = clampInt(profile.maxCoda - 1, 0, 5);
    if (rng.chance(0.20)) profile.maxCluster = clampInt(profile.maxCluster - 1, 1, 5);
    if (rng.chance(0.10)) profile.maxOnset = clampInt(profile.maxOnset - 1, 1, 4);
  } else if (fortitionPressure > lenitionPressure) {
    if (rng.chance(0.25)) profile.maxCoda = clampInt(profile.maxCoda + 1, 0, 5);
    if (rng.chance(0.15)) profile.maxCluster = clampInt(profile.maxCluster + 1, 1, 5);
  }

  // Stochastic noise — small chance of a ±1 nudge irrespective of
  // pressure, so phonotactic profiles stay alive even in balanced
  // rule-set languages.
  if (rng.chance(0.03)) profile.maxCoda = clampInt(profile.maxCoda + (rng.chance(0.5) ? 1 : -1), 0, 5);
  if (rng.chance(0.03)) profile.maxCluster = clampInt(profile.maxCluster + (rng.chance(0.5) ? 1 : -1), 1, 5);
  if (rng.chance(0.02)) profile.maxOnset = clampInt(profile.maxOnset + (rng.chance(0.5) ? 1 : -1), 1, 4);
}
