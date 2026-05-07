/**
 * Phase 43a: free word-order strategy module.
 *
 * Owns the "free" branch — pragmatically/case-determined word
 * order (Latin, Russian, Warlpiri). The realiser short-circuits
 * the reordering pass: no canonical S/O/V slot order is enforced;
 * the parsed token stream surfaces unchanged (or with mild
 * focus-position bias once Phase 47+ adds discourse modules).
 *
 * Activating this module on a typologically isolating + free-order
 * language skips the entire `sliceOrder` dispatch in realise.ts,
 * one of the perf wins promised in the Phase 41 spine.
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const freeModule: SimulationModule = {
  id: "syntactical:wordOrder/free",
  kind: "syntactical",
  realiseStage: "order-tokens",
  realise(input, lang, _state, ctx) {
    // Free word order: fall back to whatever `lang.grammar.wordOrder`
    // declares as the surface default. Pragmatic-driven reordering
    // is out of scope here.
    const wo = lang.grammar.wordOrder;
    (ctx as Record<string, unknown>).order =
      wo === "SOV" ? ["S", "O", "V"]
      : wo === "VSO" ? ["V", "S", "O"]
      : wo === "VOS" ? ["V", "O", "S"]
      : wo === "OVS" ? ["O", "V", "S"]
      : wo === "OSV" ? ["O", "S", "V"]
      : ["S", "V", "O"];
    return input;
  },
};

export function registerFreeWordOrderModule(): void {
  registerModule(freeModule);
}
