import type { Language, SimulationConfig, SimulationState } from "../types";
import { tryBorrow } from "../contact/borrow";
import { maybeArealPhonemeShare } from "../contact/areal_phonology";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { getWorldMap } from "../geo/map";

/** Per-gen probability of an areal phoneme-sharing event. Real
 *  Sprachbund phonological convergence happens over millennia, so
 *  the rate per generation is low — multiplied further by
 *  distance affinity inside `maybeArealPhonemeShare`. */
const AREAL_PHONEME_PROBABILITY = 0.005;

export function stepContact(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const worldMap = getWorldMap(config.mapMode ?? "random", config.seed);
  const loan = tryBorrow(
    lang,
    state.tree,
    rng,
    config.contact.borrowProbabilityPerGeneration,
    worldMap,
  );
  if (loan) {
    lang.wordOrigin[loan.meaning] = `borrow:${loan.donor}`;
    pushEvent(lang, {
      generation,
      kind: "borrow",
      description: `borrowed "${loan.meaning}" from ${loan.donor} (${loan.originalForm} → ${loan.adaptedForm}) @ ${Math.round(loan.distance)}`,
      meta: {
        donorId: loan.donorId,
        recipientId: lang.id,
        meaning: loan.meaning,
      },
    });
  }
  const areal = maybeArealPhonemeShare(
    lang,
    state.tree,
    rng,
    AREAL_PHONEME_PROBABILITY,
    worldMap,
  );
  if (areal) {
    pushEvent(lang, {
      generation,
      kind: "borrow",
      description: `areal phoneme: /${areal.phoneme}/ adopted from ${areal.donorName} (replacing /${areal.replacedPhoneme}/ in ${areal.affectedMeanings.length} word${areal.affectedMeanings.length === 1 ? "" : "s"})`,
      meta: {
        donorId: areal.donorId,
        recipientId: lang.id,
      },
    });
  }
}
