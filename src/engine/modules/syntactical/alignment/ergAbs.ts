/**
 * Phase 43b: ergative-absolutive alignment module.
 *
 * Owns the `alignment === "erg-abs"` branch. S and O get
 * absolutive, A gets ergative — Basque, Tibetan, Inuktitut,
 * many Australian + Mayan languages, Caucasian + Polynesian split-erg.
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const ergAbsModule: SimulationModule = {
  id: "syntactical:alignment/erg-abs",
  kind: "syntactical",
  realiseStage: "resolve-alignment",
  realise(input) {
    return input;
  },
};

export function registerErgAbsModule(): void {
  registerModule(ergAbsModule);
}
