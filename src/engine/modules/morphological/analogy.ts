/**
 * Phase 44e (i): analogy module.
 *
 * Owns: paradigm-leveling pressure, irregularity rebound, slot
 *       reanalysis. Touches the paradigm table directly (as the
 *       owning module is `morphological:paradigms`, this module
 *       declares it as a requirement).
 *
 * Step: drives the four analogy mechanisms —
 *   - paradigm leveling (a frequent regular form drags an
 *     irregular form into line; e.g., English "holp" → "helped")
 *   - irregularity rebound (a high-frequency irregular form
 *     reasserts and pulls neighbours back)
 *   - slot reanalysis (a syncretism gets reinterpreted as a
 *     different category split)
 *   - paradigm split (a single inflection class fissions into two
 *     when phonological erosion makes its uniformity untenable)
 *
 * Currently spread across morphology/analogy.ts and
 * morphology/evolve.ts:209-256.
 *
 * `requires: ["morphological:paradigms", "morphological:inflection-class"]`
 * because both feed the leveling pressure (a class with one
 * paradigm shape has nothing to level toward).
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface AnalogyState {
  // Generation when leveling last fired; cooldown so leveling
  // doesn't churn faster than ~25 gens (matches Phase 39m drift
  // cadence).
  lastLevelingGen: number;
}

const analogyModule: SimulationModule<AnalogyState> = {
  id: "morphological:analogy",
  kind: "morphological",
  requires: ["morphological:paradigms", "morphological:inflection-class"],
  initState() {
    return { lastLevelingGen: 0 };
  },
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 44e: stub. Analogy is a step-time mechanism; the realise
    // hook is reserved for future use (e.g., on-the-fly
    // regularisation in spontaneous-style register).
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 44e: stub. Legacy paradigm-leveling in
    // morphology/analogy.ts + morphology/evolve.ts:209-256 continues
    // to fire. Will move here in Phase 46a.
  },
};

export function registerAnalogyModule(): void {
  registerModule(analogyModule);
}
