import type { Language, SimulationConfig } from "../types";
import { satGet } from "../lexicon/satellites";
import { levenshtein } from "../phonology/ipa";
import { complexityFor } from "../lexicon/complexity";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { findWordsByMeaning, recordedParts } from "../lexicon/word";
import { deleteMeaning } from "../lexicon/mutate";
import { idForGloss, lexFormById, lexIds } from "../lexicon/access";
import { buildLexemeIdToGloss } from "../lexicon/lexemeIdentity";
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
 * Lane B (lexicon lifecycle, MEGA-OVERHAUL #7/#9): disuse obsolescence. A content
 * word whose usage frequency has fallen far enough simply drops out of use — no
 * near-homophone rival required. Loss probability rises as frequency falls below
 * LOW_FREQ_THRESHOLD. This is the DEATH side of the lexical-turnover cycle: it
 * balances the (now communicative-need-driven) coinage birth pressure so the
 * lexicon reaches a STATIONARY size EMERGENTLY — there is no target number.
 *
 * Closed-class function words and structured compounds/derivations are protected
 * (the latter fade with their parts, not here). Tier-0 forager core is protected
 * ONLY while swadeshProtection is on (a SEPARATE step removes that shield); the
 * (now-working) disuse signal makes core vocab stable emergently via frequency.
 *
 * Lane B change vs Phase 4e: (a) the disuse channel now runs ONE ATTEMPT PER
 * ~SCALE words per generation instead of a single global sample, so the death
 * rate scales with lexicon size and can balance the size-scaled birth rate;
 * (b) the threshold was raised so genuinely disused words (frequency drifting
 * toward the discard floor) are reliably reclaimed; (c) it emits a dedicated
 * `lexical_loss` event (a pure death) rather than `lexical_replacement` (which
 * the scorecard double-counts as birth+death).
 */
const LOW_FREQ_THRESHOLD = 0.32;

/** One disuse-death ATTEMPT is made per this many lexemes, each generation. */
const DISUSE_ATTEMPT_PER_LEXEMES = 60;

function attemptDisuseDeath(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
  meanings: readonly string[],
): boolean {
  const base = config.obsolescence.lowFreqProbability ?? 0;
  if (base <= 0) return false;
  if (meanings.length < 1) return false;
  const m = meanings[rng.int(meanings.length)]!;
  // Protected: forager-core (Swadesh-stable), function words, and words with a
  // recorded compound/derivation structure (they fade with their parts, not here).
  // Experimental swadeshProtection=false drops the tier-0 (core) shield so core
  // words can fall out of use like any other low-frequency word.
  if (config.modes.swadeshProtection !== false && tierOf(m) === 0) return false;
  if (isClosedClass(posOf(m))) return false;
  if (recordedParts(lang, m) !== null) return false;
  const freq = satGet(lang, "wordFrequencyHints", m) ?? 0.5;
  if (freq >= LOW_FREQ_THRESHOLD) return false;
  // Probability rises as frequency drops below the threshold. The multiplier
  // sharpens the gradient so words near the discard floor die quickly while
  // words just under the threshold mostly survive (relevancy, not a cliff).
  const depth = (LOW_FREQ_THRESHOLD - freq) / LOW_FREQ_THRESHOLD;
  const p = base * 4 * depth * lang.conservatism;
  if (!rng.chance(p)) return false;
  deleteMeaning(lang, m, { generation, reason: "low-frequency-obsolescence" });
  pushEvent(lang, {
    generation,
    kind: "lexical_loss",
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
  // Run the disuse-death channel proportionally to lexicon size so the death
  // rate tracks the (size-scaled) birth rate → emergent stationarity.
  const lexemes = lexIds(lang);
  const disuseAttempts = Math.max(1, Math.round(lexemes.length / DISUSE_ATTEMPT_PER_LEXEMES));
  // Rebuild the gloss list FRESH on each use: attemptDisuseDeath deletes words, so each disuse attempt
  // (and the rivalry pass below) must observe the current, shrinking lexicon — exactly as the prior
  // per-iteration `lexKeys(lang)` calls did. A single upfront snapshot would keep sampling deleted
  // meanings and diverge (pie/english, where disuse death fires within 30 gens).
  const glossList = (): string[] => {
    // buildLexemeIdToGloss = a FRESH gloss⇆id inversion (exactly what lexKeys does). NOT
    // meaningForLexemeId, whose size-cached reverse index can read STALE here: disuse deaths delete
    // words mid-loop and the cache's size check can cycle back to a prior size with different entries,
    // resolving an id to the wrong gloss. The fresh inverter is byte-identical to the prior lexKeys.
    const g = buildLexemeIdToGloss(lang);
    const out: string[] = [];
    for (const cid of Object.keys(lang.lexemes)) {
      const m = g.get(cid);
      if (m !== undefined) out.push(m);
    }
    return out;
  };
  for (let i = 0; i < disuseAttempts; i++) {
    attemptDisuseDeath(lang, config, rng, generation, glossList());
  }
  const meanings = glossList();
  if (meanings.length < 2) return;
  for (let attempt = 0; attempt < 6; attempt++) {
    const a = meanings[rng.int(meanings.length)]!;
    const b = meanings[rng.int(meanings.length)]!;
    if (a === b) continue;
    const fa = lexFormById(lang, idForGloss(lang, a)!)!;
    const fb = lexFormById(lang, idForGloss(lang, b)!)!;
    if (Math.abs(fa.length - fb.length) > 1) continue;
    if (levenshtein(fa, fb) > config.obsolescence.maxDistanceForRivalry) continue;
    // Phase 21d: skip rivalry when both meanings already share a Word
    // (i.e., they're polysemous senses, not competing rivals).
    if (shareWord(lang, a, b)) continue;
    const scoreA = (satGet(lang, "wordFrequencyHints", a) ?? 0.5) + 0.1 * complexityFor(a);
    const scoreB = (satGet(lang, "wordFrequencyHints", b) ?? 0.5) + 0.1 * complexityFor(b);
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
    // Lane B: this is a pure word DEATH (a near-homophone rival retired). Emit
    // `lexical_loss` so the scorecard's birth/death balance counts it, instead of
    // the old `semantic_drift` kind which the lifecycle diagnostic ignored.
    pushEvent(lang, {
      generation,
      kind: "lexical_loss",
      description: `retired "${loser}" (near-homophone of "${winner}")`,
    });
    return;
  }
}
