import type { Language, SimulationConfig } from "../types";
import { levenshtein } from "../phonology/ipa";
import { complexityFor } from "../lexicon/complexity";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { findWordsByMeaning, recordedParts } from "../lexicon/word";
import { deleteMeaning } from "../lexicon/mutate";
import { lexGet, lexKeys } from "../lexicon/access";
import { tierOf } from "../lexicon/concepts";
import { isClosedClass, posOf } from "../lexicon/pos";

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

/**
 * Phase 4e: low-frequency obsolescence. A content word whose usage frequency
 * has fallen far enough simply drops out of use — no near-homophone rival
 * required. Loss probability rises as frequency falls below LOW_FREQ_THRESHOLD.
 * Tier-0 forager core (the Swadesh-stable vocabulary), closed-class function
 * words, and structured compounds/derivations are protected. This is the death
 * side of the lexical-turnover cycle: it balances the genesis EXPANSION_NEED
 * birth pressure so the lexicon stays roughly stationary instead of only ever
 * growing.
 */
const LOW_FREQ_THRESHOLD = 0.3;

function maybeLowFreqObsolescence(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): boolean {
  const base = config.obsolescence.lowFreqProbability ?? 0;
  if (base <= 0) return false;
  const meanings = lexKeys(lang);
  if (meanings.length < 1) return false;
  const m = meanings[rng.int(meanings.length)]!;
  // Protected: forager-core (Swadesh-stable), function words, and words with a
  // recorded compound/derivation structure (they fade with their parts, not here).
  // Experimental swadeshProtection=false drops the tier-0 (core) shield so core
  // words can fall out of use like any other low-frequency word.
  if (config.modes.swadeshProtection !== false && tierOf(m) === 0) return false;
  if (isClosedClass(posOf(m))) return false;
  if (recordedParts(lang, m) !== null) return false;
  const freq = lang.wordFrequencyHints[m] ?? 0.5;
  if (freq >= LOW_FREQ_THRESHOLD) return false;
  // Probability rises linearly as frequency drops below the threshold.
  const p = base * ((LOW_FREQ_THRESHOLD - freq) / LOW_FREQ_THRESHOLD) * lang.conservatism;
  if (!rng.chance(p)) return false;
  deleteMeaning(lang, m, { generation, reason: "low-frequency-obsolescence" });
  pushEvent(lang, {
    generation,
    kind: "lexical_replacement",
    description: `lost low-frequency "${m}" (fell out of use)`,
  });
  return true;
}

export function stepObsolescence(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  maybeLowFreqObsolescence(lang, config, rng, generation);
  const meanings = lexKeys(lang);
  if (meanings.length < 2) return;
  for (let attempt = 0; attempt < 6; attempt++) {
    const a = meanings[rng.int(meanings.length)]!;
    const b = meanings[rng.int(meanings.length)]!;
    if (a === b) continue;
    const fa = lexGet(lang, a)!;
    const fb = lexGet(lang, b)!;
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
    // Phase 72d-2 (defer-1a): record homonym-resolution pathway.
    deleteMeaning(lang, loser, {
      mergedInto: winner,
      generation,
      reason: "homonym-resolution",
    });
    pushEvent(lang, {
      generation,
      kind: "semantic_drift",
      description: `retired "${loser}" (near-homophone of "${winner}")`,
    });
    return;
  }
}
