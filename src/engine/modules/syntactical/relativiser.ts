/**
 * Phase 43d: relativiser module.
 *
 * Owns `Language.grammar.relativeClauseStrategy`
 *   - "gap": embedded clause leaves a gap at the relativised position
 *     (English "the man [who] I saw __")
 *   - "resumptive-pronoun": the relativised position carries an explicit
 *     pronoun (Hebrew, Arabic, Welsh)
 *   - "particle"/"relativizer": invariant marker (Mandarin de, Japanese no)
 *
 * Currently legacy in realise.ts:455-526
 * (`attachRelativeClause`, `pickResumptivePronoun`).
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const relativiserModule: SimulationModule = {
  id: "syntactical:relativiser",
  kind: "syntactical",
  realiseStage: "realise-subject",
  realise(input) {
    return input;
  },
};

export function registerRelativiserModule(): void {
  registerModule(relativiserModule);
}
