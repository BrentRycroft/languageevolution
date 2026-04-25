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

/** Loan-rate window: the substrate-simplification trigger looks at
 *  loans received in the last LOAN_HISTORY_WINDOW generations. */
const LOAN_HISTORY_WINDOW = 50;

/** Loans-per-window threshold above which substrate simplification
 *  fires. 3 loans in a 50-gen window ≈ 0.06 per gen — historically
 *  the rate that drove e.g. Old English's case-system collapse
 *  under Old Norse contact. */
const SUBSTRATE_LOAN_THRESHOLD = 3;

/** How many generations the accelerated-simplification phase lasts. */
const SUBSTRATE_PHASE_LENGTH = 50;

export function stepContact(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  // Trim the loan-event window so old entries don't pile up.
  if (lang.recentLoanGens && lang.recentLoanGens.length > 0) {
    lang.recentLoanGens = lang.recentLoanGens.filter(
      (g) => generation - g <= LOAN_HISTORY_WINDOW,
    );
  }
  // Decrement the substrate-acceleration timer.
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
    // Substrate-simplification trigger: when loans pile up faster
    // than the threshold, kick off an accelerated-merger phase.
    // Only fires when not already in a phase (no nesting).
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
