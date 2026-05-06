/**
 * Phase 45f (i): taboo module.
 *
 * Owns: Phase 23's word-replacement under cultural pressure
 *       (steps/taboo.ts). When a lemma becomes culturally
 *       unutterable (death-related, sacred-name, in-law-name
 *       avoidance), it gets replaced by a circumlocution / euphemism
 *       drawn from the same cluster.
 *
 * Step: taboo trigger (per-gen probabilistic event), replacement
 * propagation (the euphemism slowly takes over the slot), taboo
 * decay (the original lemma becomes utterable again after a long
 * cultural cooldown).
 *
 * `requires: ["semantic:lexicon", "semantic:clusters"]` — taboo
 * replacement preferentially draws from within the affected
 * cluster (death → "passed on", "departed", "rest" all from the
 * motion / state-change cluster).
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface TabooState {
  // Generation when the last taboo event fired; cooldown so
  // taboo waves don't churn faster than ~50 gens.
  lastTabooGen: number;
}

const tabooModule: SimulationModule<TabooState> = {
  id: "semantic:taboo",
  kind: "semantic",
  requires: ["semantic:lexicon", "semantic:clusters"],
  initState() {
    return { lastTabooGen: 0 };
  },
  step(_lang, _state, _ctx) {
    // Phase 45f: stub. Legacy steps/taboo.ts continues to fire.
    // Will move here in Phase 46a.
  },
};

export function registerTabooModule(): void {
  registerModule(tabooModule);
}
