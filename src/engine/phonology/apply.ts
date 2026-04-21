import type { Lexicon, SoundChange, WordForm } from "../types";
import type { Rng } from "../rng";

export interface ApplyOptions {
  globalRate: number;
  weights: Record<string, number>;
}

export function applyChangesToWord(
  word: WordForm,
  changes: SoundChange[],
  rng: Rng,
  opts: ApplyOptions,
): WordForm {
  let w = word;
  for (const change of changes) {
    const weight = opts.weights[change.id] ?? change.baseWeight;
    const p = change.probabilityFor(w) * weight * opts.globalRate;
    if (p <= 0) continue;
    if (rng.chance(Math.min(1, p))) {
      w = change.apply(w, rng);
    }
  }
  return w;
}

export function applyChangesToLexicon(
  lexicon: Lexicon,
  changes: SoundChange[],
  rng: Rng,
  opts: ApplyOptions,
): Lexicon {
  const out: Lexicon = {};
  const meanings = Object.keys(lexicon).sort();
  for (const m of meanings) {
    out[m] = applyChangesToWord(lexicon[m]!, changes, rng, opts);
  }
  return out;
}
