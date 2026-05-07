import type { Language, SimulationConfig } from "../types";
import { maybeTabooReplace } from "../lexicon/taboo";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { isFeatureActive } from "../modules/legacyGate";

export function stepTaboo(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  // Phase 46a-migration: taboo replacement gated on the taboo module.
  // Legacy fallback: always on (taboo was unconditional).
  if (!isFeatureActive(lang, "semantic:taboo", () => true)) return;
  const taboo = maybeTabooReplace(
    lang,
    rng,
    config.taboo.replacementProbability * lang.conservatism,
  );
  if (!taboo) return;
  pushEvent(lang, {
    generation,
    kind: "taboo",
    description: `taboo: "${taboo.meaning}" replaced ${taboo.oldForm} → ${taboo.newForm}${
      taboo.donor ? ` (via ${taboo.donor})` : " (reduplication)"
    }`,
    meta: {
      meaning: taboo.meaning,
    },
  });
}
