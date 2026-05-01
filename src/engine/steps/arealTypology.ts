import type { Language, SimulationState } from "../types";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

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

    const adoptionProb = Math.min(0.5, BASE_ADOPTION * topWeight);
    if (!rng.chance(adoptionProb)) continue;

    const before = String(myValue);
    (lang.grammar as unknown as Record<string, unknown>)[key] = topValue;
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `areal typological diffusion: ${key} ${before} → ${String(topValue)} (Sprachbund pull from ${strongLinks.length} bilingual neighbour${strongLinks.length === 1 ? "" : "s"})`,
    });
    return;
  }
}
