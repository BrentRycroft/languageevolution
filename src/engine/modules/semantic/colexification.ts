/**
 * Phase 45d (ii): colexification module.
 *
 * Owns: `Language.colexifiedAs` — cross-meaning form-sharing
 *       (one form expresses two related meanings; e.g., "fire"
 *       colexifies "warmth" in many languages). Currently in
 *       semantics/colexification.ts.
 *
 * Step: colexification genesis (when two near-cluster lemmas have
 * sufficiently overlapping contexts, one's form spreads to the
 * other's slot), de-colexification (when the two senses diverge
 * culturally, the form-sharing breaks).
 *
 * `requires: ["semantic:lexicon", "semantic:clusters"]` because
 * colexification is cluster-mediated — form-sharing prefers
 * within-cluster pairs.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface ColexificationState {
  // Generation when the last colexification event fired.
  lastEventGen: number;
}

const colexificationModule: SimulationModule<ColexificationState> = {
  id: "semantic:colexification",
  kind: "semantic",
  requires: ["semantic:lexicon", "semantic:clusters"],
  initState() {
    return { lastEventGen: 0 };
  },
  step(_lang, _state, _ctx) {
    // Phase 45d: stub. Legacy semantics/colexification.ts continues
    // to drive colexification events. Will move here in Phase 46a.
  },
};

export function registerColexificationModule(): void {
  registerModule(colexificationModule);
}
