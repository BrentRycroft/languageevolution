/**
 * Phase 43a: OVS word-order strategy module.
 *
 * Owns the OVS branch — typologically rare; most attested in some
 * Carib languages (Hixkaryana, Apalaí).
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const ovsModule: SimulationModule = {
  id: "syntactical:wordOrder/ovs",
  kind: "syntactical",
  realiseStage: "order-tokens",
  realise(input) {
    return input;
  },
};

export function registerOvsModule(): void {
  registerModule(ovsModule);
}
