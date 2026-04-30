import type { Language, SimulationConfig } from "../types";
import { levenshtein } from "../phonology/ipa";
import { complexityFor } from "../lexicon/complexity";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

export function stepObsolescence(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length < 2) return;
  for (let attempt = 0; attempt < 6; attempt++) {
    const a = meanings[rng.int(meanings.length)]!;
    const b = meanings[rng.int(meanings.length)]!;
    if (a === b) continue;
    const fa = lang.lexicon[a]!;
    const fb = lang.lexicon[b]!;
    if (Math.abs(fa.length - fb.length) > 1) continue;
    if (levenshtein(fa, fb) > config.obsolescence.maxDistanceForRivalry) continue;
    const scoreA = (lang.wordFrequencyHints[a] ?? 0.5) + 0.1 * complexityFor(a);
    const scoreB = (lang.wordFrequencyHints[b] ?? 0.5) + 0.1 * complexityFor(b);
    const loser = scoreA < scoreB ? a : scoreB < scoreA ? b : rng.chance(0.5) ? a : b;
    const winner = loser === a ? b : a;
    const p = config.obsolescence.probabilityPerPairPerGeneration * lang.conservatism;
    if (!rng.chance(p)) return;
    delete lang.lexicon[loser];
    delete lang.wordFrequencyHints[loser];
    if (lang.registerOf) delete lang.registerOf[loser];
    delete lang.localNeighbors[loser];
    delete lang.wordOrigin[loser];
    delete lang.lastChangeGeneration[loser];
    pushEvent(lang, {
      generation,
      kind: "semantic_drift",
      description: `retired "${loser}" (near-homophone of "${winner}")`,
    });
    return;
  }
}
