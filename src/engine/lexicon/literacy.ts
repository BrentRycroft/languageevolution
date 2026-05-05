import type { Language } from "../types";

/**
 * Phase 38b: compute the language's literary-stability score given
 * culturalTier and orthography richness. Tier 2+ literacy with a
 * developed orthography drags the language toward stability.
 *
 * Formula: 0.3 + 0.4 × (tier - 1) + 0.3 × hasOrthography(lang),
 * clamped to [0, 1]. Tier 0/1 with no orthography → 0; tier 2 with
 * orthography → 1.0.
 *
 * Consumers:
 * - phonology lambda × (1 - 0.6 × score) — literary languages erode
 *   at 40% of base rate even outside stable phases.
 * - grammaticalisation rate × (1 - 0.4 × score).
 * - volatility phase pick biased toward stable when score ≥ 0.6.
 */
export function literaryStabilityFor(lang: Language): number {
  const tier = lang.culturalTier ?? 0;
  const hasOrth = lang.orthography && Object.keys(lang.orthography).length >= 4 ? 1 : 0;
  const raw = 0.3 * (tier - 1) + 0.4 * hasOrth;
  // Tier 0 → 0; tier 1 with no orth → 0; tier 1 with orth → 0.4;
  // tier 2 with orth → 0.7; tier 3 with orth → 1.0.
  if (tier <= 0) return 0;
  return Math.max(0, Math.min(1, raw));
}
