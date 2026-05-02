import type { Language, SimulationConfig } from "../types";
import { driftOneMeaning } from "../semantics/drift";
import { maybeRecarve } from "../semantics/recarve";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { realismMultiplier } from "../phonology/rate";
import { bumpFrequency } from "../lexicon/frequencyDynamics";
import { stepSemanticBleaching } from "../semantics/bleaching";
import { pruneAlts } from "../lexicon/altForms";

export function stepSemantics(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const p = Math.min(1, config.semantics.driftProbabilityPerGeneration * lang.conservatism * realismMultiplier(config));
  if (rng.chance(p)) {
    const drift = driftOneMeaning(lang, rng, lang.localNeighbors);
    if (drift) {
      let tag = drift.kind as string;
      if (drift.takeover) tag = `${drift.kind} (takeover)`;
      else if (drift.polysemous) tag = `${drift.kind} (polysemy)`;
      bumpFrequency(lang, drift.to, 0.06);
      pushEvent(lang, {
        generation,
        kind: "semantic_drift",
        description: `${tag}: ${drift.from} → ${drift.to}`,
      });
    }
  }
  const bleach = stepSemanticBleaching(lang, generation, rng);
  if (bleach) {
    pushEvent(lang, {
      generation,
      kind: "semantic_drift",
      description: bleach.dropped
        ? `bleaching: "${bleach.meaning}" fully bleached out (lexical entry retired, only morphology survives)`
        : `bleaching: "${bleach.meaning}" frequency dropping (now ${bleach.newFrequency.toFixed(2)}; grammaticalised)`,
    });
  }
  // Phase 20d altForms decay: per generation, with low probability the
  // trailing (least-frequent) alt of a meaning is dropped. Frequency-
  // protected, so high-freq doublets persist while rare ones fade.
  pruneAlts(lang, 0.02 * lang.conservatism, rng);

  const recarveRate =
    (config.semantics.recarveProbabilityPerGeneration ?? 0) * lang.conservatism;
  if (recarveRate > 0) {
    const ev = maybeRecarve(lang, rng, recarveRate);
    if (ev) {
      if (ev.kind === "merge") {
        pushEvent(lang, {
          generation,
          kind: "semantic_drift",
          description: `recarve-merge: "${ev.winner}" absorbs "${ev.loser}"`,
        });
      } else {
        pushEvent(lang, {
          generation,
          kind: "semantic_drift",
          description: `recarve-split: "${ev.source}" → "${ev.source}" + "${ev.newTarget}"`,
        });
      }
    }
  }
}
