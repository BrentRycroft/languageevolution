import type { Language, SimulationConfig } from "../types";
import { levenshtein } from "../phonology/ipa";
import { complexityFor } from "../lexicon/complexity";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { findWordsByMeaning, removeSense } from "../lexicon/word";

/**
 * Phase 21d: two meanings sharing the same Word entry are not rivals —
 * they're polysemy (one word, multiple senses), the post-Phase-21
 * representation of homonymy. Real languages let polysemous words
 * survive indefinitely (English "bank", "light", "bear"), so the
 * obsolescence rivalry mechanism should skip them.
 */
function shareWord(lang: Language, a: string, b: string): boolean {
  const wordsA = findWordsByMeaning(lang, a);
  if (wordsA.length === 0) return false;
  for (const w of wordsA) {
    if (w.senses.some((s) => s.meaning === b)) return true;
  }
  return false;
}

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
    // Phase 21d: skip rivalry when both meanings already share a Word
    // (i.e., they're polysemous senses, not competing rivals).
    if (shareWord(lang, a, b)) continue;
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
    // Phase 21d: keep the form-centric words table in sync with the
    // meaning-keyed lexicon. removeSense is a no-op when words is
    // undefined (pre-21 saves).
    removeSense(lang, loser);
    pushEvent(lang, {
      generation,
      kind: "semantic_drift",
      description: `retired "${loser}" (near-homophone of "${winner}")`,
    });
    return;
  }
}
