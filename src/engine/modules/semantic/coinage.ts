/**
 * Phase 45f (ii): coinage module.
 *
 * Owns: the genesis pipeline — compound + derivation +
 *       sound-symbolism mechanisms that produce **new** lemmas
 *       (as opposed to borrowed/calqued ones).
 *
 * Currently spread across:
 *   - steps/genesis.ts (top-level dispatch)
 *   - genesis/mechanisms/*  (compound, derivation, blend,
 *                            clipping, sound-symbolic, ideophone)
 *
 * Step: per-gen coinage roll — gated on (a) lexical pressure
 * (open semantic slot), (b) pattern fertility (productive
 * derivational suffixes available), (c) frequency tilt (frequent
 * concepts coin more readily than rare ones).
 *
 * `requires: ["semantic:lexicon", "semantic:clusters", "semantic:frequency"]`
 * — coinage targets cluster-marked concept slots and is
 * frequency-weighted.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface CoinageState {
  // Generation when the last coinage event fired.
  lastCoinageGen: number;
}

const coinageModule: SimulationModule<CoinageState> = {
  id: "semantic:coinage",
  kind: "semantic",
  requires: ["semantic:lexicon", "semantic:clusters", "semantic:frequency"],
  initState() {
    return { lastCoinageGen: 0 };
  },
  step(_lang, _state, _ctx) {
    // Phase 45f: stub. Legacy steps/genesis.ts + genesis/mechanisms
    // continue to fire. Will move here in Phase 46a so vocab-frozen
    // language presets can opt out cleanly.
  },
};

export function registerCoinageModule(): void {
  registerModule(coinageModule);
}
