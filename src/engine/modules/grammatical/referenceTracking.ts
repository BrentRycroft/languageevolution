/**
 * Phase 42e: reference-tracking module.
 *
 * Owns: `Language.grammar.referenceTracking`
 *       (none / switch-reference / logophoric / both — Phase 36j),
 *       paradigms `verb.subord.{ss,ds}`,
 *       closed-class lemmas `3sg.log` / `3pl.log`.
 *
 * Realiser:
 *   - Switch-reference: pushes verb.subord.ss / verb.subord.ds onto
 *     the verb stack when the VP's subordSubjectCoreference is set
 *     (legacy realise.ts:670-693). Same/different subject from the
 *     matrix clause's subject.
 *   - Logophoric: routes 3sg pronouns to 3sg.log when the discourse
 *     tracker assigns a logophoric flag (Phase 36j).
 *
 * Step: reference-tracking system emergence — typologically rare;
 * future work.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const referenceTrackingModule: SimulationModule = {
  id: "grammatical:reference-tracking",
  kind: "grammatical",
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 42e: stub. Legacy realise.ts:670-693 handles SR.
    return input;
  },
};

export function registerReferenceTrackingModule(): void {
  registerModule(referenceTrackingModule);
}
