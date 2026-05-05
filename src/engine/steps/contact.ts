import type { Language, SimulationConfig, SimulationState } from "../types";
import { tryBorrow } from "../contact/borrow";
import { tryCalque } from "../contact/calque";
import { tryStructuralBorrow } from "../contact/structuralBorrow";
import { maybeArealPhonemeShare } from "../contact/areal_phonology";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { getWorldMap } from "../geo/map";
import { bumpFrequency } from "../lexicon/frequencyDynamics";
import { computeBilingualLinks } from "../contact/bilingual";

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
  lang.bilingualLinks = computeBilingualLinks(lang, state.tree, worldMap);
  const loan = tryBorrow(
    lang,
    state.tree,
    rng,
    config.contact.borrowProbabilityPerGeneration,
    worldMap,
    generation,
  );
  if (loan) {
    lang.wordOrigin[loan.meaning] = `borrow:${loan.donor}`;
    bumpFrequency(lang, loan.meaning, 0.1);
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
  // Phase 36 Tranche 36m: calque (loan-translation) — when a sister
  // leaf has a transparent compound for a meaning the recipient
  // lacks, copy the *structure* and stitch it from the recipient's
  // own parts. Models compassio → Mitleid pattern.
  if (lang.bilingualLinks) {
    for (const partnerId of Object.keys(lang.bilingualLinks)) {
      if ((lang.bilingualLinks[partnerId] ?? 0) <= 0) continue;
      const donorNode = state.tree[partnerId];
      if (!donorNode) continue;
      const donor = donorNode.language;
      if (donor.extinct) continue;
      const calque = tryCalque(lang, donor, rng, 0.0008);
      if (calque) {
        if (!lang.borrowHistory) lang.borrowHistory = {};
        if (!lang.borrowHistory[calque.meaning]) lang.borrowHistory[calque.meaning] = [];
        lang.borrowHistory[calque.meaning]!.push({
          fromLangId: donor.id,
          generation,
          surface: calque.form.join(""),
        });
        pushEvent(lang, {
          generation,
          kind: "borrow",
          description: `calque: "${calque.meaning}" loan-translated from ${donor.name} (parts: ${calque.parts.join(" + ")})`,
          meta: { donorId: donor.id, recipientId: lang.id, meaning: calque.meaning },
        });
        break; // one calque per gen
      }
    }
  }
  // Phase 38f: structural substrate absorption. Heavy-contact
  // bilingual pairs absorb each other's grammar features (word order,
  // articles, etc.). Fires at ~0.3%/gen, gated on link strength
  // ≥ 0.4 and dampened by recipient literacy.
  if (lang.bilingualLinks) {
    for (const partnerId of Object.keys(lang.bilingualLinks)) {
      const donorNode = state.tree[partnerId];
      if (!donorNode) continue;
      const donor = donorNode.language;
      if (donor.extinct) continue;
      const transfer = tryStructuralBorrow(lang, donor, rng);
      if (transfer) {
        pushEvent(lang, {
          generation,
          kind: "areal",
          description: `structural transfer: ${String(transfer.feature)} ${String(transfer.from)} → ${String(transfer.to)} (from ${donor.name})`,
          meta: { donorId: donor.id, recipientId: lang.id },
        });
        break; // one structural transfer per gen
      }
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
