import type { Language, SimulationConfig, SimulationState } from "../types";
import { tryBorrow } from "../contact/borrow";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

export function stepContact(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const loan = tryBorrow(lang, state.tree, rng, config.contact.borrowProbabilityPerGeneration);
  if (loan) {
    lang.wordOrigin[loan.meaning] = `borrow:${loan.donor}`;
    pushEvent(lang, {
      generation,
      kind: "coinage",
      description: `borrowed "${loan.meaning}" from ${loan.donor} (${loan.originalForm} → ${loan.adaptedForm})`,
    });
  }
}
