import type { Language, SimulationConfig, SimulationState } from "../types";
import { tryBorrow } from "../contact/borrow";
import { maybeArealPhonemeShare } from "../contact/areal_phonology";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { getWorldMap } from "../geo/map";

const AREAL_PHONEME_PROBABILITY = 0.005;

const LOAN_HISTORY_WINDOW = 50;

const SUBSTRATE_LOAN_THRESHOLD = 3;

const SUBSTRATE_PHASE_LENGTH = 50;

export function stepContact(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  if (lang.recentLoanGens && lang.recentLoanGens.length > 0) {
    lang.recentLoanGens = lang.recentLoanGens.filter(
      (g) => generation - g <= LOAN_HISTORY_WINDOW,
    );
  }
  if (lang.substrateAccelerationRemaining && lang.substrateAccelerationRemaining > 0) {
    lang.substrateAccelerationRemaining -= 1;
  }

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
    if (!lang.recentLoanGens) lang.recentLoanGens = [];
    lang.recentLoanGens.push(generation);
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
    const currentLoanRate = (lang.recentLoanGens?.length ?? 0);
    if (
      currentLoanRate >= SUBSTRATE_LOAN_THRESHOLD &&
      (!lang.substrateAccelerationRemaining || lang.substrateAccelerationRemaining <= 0)
    ) {
      lang.substrateAccelerationRemaining = SUBSTRATE_PHASE_LENGTH;
      pushEvent(lang, {
        generation,
        kind: "grammar_shift",
        description: `substrate-simplification phase: ${currentLoanRate} loans in ${LOAN_HISTORY_WINDOW} gens triggered ${SUBSTRATE_PHASE_LENGTH}-gen accelerated mergers`,
      });
    }
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
