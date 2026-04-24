import type { Language, SimulationConfig } from "../types";
import { driftOneMeaning, type NeighborOverride } from "../semantics/drift";
import { maybeRecarve } from "../semantics/recarve";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

export function stepSemantics(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
  override?: NeighborOverride,
): void {
  const p = Math.min(1, config.semantics.driftProbabilityPerGeneration * lang.conservatism);
  if (rng.chance(p)) {
    const merged: NeighborOverride = { ...(override ?? {}) };
    for (const [m, ns] of Object.entries(lang.localNeighbors)) {
      if (!merged[m]) merged[m] = ns;
    }
    const drift = driftOneMeaning(lang, rng, merged);
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
