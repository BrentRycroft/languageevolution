import type { Language, SimulationConfig } from "../types";
import { driftOneMeaning } from "../semantics/drift";
import { maybeRecarve } from "../semantics/recarve";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { realismMultiplier } from "../phonology/rate";

export function stepSemantics(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const p = Math.min(1, config.semantics.driftProbabilityPerGeneration * lang.conservatism * realismMultiplier(config));
  if (rng.chance(p)) {
    // localNeighbors is a per-language override map populated at coinage
    // time for compound / derived meanings — pass it as the static
    // neighbour table so semantic drift on a compound can still find
    // adjacent meanings.
    const drift = driftOneMeaning(lang, rng, lang.localNeighbors);
    if (drift) {
      // Frequency + register transfer now happens inside driftOneMeaning
      // so takeovers preserve the old usage profile too.
      let tag = drift.kind as string;
      if (drift.takeover) tag = `${drift.kind} (takeover)`;
      else if (drift.polysemous) tag = `${drift.kind} (polysemy)`;
      pushEvent(lang, {
        generation,
        kind: "semantic_drift",
        description: `${tag}: ${drift.from} → ${drift.to}`,
      });
    }
  }
  // Re-carving: an independent rare event where the language either
  // merges two concepts into one slot (English arm+hand → Russian
  // ruka) or splits one slot into two (Latin ire → Spanish ir+andar).
  // Runs at its own probability — not gated by the drift chance.
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
