import type { Language } from "../types";
import type { Rng } from "../rng";
import { prunePhonemes } from "../phonology/pruning";
import { pushEvent } from "./helpers";

/**
 * Phase 27b: dynamic phoneme-inventory homeostasis.
 *
 * Real cross-linguistic data on phoneme inventory size:
 *   - Pirahã (forager): ~10
 *   - Hawaiian / Toki Pona: ~13–14
 *   - Most languages: 22–35
 *   - Greek/Spanish: 24–25
 *   - English: 44
 *   - Sanskrit: 48
 *   - !Xõõ (extreme): ~140
 *
 * Distribution scales loosely with cultural complexity. The simulator
 * tracks `culturalTier` 0..3, so we map per-tier targets:
 *   tier 0: ~22 (forager / agricultural transition)
 *   tier 1: ~28 (early agricultural / pre-literate)
 *   tier 2: ~34 (literate)
 *   tier 3: ~40 (industrial)
 *
 * When current inventory size exceeds the tier target, "size pressure"
 * scales the per-generation pruning probability upward AND biases
 * `prunePhonemes` toward low-functional-load candidates (already done
 * in 27b's pruning.ts changes). When pressure exceeds 0.5, also gates
 * `maybeArealPhonemeShare` calls (suppressed externally).
 *
 * This is NOT a hard cap — it's homeostatic pressure. A language at
 * 60 phonemes won't snap to 22 overnight; it'll merge ~1 phoneme per
 * generation until the system relaxes.
 */

const PER_TIER_TARGET = [22, 28, 34, 40] as const;
const BASE_PRUNE_PROB = 0.03;
// Phase 27.1: per-generation hard cap on consecutive merger attempts.
// At high pressure we prune until either we hit the cap or no
// candidate has a viable neighbour. This is needed because sound-
// change rules can introduce multiple novel phonemes per generation
// (palatalisation, labialisation, vowel lengthening, etc.) and a
// fixed small attempt count can't keep up.
const MAX_ATTEMPTS_PER_GEN = 5;

export function tierInventoryTarget(tier: number | undefined): number {
  const t = Math.max(0, Math.min(3, Math.floor(tier ?? 0)));
  return PER_TIER_TARGET[t]!;
}

/**
 * Compute the size pressure for a language. Returns 0 when at-or-below
 * target; grows with how far over target. Used by the homeostasis step
 * to scale pruning rate AND by the contact step to gate areal phoneme
 * adoption.
 */
export function inventorySizePressure(lang: Language): number {
  const size = lang.phonemeInventory.segmental.length;
  const target = tierInventoryTarget(lang.culturalTier);
  if (size <= target) return 0;
  return (size - target) / target;
}

/**
 * Phase 27.1: pressure-driven homeostasis. While the language is over
 * target, prune phonemes one at a time until either we're at-target
 * or no further candidate has a viable neighbour. Capped at
 * MAX_ATTEMPTS_PER_GEN to avoid pathological gens with mass merger.
 *
 * When at-or-below target, fire a maintenance prune at low probability
 * (catches the natural-drift-toward-simpler-systems effect).
 */
export function stepInventoryHomeostasis(
  lang: Language,
  rng: Rng,
  generation: number,
): void {
  let pressure = inventorySizePressure(lang);
  if (pressure === 0) {
    if (!rng.chance(BASE_PRUNE_PROB)) return;
    const merger = prunePhonemes(lang, rng, generation);
    if (merger) {
      pushEvent(lang, {
        generation,
        kind: "sound_change",
        description: `maintenance merger: /${merger.from}/ → /${merger.to}/ (${merger.affectedWords} word${merger.affectedWords === 1 ? "" : "s"} affected)`,
      });
    }
    return;
  }
  for (let i = 0; i < MAX_ATTEMPTS_PER_GEN; i++) {
    const merger = prunePhonemes(lang, rng, generation);
    if (!merger) return;
    pushEvent(lang, {
      generation,
      kind: "sound_change",
      description: `homeostatic merger (×${pressure.toFixed(2)} pressure): /${merger.from}/ → /${merger.to}/ (${merger.affectedWords} word${merger.affectedWords === 1 ? "" : "s"} affected)`,
    });
    pressure = inventorySizePressure(lang);
    if (pressure === 0) return; // back at target
  }
}
