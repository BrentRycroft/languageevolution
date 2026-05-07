/**
 * Phase 48 D4-C: push/pull chain-shift dynamics.
 *
 * Linguistic basis: Martinet 1955 ("Économie des changements
 * phonétiques"); Labov 1994 ("Principles of Linguistic Change").
 * Vowel mergers and shifts trigger follow-on shifts to preserve
 * phonological space. The Great Vowel Shift is the canonical
 * example: long vowels rose, pushing the highest vowels to
 * diphthongise to make room.
 *
 * The simulator tracks "vowel-space pressure" — when ≥3 vowels
 * cluster in similar height/backness positions, the inventory is
 * crowded and pressure builds for one of them to shift away.
 *
 * Computed per-generation. Surfaced to diagnostics + narrative
 * events; also feeds a soft multiplier on vowel-shift rule rates
 * so chain shifts emerge naturally from inventory crowding.
 */

import type { Language, Phoneme } from "../types";
import { featuresOf, type VowelFeatures } from "./features";

/**
 * Pressure score per vowel ∈ [0, ∞):
 *   0 = uncrowded, no pressure
 *   1+ = at least one neighbour vowel within 1 height + 1 backness step
 *   2+ = 2+ neighbours (the vowel and its cluster are crowded;
 *        a chain shift is likely)
 */
export function computeChainShiftPressure(
  lang: Language,
): Record<Phoneme, number> {
  const out: Record<Phoneme, number> = Object.create(null);
  const inv = lang.phonemeInventory.segmental;
  const vowels: Array<{ p: Phoneme; f: VowelFeatures }> = [];
  for (const p of inv) {
    const f = featuresOf(p);
    if (f && f.type === "vowel") vowels.push({ p, f });
  }
  for (const v of vowels) {
    let neighbours = 0;
    for (const u of vowels) {
      if (u.p === v.p) continue;
      // Heights are ordered: high > mid-high > mid > mid-low > low.
      const heightDiff = Math.abs(
        HEIGHT_INDEX[v.f.height] - HEIGHT_INDEX[u.f.height],
      );
      const backnessDiff = Math.abs(
        BACKNESS_INDEX[v.f.backness] - BACKNESS_INDEX[u.f.backness],
      );
      // Adjacent vowels (within 2 steps on height, 1 step on
      // backness) count as neighbours. The 2-step height tolerance
      // catches crowded clusters like {high, mid-high, mid-low, low}
      // (e.g., front i / e / ɛ / æ) where adjacent pairs are
      // 1-step but the cluster as a whole is crowded.
      if (heightDiff <= 2 && backnessDiff <= 1) neighbours++;
    }
    // Pressure is the count of neighbours minus the "comfortable"
    // baseline of 1 neighbour. A vowel with 0-1 neighbours has 0
    // pressure; with 3 neighbours, pressure is 2.
    out[v.p] = Math.max(0, neighbours - 1);
  }
  return out;
}

const HEIGHT_INDEX: Record<VowelFeatures["height"], number> = {
  high: 0,
  "mid-high": 1,
  mid: 2,
  "mid-low": 3,
  low: 4,
};

const BACKNESS_INDEX: Record<VowelFeatures["backness"], number> = {
  front: 0,
  central: 1,
  back: 2,
};

/**
 * Detect new chain-shift events: pressure on a vowel that just rose
 * past the threshold (was below, now ≥ THRESHOLD). Compares against
 * the language's stored snapshot.
 */
export interface ChainShiftEvent {
  vowel: Phoneme;
  generation: number;
  fromPressure: number;
  toPressure: number;
}

const CHAIN_SHIFT_PRESSURE_THRESHOLD = 2;

export function detectChainShiftPressure(
  lang: Language,
  generation: number,
): ChainShiftEvent[] {
  const current = computeChainShiftPressure(lang);
  const previous = lang.vowelShiftPressure ?? {};
  const events: ChainShiftEvent[] = [];
  for (const [vowel, toPressure] of Object.entries(current)) {
    const fromPressure = previous[vowel] ?? 0;
    if (
      fromPressure < CHAIN_SHIFT_PRESSURE_THRESHOLD &&
      toPressure >= CHAIN_SHIFT_PRESSURE_THRESHOLD
    ) {
      events.push({ vowel, generation, fromPressure, toPressure });
    }
  }
  lang.vowelShiftPressure = current;
  return events;
}

/**
 * Soft multiplier ∈ [1, 1.5] on vowel-shift rule firing rates,
 * computed from the maximum pressure across the inventory. A highly
 * pressured vowel space boosts vowel-shift rules ~1.5×; a relaxed
 * inventory leaves rates at 1×.
 */
export function vowelShiftRateMultiplier(lang: Language): number {
  const pressure = lang.vowelShiftPressure ?? {};
  let maxP = 0;
  for (const v of Object.values(pressure)) {
    if (v > maxP) maxP = v;
  }
  // Map pressure 0 → 1.0, 1 → 1.15, 2 → 1.3, 3+ → 1.5 (cap).
  return Math.min(1.5, 1.0 + maxP * 0.15);
}
