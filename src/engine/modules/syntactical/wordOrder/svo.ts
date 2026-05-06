/**
 * Phase 43a: SVO word-order strategy module.
 *
 * Owns the SVO branch (English, Mandarin, Romance, modern Germanic).
 * Currently `sliceOrder` in `translator/wordOrder.ts`.
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const svoModule: SimulationModule = {
  id: "syntactical:wordOrder/svo",
  kind: "syntactical",
  realiseStage: "order-tokens",
  realise(input) {
    return input;
  },
};

export function registerSvoModule(): void {
  registerModule(svoModule);
}
