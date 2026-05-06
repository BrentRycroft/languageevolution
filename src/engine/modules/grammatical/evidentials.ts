/**
 * Phase 42d: evidentials module.
 *
 * Owns: `Language.grammar.evidentialMarking`
 *       (none / direct-only / two-way / three-way), paradigms
 *       `verb.evid.{dir,rep,inf}`.
 *
 * Realiser: pushes the matching evidential `MorphCategory` onto the
 * verb inflection stack. Currently legacy in realise.ts:650-660.
 *
 * Step: evidential-system grammaticalisation (e.g., "they say"
 * collocation → reportative clitic → suffix). Future work.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const evidentialsModule: SimulationModule = {
  id: "grammatical:evidentials",
  kind: "grammatical",
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 42d: stub. Legacy realise.ts:650-660 handles evidential
    // morph-cat push today.
    return input;
  },
};

export function registerEvidentialsModule(): void {
  registerModule(evidentialsModule);
}
