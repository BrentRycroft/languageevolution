import type { Language } from "../types";
import type { Rng } from "../rng";
import { prunePhonemes } from "../phonology/pruning";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { phonotacticScore } from "../phonology/phonotactics";
import { effectiveTier } from "../defaults";
import { setLexiconForm } from "../lexicon/mutate";
import { syncWordsAfterPhonology } from "../lexicon/word";
import { pushEvent } from "./helpers";

/**
 * Phase 28a: unified inventory-management step. Combines what used to
 * live in two separate files:
 *   - steps/inventoryHomeostasis.ts (Phase 27b/27.1 pressure-driven pruning)
 *   - steps/phonotacticRepair.ts    (Phase 27c phonotactic-aware repair)
 *
 * Both ran one after the other in simulation.ts after stepPhonology /
 * stepLearner. Folding them clarifies the post-phonology cleanup
 * pipeline:
 *
 *   1. Phonotactic repair — fix forms that violate the language's
 *      syllable profile (e.g., CCC onset in a strict-CV language).
 *   2. Homeostatic pruning — if inventory is over its tier target,
 *      merge low-functional-load phonemes until back at target.
 *
 * Repair runs FIRST because it can lengthen forms (epenthesis) which
 * may add a phoneme like /ə/ — we want pruning to see that final
 * inventory state. The two effects don't conflict in practice.
 *
 * Real cross-linguistic data on phoneme inventory size (per cultural
 * tier the simulator tracks):
 *   tier 0: ~22 (forager / agricultural transition)
 *   tier 1: ~28 (early agricultural / pre-literate)
 *   tier 2: ~34 (literate)
 *   tier 3: ~40 (industrial)
 */

const PER_TIER_TARGET = [22, 28, 34, 40] as const;
const BASE_PRUNE_PROB = 0.03;
const MAX_PRUNE_ATTEMPTS_PER_GEN = 5;

const REPAIR_RULE_IDS = [
  "insertion.shape_repair_epenthesis",
  "insertion.prothetic_e",
  "insertion.anaptyxis",
] as const;

const REPAIR_THRESHOLD = 0.5;
const REPAIR_MIN_IMPROVEMENT = 0.05;
const MAX_REPAIRS_PER_GEN = 3;

export function tierInventoryTarget(tier: number | undefined): number {
  const t = Math.max(0, Math.min(3, Math.floor(tier ?? 0)));
  return PER_TIER_TARGET[t]!;
}

/**
 * Compute size pressure for a language. Returns 0 when at-or-below
 * target; grows linearly with overshoot. Reused by the contact-areal
 * step to gate phoneme borrowing when the recipient is already over
 * target.
 */
export function inventorySizePressure(lang: Language): number {
  const size = lang.phonemeInventory.segmental.length;
  const target = tierInventoryTarget(effectiveTier(lang));
  if (size <= target) return 0;
  return (size - target) / target;
}

/**
 * Walk the lexicon, repair any form whose phonotactic score is below
 * REPAIR_THRESHOLD by applying the first epenthesis rule that lifts
 * the score by at least REPAIR_MIN_IMPROVEMENT. Capped at
 * MAX_REPAIRS_PER_GEN to avoid mass restructuring.
 */
function runPhonotacticRepair(
  lang: Language,
  rng: Rng,
  generation: number,
): void {
  const profile = lang.phonotacticProfile;
  if (!profile || profile.strictness <= 0) return;

  const violators: { meaning: string; score: number }[] = [];
  for (const m of Object.keys(lang.lexicon)) {
    const form = lang.lexicon[m];
    if (!form || form.length === 0) continue;
    const score = phonotacticScore(form, profile);
    if (score < REPAIR_THRESHOLD) violators.push({ meaning: m, score });
  }
  if (violators.length === 0) return;
  violators.sort((a, b) => a.score - b.score);

  let repairs = 0;
  for (const { meaning, score: before } of violators) {
    if (repairs >= MAX_REPAIRS_PER_GEN) break;
    const form = lang.lexicon[meaning];
    if (!form) continue;

    for (const ruleId of REPAIR_RULE_IDS) {
      const rule = CATALOG_BY_ID[ruleId];
      if (!rule) continue;
      if (rule.probabilityFor(form) <= 0) continue;
      const repaired = rule.apply(form, rng);
      if (repaired === form || repaired.length === form.length) continue;
      const after = phonotacticScore(repaired, profile);
      if (after - before < REPAIR_MIN_IMPROVEMENT) continue;
      // Phase 29 Tranche 1 round 2: route through chokepoint.
      setLexiconForm(lang, meaning, repaired, { bornGeneration: generation, origin: "phonotactic-repair" });
      pushEvent(lang, {
        generation,
        kind: "sound_change",
        description: `phonotactic repair (${rule.id}): /${form.join("")}/ → /${repaired.join("")}/ for "${meaning}" (score ${before.toFixed(2)} → ${after.toFixed(2)})`,
        meta: { meaning, category: "phonotactic_repair" },
      });
      repairs++;
      break;
    }
  }
}

/**
 * Pressure-driven phoneme-inventory pruning. While the language is
 * over its tier target, merge phonemes one at a time (up to
 * MAX_PRUNE_ATTEMPTS_PER_GEN) until back at-target or no merger
 * candidate has a viable neighbour. When at-or-below target, fire a
 * single maintenance prune at low probability — catches the natural-
 * drift-toward-simpler-systems effect.
 */
function runHomeostasis(
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
  for (let i = 0; i < MAX_PRUNE_ATTEMPTS_PER_GEN; i++) {
    const merger = prunePhonemes(lang, rng, generation);
    if (!merger) return;
    pushEvent(lang, {
      generation,
      kind: "sound_change",
      description: `homeostatic merger (×${pressure.toFixed(2)} pressure): /${merger.from}/ → /${merger.to}/ (${merger.affectedWords} word${merger.affectedWords === 1 ? "" : "s"} affected)`,
    });
    pressure = inventorySizePressure(lang);
    if (pressure === 0) return;
  }
}

export function stepInventoryManagement(
  lang: Language,
  rng: Rng,
  generation: number,
): void {
  runPhonotacticRepair(lang, rng, generation);
  runHomeostasis(lang, rng, generation);
  // Phase 29 Tranche 7b: prunePhonemes mutates lang.lexicon directly
  // (a per-meaning setLexiconForm makes prunePhonemes O(N×W)). A
  // single end-of-step syncWordsAfterPhonology call amortises the
  // catch-up. Pre-fix this caused an infinite loop in
  // applyOneRegularChange (regular.ts safety bound `< form.length`
  // grew with the form for any insertion-style rule). Now bounded by
  // MAX_PER_MEANING_PASSES.
  if (lang.words) syncWordsAfterPhonology(lang, generation);
}

// Back-compat exports for tests that referenced the pre-28a entry
// points. Deprecated — new callers should use stepInventoryManagement.
export const stepPhonotacticRepair = (
  lang: Language,
  rng: Rng,
  generation: number,
): void => runPhonotacticRepair(lang, rng, generation);

export const stepInventoryHomeostasis = (
  lang: Language,
  rng: Rng,
  generation: number,
): void => runHomeostasis(lang, rng, generation);
