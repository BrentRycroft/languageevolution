/**
 * Phase 42d: politeness module.
 *
 * Owns: `Language.grammar.politenessRegister`
 *       (none / binary / T-V / honorific / tiered / stratal —
 *        Phase 36k expanded enum).
 *
 * Realiser:
 *   - Pushes `verb.honor.formal` onto the verb stack when
 *     `vp.verb.honorific` is set (legacy realise.ts:661-665).
 *   - For T-V languages, remaps `you` → `you_fml` via
 *     closedClass.ts:remapDemonstrative (Phase 36k).
 *
 * Step: T-V emergence pathway — when a high-status pronoun is
 * borrowed (Latin "vos" → French "vous"), it grammaticalises into
 * the formal slot. Future work.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const politenessModule: SimulationModule = {
  id: "grammatical:politeness",
  kind: "grammatical",
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 42d: stub. Legacy realise.ts:661-665 handles
    // verb.honor.formal push; closedClass.ts:remapDemonstrative
    // handles you → you_fml routing.
    return input;
  },
};

export function registerPolitenessModule(): void {
  registerModule(politenessModule);
}
