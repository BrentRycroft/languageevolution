import type { Language, Meaning, Word, WordSense } from "../types";
import type { DiscourseGenre } from "./discourse";
import { findWordsByMeaning } from "../lexicon/word";

/**
 * Phase 58 T1: per-genre style biases for narrative output.
 *
 * When a meaning has multiple lexicalised forms (Phase 53 T5
 * affix synonyms; Phase 37 polysemy + altForms), the narrative
 * generator can pick differently per genre:
 *   - Poetry: prefers older / rarer / high-register forms.
 *   - Myth / legend: prefers older + high-register.
 *   - Daily / dialogue: prefers most-productive + low-register.
 *
 * Hooks into the existing `WordSense.register` ("high" | "low" |
 * "neutral") and `WordSense.bornGeneration` (older = lower number).
 *
 * Returns the picked Word + sense-index, or null when the meaning
 * has no candidates. Callers can fall through to the standard
 * lookup if null.
 */

interface GenreWeights {
  /** Multiplier for high-register senses. */
  highRegister: number;
  /** Multiplier for low-register senses. */
  lowRegister: number;
  /** Bias strength toward older senses (0 = no bias, 1 = strong). */
  oldnessBias: number;
}

const GENRE_WEIGHTS: Record<DiscourseGenre, GenreWeights> = {
  myth: { highRegister: 2.0, lowRegister: 0.5, oldnessBias: 0.7 },
  legend: { highRegister: 1.7, lowRegister: 0.6, oldnessBias: 0.5 },
  poetry: { highRegister: 1.8, lowRegister: 0.5, oldnessBias: 0.6 },
  daily: { highRegister: 0.7, lowRegister: 1.5, oldnessBias: 0.0 },
  dialogue: { highRegister: 0.6, lowRegister: 1.6, oldnessBias: 0.0 },
};

export interface GenrePickResult {
  word: Word;
  senseIndex: number;
}

export function pickSynonymForGenre(
  lang: Language,
  meaning: Meaning,
  genre: DiscourseGenre,
  rng: import("../rng").Rng,
): GenrePickResult | null {
  const candidates = findWordsByMeaning(lang, meaning);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const idx = candidates[0]!.senses.findIndex((s) => s.meaning === meaning);
    return { word: candidates[0]!, senseIndex: idx === -1 ? 0 : idx };
  }
  const weights = GENRE_WEIGHTS[genre] ?? GENRE_WEIGHTS.daily;
  const scored = candidates.map((w) => {
    const idx = w.senses.findIndex((s) => s.meaning === meaning);
    const sense: WordSense | undefined = idx === -1 ? undefined : w.senses[idx];
    let s = 1.0;
    if (sense?.register === "high") s *= weights.highRegister;
    else if (sense?.register === "low") s *= weights.lowRegister;
    // Older words score higher when oldnessBias is positive.
    const ageBias = (sense?.bornGeneration ?? 0) === 0
      ? 0
      : (1 / Math.max(1, sense!.bornGeneration)) * weights.oldnessBias;
    s += ageBias;
    return { word: w, senseIndex: idx === -1 ? 0 : idx, score: s };
  });
  const total = scored.reduce((a, b) => a + b.score, 0);
  if (total <= 0) return scored[0] ? { word: scored[0].word, senseIndex: scored[0].senseIndex } : null;
  let roll = rng.next() * total;
  for (const c of scored) {
    roll -= c.score;
    if (roll <= 0) return { word: c.word, senseIndex: c.senseIndex };
  }
  const last = scored[scored.length - 1]!;
  return { word: last.word, senseIndex: last.senseIndex };
}
