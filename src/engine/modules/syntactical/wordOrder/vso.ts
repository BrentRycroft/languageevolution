/**
 * Phase 43a: VSO word-order strategy module.
 *
 * Owns the VSO branch (Welsh, Classical Arabic, Tagalog, Hawaiian).
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const vsoModule: SimulationModule = {
  id: "syntactical:wordOrder/vso",
  kind: "syntactical",
  realiseStage: "order-tokens",
  realise(input, _lang, _state, ctx) {
    (ctx as Record<string, unknown>).order = ["V", "S", "O"];
    return input;
  },
};

export function registerVsoModule(): void {
  registerModule(vsoModule);
}
