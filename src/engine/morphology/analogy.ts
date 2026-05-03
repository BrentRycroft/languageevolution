import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { clusterOf, relatedMeanings } from "../semantics/clusters";
import { isFormLegal } from "../phonology/wordShape";
import { isClosedClass, posOf } from "../lexicon/pos";

export interface AnalogyEvent {
  meaning: string;
  from: string;
  to: string;
}

export function maybeAnalogicalLevel(
  lang: Language,
  rng: Rng,
  probability: number,
): AnalogyEvent | null {
  if (!rng.chance(probability)) return null;
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length < 3) return null;
  const candidates: Array<{
    meaning: string;
    mean: number;
    form: WordForm;
  }> = [];
  for (const m of meanings) {
    // Phase 26c: closed-class words don't undergo analogical leveling.
    // Articles, prepositions, conjunctions don't reshape their forms
    // based on cluster mates (real cross-linguistic pattern: function
    // words are tightly constrained morphologically).
    if (isClosedClass(posOf(m))) continue;
    const cluster = clusterOf(m);
    if (!cluster) continue;
    const mates = relatedMeanings(m).filter(
      (x) => x !== m && lang.lexicon[x],
    );
    if (mates.length < 2) continue;
    const mateLens = mates.map((x) => lang.lexicon[x]!.length);
    const mean = mateLens.reduce((a, b) => a + b, 0) / mateLens.length;
    const form = lang.lexicon[m]!;
    if (Math.abs(form.length - mean) >= 2) {
      candidates.push({ meaning: m, mean, form });
    }
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[rng.int(candidates.length)]!;
  const target = Math.round(chosen.mean);
  let next: WordForm;
  if (chosen.form.length > target) {
    next = chosen.form.slice(0, Math.max(2, target));
  } else {
    const middle = Math.floor(chosen.form.length / 2);
    const pad = chosen.form[middle]!;
    next = [...chosen.form.slice(0, middle + 1), pad, ...chosen.form.slice(middle + 1)];
  }
  if (!isFormLegal(chosen.meaning, next)) return null;
  lang.lexicon[chosen.meaning] = next;
  return {
    meaning: chosen.meaning,
    from: chosen.form.join(""),
    to: next.join(""),
  };
}
