/**
 * Phase 44b: derivation engine module.
 *
 * Owns: `Language.boundMorphemes`, `Language.compounds`,
 *       `Language.derivationalSuffixes`, `Language.boundMorphemeOrigin`
 *       (types.ts:411-455).
 *
 * Realiser: renders bound morphemes inline at the right boundary —
 * currently scattered across realise.ts in ad-hoc concatenation
 * code paths (e.g., suffix attachment after the stem).
 *
 * Step: drives the four derivation-shaping mechanisms —
 *   - updateCompounds (lexicon/compound.ts:47)
 *   - maybeAffixReplacement (morphology/evolve.ts:283-340)
 *   - maybeBackformation (morphology/evolve.ts:342-395)
 *   - maybeReanalyse (lexicon/reanalysis.ts:171-184)
 *
 * `requires: ["morphological:paradigms"]` because paradigms need to
 * exist before derivational suffixes can attach to inflected stems
 * (Phase 36g compound-of-inflected handling).
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface DerivationState {
  // Generation when the last suffix replacement / backformation /
  // reanalysis fired; cooldown source for the four step mechanisms.
  lastEventGen: number;
}

const derivationModule: SimulationModule<DerivationState> = {
  id: "morphological:derivation",
  kind: "morphological",
  requires: ["morphological:paradigms"],
  initState() {
    return { lastEventGen: 0 };
  },
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 44b: stub. Legacy paths in morphology/evolve.ts (suffix
    // application) and the compound-rendering branch in realise.ts
    // continue to run. Will absorb in Phase 46a.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 44b: stub. updateCompounds / maybeAffixReplacement /
    // maybeBackformation / maybeReanalyse continue to fire from
    // steps/morphology.ts + steps/lexicon.ts. Will move here in
    // Phase 46a.
  },
};

export function registerDerivationModule(): void {
  registerModule(derivationModule);
}
