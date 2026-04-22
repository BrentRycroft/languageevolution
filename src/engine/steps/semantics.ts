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
    const hint = lang.wordFrequencyHints[drift.from];
    if (hint !== undefined) {
      lang.wordFrequencyHints[drift.to] = hint;
      delete lang.wordFrequencyHints[drift.from];
    }
    pushEvent(lang, {
      generation,
      kind: "semantic_drift",
      description: `${drift.kind}: ${drift.from} → ${drift.to}`,
    });
  }
}
