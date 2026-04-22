import type { Language, SimulationConfig } from "../types";
import { maybeTabooReplace } from "../lexicon/taboo";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

export function stepTaboo(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const taboo = maybeTabooReplace(
    lang,
    rng,
    config.taboo.replacementProbability * lang.conservatism,
  );
  if (!taboo) return;
  pushEvent(lang, {
    generation,
    kind: "semantic_drift",
    description: `taboo: "${taboo.meaning}" replaced ${taboo.oldForm} → ${taboo.newForm}${
      taboo.donor ? ` (via ${taboo.donor})` : " (reduplication)"
    }`,
  });
}
