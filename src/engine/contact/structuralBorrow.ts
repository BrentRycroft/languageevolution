import type { Language, GrammarFeatures } from "../types";
import type { Rng } from "../rng";

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
  // Literacy resistance: tier-2+ literate recipients restructure
  // less readily under contact.
  const literacyResist = (recipient.literaryStability ?? 0) >= 0.6 ? 0.3 : 1;
  if (!rng.chance(baseRate * literacyResist)) return null;
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
