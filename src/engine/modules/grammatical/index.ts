/**
 * Phase 42 — grammatical modules barrel.
 *
 * Each module is registered at module-load time via its
 * `register*Module` function. Import this file once at boot
 * (`engine/modules/index.ts`) to make all grammatical modules
 * available in the registry.
 *
 * Modules are slim Phase 42 stubs that own a slice of
 * `Language.grammar`. The legacy code paths still run; Phase 46a
 * inverts the default and migrates the actual logic into these
 * module hooks.
 *
 * Module ID convention: `grammatical:<feature>` so consumers can
 * filter via `modulesByKind("grammatical")` or check by id prefix.
 */

import { registerCaseMarkingModule } from "./caseMarking";
import { registerArticlesModule } from "./articles";
import { registerNumberSystemModule } from "./numberSystem";
import { registerAspectModule } from "./aspect";
import { registerMoodModule } from "./mood";
import { registerEvidentialsModule } from "./evidentials";
import { registerPolitenessModule } from "./politeness";
import { registerReferenceTrackingModule } from "./referenceTracking";
import { registerNumeralsModule } from "./numerals";
import { registerDemonstrativesModule } from "./demonstratives";

let registered = false;

export function registerGrammaticalModules(): void {
  if (registered) return;
  registered = true;
  registerCaseMarkingModule();
  registerArticlesModule();
  registerNumberSystemModule();
  registerAspectModule();
  registerMoodModule();
  registerEvidentialsModule();
  registerPolitenessModule();
  registerReferenceTrackingModule();
  registerNumeralsModule();
  registerDemonstrativesModule();
}

export const GRAMMATICAL_MODULE_IDS = [
  "grammatical:case-marking",
  "grammatical:articles",
  "grammatical:number-system",
  "grammatical:aspect",
  "grammatical:mood",
  "grammatical:evidentials",
  "grammatical:politeness",
  "grammatical:reference-tracking",
  "grammatical:numerals",
  "grammatical:demonstratives",
] as const;

export type GrammaticalModuleId = (typeof GRAMMATICAL_MODULE_IDS)[number];
