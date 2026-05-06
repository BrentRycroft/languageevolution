/**
 * Phase 43a: VOS word-order strategy module.
 *
 * Owns the VOS branch (Malagasy, Fijian, some Mayan).
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const vosModule: SimulationModule = {
  id: "syntactical:wordOrder/vos",
  kind: "syntactical",
  realiseStage: "order-tokens",
  realise(input, _lang, _state, ctx) {
    (ctx as Record<string, unknown>).order = ["V", "O", "S"];
    return input;
  },
};

export function registerVosModule(): void {
  registerModule(vosModule);
}
