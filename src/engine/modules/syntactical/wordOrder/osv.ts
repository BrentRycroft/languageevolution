/**
 * Phase 43a: OSV word-order strategy module.
 *
 * Owns the OSV branch — typologically rarest; reported in
 * Warao, Xavante, and some constructed languages (Yoda's English).
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const osvModule: SimulationModule = {
  id: "syntactical:wordOrder/osv",
  kind: "syntactical",
  realiseStage: "order-tokens",
  realise(input, _lang, _state, ctx) {
    (ctx as Record<string, unknown>).order = ["O", "S", "V"];
    return input;
  },
};

export function registerOsvModule(): void {
  registerModule(osvModule);
}
