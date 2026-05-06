/**
 * Phase 44 — morphological modules barrel.
 *
 * 6 modules total:
 *   - paradigms       — owns the flat Morphology.paradigms table
 *   - derivation      — owns boundMorphemes / compounds /
 *                       derivationalSuffixes / boundMorphemeOrigin
 *   - inflectionClass — Latin-style 1/2/3 conjugation classes
 *   - agreement       — nounClassAssignments + gender propagation
 *   - analogy         — paradigm leveling + irregularity rebound
 *   - templatic       — Semitic-style root-and-pattern (new system)
 *
 * Topological dependencies (registry honours `requires`):
 *   paradigms (root)
 *     ├─ derivation
 *     ├─ inflectionClass
 *     │    └─ analogy
 *     ├─ agreement
 *     └─ templatic
 *
 * The performance win at Phase 46a: an isolating language (Toki
 * Pona, surface-style Mandarin) activates only the modules it
 * needs (often none of these), skipping paradigm dispatch +
 * inflectional class lookup + analogy + agreement entirely.
 */

import { registerParadigmsModule } from "./paradigms";
import { registerDerivationModule } from "./derivation";
import { registerInflectionClassModule } from "./inflectionClass";
import { registerAgreementModule } from "./agreement";
import { registerAnalogyModule } from "./analogy";
import { registerTemplaticModule } from "./templatic";

let registered = false;

export function registerMorphologicalModules(): void {
  if (registered) return;
  registered = true;
  registerParadigmsModule();
  registerDerivationModule();
  registerInflectionClassModule();
  registerAgreementModule();
  registerAnalogyModule();
  registerTemplaticModule();
}

export const MORPHOLOGICAL_MODULE_IDS = [
  "morphological:paradigms",
  "morphological:derivation",
  "morphological:inflection-class",
  "morphological:agreement",
  "morphological:analogy",
  "morphological:templatic",
] as const;

export type MorphologicalModuleId = (typeof MORPHOLOGICAL_MODULE_IDS)[number];
