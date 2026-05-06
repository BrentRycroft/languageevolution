/**
 * Phase 41+: top-level modules barrel.
 *
 * Boot-time module registration. Importing this file ensures every
 * registered module is in the registry before any language activates
 * a module via `seedActiveModules`.
 *
 * Modules organise by kind:
 * - grammatical/   (Phase 42)
 * - syntactical/   (Phase 43)
 * - morphological/ (Phase 44)
 * - semantic/      (Phase 45)
 *
 * Each kind has its own barrel that calls `registerModule()` for
 * each module file. The barrel is idempotent — multiple imports
 * are safe.
 */

import { registerGrammaticalModules } from "./grammatical";

let booted = false;

export function bootModules(): void {
  if (booted) return;
  booted = true;
  registerGrammaticalModules();
  // Phases 43-45 add their barrels here:
  // registerSyntacticalModules();
  // registerMorphologicalModules();
  // registerSemanticModules();
}

// Auto-boot at module-load time so the registry is populated before
// any language tries to activate a module.
bootModules();

export { activeModulesOf, getModule, modulesByKind, registerModule } from "./registry";
export type { SimulationModule, ModuleKind, RealiseStage, InitCtx, StepCtx } from "./types";
