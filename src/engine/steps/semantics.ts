import type { Language, SimulationConfig } from "../types";
import { driftOneMeaning, type NeighborOverride } from "../semantics/drift";
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
  if (!rng.chance(p)) return;
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
