import type { Language, GrammarFeatures } from "../types";
import type { Rng } from "../rng";
import type { SocialState } from "../domains";

/**
 * Phase 38f: structural substrate absorption.
 *
 * Long-contact languages absorb each other's grammar features beyond
 * the lexical borrowing already covered by `tryBorrow`. Real-world
 * cases:
 * - Andean Spanish takes Quechua-influenced word order in some dialects.
 * - Mediterranean Sprachbund shares articles + clitic doubling across
 *   Romance, Greek, Albanian, Bulgarian.
 * - English absorbed Old Norse pronouns + verb-second residue.
 *
 * Per-gen rate ~0.3%, only fires when bilingual link strength ≥ 0.4.
 * Tier-2 literate recipients resist (× 0.3 chance) — written languages
 * don't restructure under contact as readily.
 */

export interface StructuralBorrowEvent {
  feature: keyof GrammarFeatures;
  from: unknown;
  to: unknown;
  donorId: string;
}

const TRANSFERABLE_FEATURES: ReadonlyArray<keyof GrammarFeatures> = [
  "wordOrder",
  "articlePresence",
  "adjectivePosition",
  "negationPosition",
  "numberSystem",
  "demonstrativeDistance",
];

/**
 * Phase 72f T4 (Thomason hierarchy): borrowing is gated by prestige.
 * Thomason & Kaufman (1988) established that borrowing follows a strict
 * hierarchy of difficulty:
 *   1. Lexical (easy) — handled by `tryBorrow`.
 *   2. Phonological (areal phoneme adoption — `maybeArealPhonemeShare`).
 *   3. Structural / grammatical (this function) — requires prestige
 *      asymmetry AND sustained heavy contact.
 *   4. Morphological (rare; outside this simulator's scope).
 *
 * Pre-72f the structural-borrow rate was uniform across all
 * donor-recipient pairs. Post-72f it requires:
 *   - bilingual link strength ≥ 0.4 (existing gate; "heavy contact").
 *   - prestige asymmetry: donor.tier > recipient.tier OR
 *     donor.prestigeVariety AND !recipient.prestigeVariety.
 *   - When asymmetry is absent, baseRate is halved (rare grammatical
 *     diffusion via areal Sprachbund still possible).
 */
function thomasonStructuralRate(
  recipient: SocialState,
  donor: SocialState,
  baseRate: number,
): number {
  const tierGap = (donor.culturalTier ?? 0) - (recipient.culturalTier ?? 0);
  const donorPrestige = donor.prestigeVariety === true;
  const recipientPrestige = recipient.prestigeVariety === true;
  const hasAsymmetry = tierGap > 0 || (donorPrestige && !recipientPrestige);
  const literacyResist = (recipient.literaryStability ?? 0) >= 0.6 ? 0.3 : 1;
  if (hasAsymmetry) {
    // Asymmetry boosts the rate (×1 + 0.5 per tier-gap step) and
    // halves the literacy brake (because prestige overrides it).
    const tierBoost = 1 + Math.max(0, tierGap) * 0.5;
    const prestigeBonus = donorPrestige && !recipientPrestige ? 1.6 : 1.0;
    const adjustedLiteracy = Math.min(1, literacyResist * 2);
    return baseRate * tierBoost * prestigeBonus * adjustedLiteracy;
  }
  // No asymmetry: baseline rate halved, literacy fully applied.
  return baseRate * 0.5 * literacyResist;
}

export function tryStructuralBorrow(
  recipient: Language,
  donor: Language,
  rng: Rng,
  baseRate: number = 0.003,
): StructuralBorrowEvent | null {
  // Bilingual link strength gate. Phase 36 stored bilingualLinks as
  // Record<string, number>; 0.4+ is "heavy contact".
  const linkStrength = recipient.bilingualLinks?.[donor.id] ?? 0;
  if (linkStrength < 0.4) return null;
  // Phase 72f T4: rate is now Thomason-gated by prestige asymmetry
  // (replaces the previous uniform literacy-only brake).
  const rate = thomasonStructuralRate(recipient, donor, baseRate);
  if (!rng.chance(rate)) return null;
  // Pick a feature that differs between donor and recipient.
  const recGram = recipient.grammar as unknown as Record<string, unknown>;
  const donGram = donor.grammar as unknown as Record<string, unknown>;
  const candidates: Array<{ feature: keyof GrammarFeatures; from: unknown; to: unknown }> = [];
  for (const feature of TRANSFERABLE_FEATURES) {
    const recipientVal = recGram[feature];
    const donorVal = donGram[feature];
    if (donorVal === undefined || donorVal === recipientVal) continue;
    candidates.push({ feature, from: recipientVal, to: donorVal });
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[rng.int(candidates.length)]!;
  recGram[chosen.feature as string] = chosen.to;
  return { ...chosen, donorId: donor.id };
}
