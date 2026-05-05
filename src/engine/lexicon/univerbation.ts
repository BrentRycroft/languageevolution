import type { Language, Meaning } from "../types";
import type { Rng } from "../rng";
import { addCompound } from "./compound";

/**
 * Phase 34 Tranche 34f: univerbation.
 *
 * Multi-word phrases collapse into single morphological units when
 * their constituents co-occur with high enough frequency. This is
 * how "good-bye" came from "God be with ye" (5 → 1 word over
 * centuries), how French "aujourd'hui" (today) condensed from "au
 * jour de hui" (4 → 1), and how English "shan't" came from "shall
 * not" + univerbation. Slow process diachronically — a few candidate
 * collocations per thousand generations.
 *
 * The new fused form is registered as a fossilized compound
 * (Phase 34a infrastructure): the parts are remembered for the UI
 * but the surface drifts as a single unit.
 *
 * Returns the meaning that got univerbated, or null when no
 * candidate fired this gen.
 */

const UNIVERBATION_RATE = 0.0015;

/**
 * Cross-linguistic univerbation candidates that the simulator can
 * recognise from existing meanings. Each entry: [newMeaning,
 * [parts...], contextHint]. Only fires if the parts are all in the
 * lexicon and the new meaning isn't already there.
 */
const CANDIDATES: ReadonlyArray<{
  meaning: Meaning;
  parts: Meaning[];
  freqMin: number;
}> = [
  { meaning: "today", parts: ["this", "day"], freqMin: 0.6 },
  { meaning: "tonight", parts: ["this", "night"], freqMin: 0.6 },
  { meaning: "tomorrow", parts: ["next", "day"], freqMin: 0.5 },
  { meaning: "goodbye", parts: ["good", "day"], freqMin: 0.4 },
  { meaning: "however", parts: ["how", "ever"], freqMin: 0.4 },
  { meaning: "nobody", parts: ["no", "body"], freqMin: 0.5 },
  { meaning: "anyone", parts: ["any", "one"], freqMin: 0.5 },
  { meaning: "anywhere", parts: ["any", "where"], freqMin: 0.4 },
];

export function tryUniverbation(
  lang: Language,
  rng: Rng,
  generation: number,
): { meaning: Meaning; parts: Meaning[] } | null {
  if (!rng.chance(UNIVERBATION_RATE)) return null;
  // Find a candidate whose parts are all present and avg freq is
  // above its threshold.
  const eligible = CANDIDATES.filter((c) => {
    if (lang.lexicon[c.meaning]) return false;
    for (const p of c.parts) {
      if (!lang.lexicon[p]) return false;
      const freq = lang.wordFrequencyHints[p] ?? 0.5;
      if (freq < c.freqMin) return false;
    }
    return true;
  });
  if (eligible.length === 0) return null;
  const chosen = eligible[rng.int(eligible.length)]!;
  // Register as a compound that fossilises immediately. Univerbated
  // forms drift as a single unit from the moment they emerge — this
  // is the "single morphological word" property of univerbation.
  addCompound(lang, chosen.meaning, chosen.parts, generation);
  if (!lang.compounds) lang.compounds = {};
  const meta = lang.compounds[chosen.meaning];
  if (meta) {
    meta.fossilized = true;
    meta.fossilizedGen = generation;
  }
  // Set a high frequency hint so the new word isn't immediately
  // discarded by erosion.
  lang.wordFrequencyHints[chosen.meaning] = 0.8;
  if (!lang.wordOrigin) lang.wordOrigin = {};
  lang.wordOrigin[chosen.meaning] = "univerbation";
  return { meaning: chosen.meaning, parts: chosen.parts };
}
