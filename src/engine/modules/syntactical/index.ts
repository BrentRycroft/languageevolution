/**
 * Phase 43 — syntactical modules barrel.
 *
 * 18 modules total:
 *   - 7 word-order strategies (sov/svo/vso/vos/ovs/osv/free)
 *   - 4 alignment strategies (nom-acc/erg-abs/tripartite/split-S)
 *   - 4 placement modules (adj/poss/num/neg)
 *   - 3 clause-level (relativiser/coordination/serialVerb)
 *
 * Languages activate exactly ONE word-order module and exactly ONE
 * alignment module (pick the one matching their typology). The
 * remaining 7 are independently toggleable.
 */

import { registerSovModule } from "./wordOrder/sov";
import { registerSvoModule } from "./wordOrder/svo";
import { registerVsoModule } from "./wordOrder/vso";
import { registerVosModule } from "./wordOrder/vos";
import { registerOvsModule } from "./wordOrder/ovs";
import { registerOsvModule } from "./wordOrder/osv";
import { registerFreeWordOrderModule } from "./wordOrder/free";
import { registerNomAccModule } from "./alignment/nomAcc";
import { registerErgAbsModule } from "./alignment/ergAbs";
import { registerTripartiteModule } from "./alignment/tripartite";
import { registerSplitSModule } from "./alignment/splitS";
import { registerAdjPlacementModule } from "./adjPlacement";
import { registerPossPlacementModule } from "./possPlacement";
import { registerNumPlacementModule } from "./numPlacement";
import { registerNegPlacementModule } from "./negPlacement";
import { registerRelativiserModule } from "./relativiser";
import { registerCoordinationModule } from "./coordination";
import { registerSerialVerbModule } from "./serialVerb";

let registered = false;

export function registerSyntacticalModules(): void {
  if (registered) return;
  registered = true;
  registerSovModule();
  registerSvoModule();
  registerVsoModule();
  registerVosModule();
  registerOvsModule();
  registerOsvModule();
  registerFreeWordOrderModule();
  registerNomAccModule();
  registerErgAbsModule();
  registerTripartiteModule();
  registerSplitSModule();
  registerAdjPlacementModule();
  registerPossPlacementModule();
  registerNumPlacementModule();
  registerNegPlacementModule();
  registerRelativiserModule();
  registerCoordinationModule();
  registerSerialVerbModule();
}

/**
 * Phase 46a-migration: map a `Language.grammar.wordOrder` value to
 * the canonical module id. Used by `grammar/evolve.ts` to swap the
 * active wordOrder module when drift flips the legacy field.
 */
export function wordOrderModuleId(
  wo: "SOV" | "SVO" | "VSO" | "VOS" | "OVS" | "OSV",
): string {
  switch (wo) {
    case "SOV": return "syntactical:wordOrder/sov";
    case "SVO": return "syntactical:wordOrder/svo";
    case "VSO": return "syntactical:wordOrder/vso";
    case "VOS": return "syntactical:wordOrder/vos";
    case "OVS": return "syntactical:wordOrder/ovs";
    case "OSV": return "syntactical:wordOrder/osv";
  }
}

export const WORD_ORDER_MODULE_IDS: ReadonlySet<string> = new Set([
  "syntactical:wordOrder/sov",
  "syntactical:wordOrder/svo",
  "syntactical:wordOrder/vso",
  "syntactical:wordOrder/vos",
  "syntactical:wordOrder/ovs",
  "syntactical:wordOrder/osv",
  "syntactical:wordOrder/free",
]);

export const SYNTACTICAL_MODULE_IDS = [
  "syntactical:wordOrder/sov",
  "syntactical:wordOrder/svo",
  "syntactical:wordOrder/vso",
  "syntactical:wordOrder/vos",
  "syntactical:wordOrder/ovs",
  "syntactical:wordOrder/osv",
  "syntactical:wordOrder/free",
  "syntactical:alignment/nom-acc",
  "syntactical:alignment/erg-abs",
  "syntactical:alignment/tripartite",
  "syntactical:alignment/split-s",
  "syntactical:adj-placement",
  "syntactical:poss-placement",
  "syntactical:num-placement",
  "syntactical:neg-placement",
  "syntactical:relativiser",
  "syntactical:coordination",
  "syntactical:serial-verb",
] as const;

export type SyntacticalModuleId = (typeof SYNTACTICAL_MODULE_IDS)[number];
