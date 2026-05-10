import type { Language, SimulationState } from "../types";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { setGrammarFeature } from "../grammar/mutate";

/**
 * arealTypology.ts
 *
 * Per-generation step orchestrators called from simulation.ts (one file per major substep). Key exports: stepArealTypology.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const TYPOLOGY_CADENCE = 6;
const BASE_ADOPTION = 0.12;
const STRONG_BILINGUAL_THRESHOLD = 0.25;

type DiffusableKey =
  | "wordOrder"
  | "alignment"
  | "harmony"
  | "classifierSystem"
  | "evidentialMarking"
  | "relativeClauseStrategy"
  | "serialVerbConstructions"
  | "politenessRegister"
  | "adjectivePosition"
  | "possessorPosition"
  | "numeralPosition";

const DIFFUSABLE_KEYS: ReadonlyArray<DiffusableKey> = [
  "wordOrder",
  "alignment",
  "harmony",
  "classifierSystem",
  "evidentialMarking",
  "relativeClauseStrategy",
  "serialVerbConstructions",
  "politenessRegister",
  "adjectivePosition",
  "possessorPosition",
  "numeralPosition",
];

export function stepArealTypology(
  state: SimulationState,
  lang: Language,
  rng: Rng,
  generation: number,
): void {
  if (generation % TYPOLOGY_CADENCE !== 0) return;
  const links = lang.bilingualLinks;
  if (!links) return;
  const strongLinks = Object.entries(links).filter(([, frac]) => frac >= STRONG_BILINGUAL_THRESHOLD);
  if (strongLinks.length === 0) return;

  for (const key of DIFFUSABLE_KEYS) {
    const myValue = lang.grammar[key];
    const neighbourTally = new Map<unknown, number>();
    for (const [otherId, frac] of strongLinks) {
      const other = state.tree[otherId]?.language;
      if (!other) continue;
      const theirValue = other.grammar[key];
      if (theirValue === undefined || theirValue === myValue) continue;
      neighbourTally.set(theirValue, (neighbourTally.get(theirValue) ?? 0) + frac);
    }
    if (neighbourTally.size === 0) continue;

    let topValue: unknown = undefined;
    let topWeight = 0;
    for (const [v, w] of neighbourTally) {
      if (w > topWeight) {
        topWeight = w;
        topValue = v;
      }
    }
    if (topValue === undefined) continue;

    // Phase 72f T7: prestige-weighted areal adoption. Pre-72f the
    // adoption probability was uniform across all neighbours (only
    // bilingual link strength counted). Real Sprachbund formation
    // shows a clear directionality: prestige donors (Latin in the
    // medieval Mediterranean, Mandarin in the Sinosphere, French in
    // Africa) exert disproportionate pull. We rebuild the topWeight
    // with a prestige multiplier per donor, where:
    //   - donor.tier > recipient.tier: ×(1 + 0.5 × tierGap)
    //   - donor has prestigeVariety: ×1.5
    let prestigeWeight = 0;
    for (const [otherId, frac] of strongLinks) {
      const other = state.tree[otherId]?.language;
      if (!other) continue;
      if (other.grammar[key] !== topValue) continue;
      const tierGap = (other.culturalTier ?? 0) - (lang.culturalTier ?? 0);
      const tierMult = 1 + Math.max(0, tierGap) * 0.5;
      const prestigeMult = other.prestigeVariety ? 1.5 : 1.0;
      prestigeWeight += frac * tierMult * prestigeMult;
    }
    // Phase 72f T7: also raise BASE_ADOPTION ceiling — pre-72f cap of
    // 0.5 was too restrictive given the new prestige multipliers; we
    // raise to 0.7 for prestige-driven cases (uncapped weight × base
    // would otherwise saturate too quickly to be useful).
    const adoptionProb = Math.min(0.7, BASE_ADOPTION * prestigeWeight);
    if (!rng.chance(adoptionProb)) continue;

    const before = String(myValue);
    // Phase 29-2d: routed through setGrammarFeature so the assignment
    // type-checks. `topValue` was tallied from sibling languages'
    // `grammar[key]`, so its runtime shape matches the field type;
    // the cast inside the helper makes that explicit in one place.
    setGrammarFeature(
      lang.grammar,
      key,
      topValue as import("../types").GrammarFeatures[typeof key],
    );
    pushEvent(lang, {
      generation,
      kind: "areal",
      description: `areal typological diffusion: ${key} ${before} → ${String(topValue)} (Sprachbund pull from ${strongLinks.length} bilingual neighbour${strongLinks.length === 1 ? "" : "s"})`,
    });
    return;
  }
}
