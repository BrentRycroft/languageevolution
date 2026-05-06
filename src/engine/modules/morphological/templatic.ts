/**
 * Phase 44e (ii): templatic-morphology module.
 *
 * Owns: Semitic-style consonantal-root + vowel-template
 *       interleaving. NEW system — no current code; this module is
 *       the canonical home for root-and-pattern dispatch.
 *
 * A templatic language stores verb / noun stems as bare consonant
 * skeletons (e.g., k-t-b "write") and selects a vowel template
 * per inflectional category (CaCaC "kataba" perfective, yaCCuC
 * "yaktub" imperfective, CāCiC "kātib" agent-nominal). The realiser
 * interleaves consonants with the active template's vowel slots.
 *
 * Realiser API once Phase 46a fills the body:
 *   `interleaveTemplate(root: string[], vowels: string[]): string`
 *
 * Activation: Arabic-style synthetic preset turns this on; the
 * default Indo-European-style presets leave it off. Languages
 * without templatic morphology don't pay any per-realise cost.
 *
 * `requires: ["morphological:paradigms"]` because the template
 * table is dispatched off paradigm slot keys (template-by-slot).
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface TemplaticState {
  // Generation when the template inventory last gained or lost a
  // slot. Diagnostic + cooldown for template fission/merger.
  lastInventoryGen: number;
}

const templaticModule: SimulationModule<TemplaticState> = {
  id: "morphological:templatic",
  kind: "morphological",
  requires: ["morphological:paradigms"],
  initState() {
    return { lastInventoryGen: 0 };
  },
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 44e: stub. No legacy code — Phase 46a (or a follow-up
    // phase if templatic depth becomes a priority) will implement
    // root-and-pattern interleaving here.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 44e: stub. Template inventory changes are a future
    // mechanism; no-op for now.
  },
};

export function registerTemplaticModule(): void {
  registerModule(templaticModule);
}
