/**
 * Phase 45c: frequency engine module.
 *
 * Owns: `Language.wordFrequencyHints`, `Language.registerOf`,
 *       `Language.registerStrata`. Tracks per-word frequency tier
 *       (Swadesh / common / register-marked / rare) over generations.
 *
 * Other modules depend on this for gating thresholds:
 *   - phonology/apply.ts:316 — Swadesh brake (high-frequency words
 *     resist sound change at a higher rate)
 *   - lexicon/variants.ts:96-99 — Phase 40b variant gating
 *     (low-frequency words accept variant forms more readily)
 *
 * Step: frequency drift over generations
 * (lexicon/frequencyDynamics.ts) — words rise / fall in tier
 * based on usage; register-marked words promote/demote between
 * formal / colloquial strata.
 *
 * `requires: ["semantic:lexicon"]` — frequency hints key off
 * lexicon entries.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface FrequencyState {
  // Generation when the frequency table was last rebalanced.
  // Cooldown for tier-shift events.
  lastRebalanceGen: number;
}

const frequencyModule: SimulationModule<FrequencyState> = {
  id: "semantic:frequency",
  kind: "semantic",
  requires: ["semantic:lexicon"],
  initState() {
    return { lastRebalanceGen: 0 };
  },
  step(_lang, _state, _ctx) {
    // Phase 45c: stub. Legacy frequency-drift mechanism in
    // lexicon/frequencyDynamics.ts continues to fire. Will move
    // here in Phase 46a so the Swadesh brake + variant gating both
    // read from the module's state.
  },
};

export function registerFrequencyModule(): void {
  registerModule(frequencyModule);
}
