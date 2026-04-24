import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { clusterOf, relatedMeanings } from "../semantics/clusters";
import { isFormLegal } from "../phonology/wordShape";

/**
 * Analogical leveling: occasionally reshape a form that stands out
 * from its semantic-cluster mates. Real languages do this all the
 * time — irregular survivors get replaced by the productive pattern
 * (English `holp → helped`, `boughten → bought`). We pick the
 * clearest proxy for "irregular": a content word whose length
 * differs by ≥ 2 segments from its cluster mean, and trim / pad it
 * toward the mean by snipping a tail or duplicating a nucleus.
 *
 * Called from `stepMorphology` at `analogyProbability` per generation.
 */
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
  // Pick a random semantic cluster the language has at least 3
  // representatives of; looking at a single cluster gives the
  // analogy target a defined neighbourhood.
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length < 3) return null;
  // Candidate meanings: those with a cluster AND two or more
  // cluster-mates in the lexicon.
  const candidates: Array<{
    meaning: string;
    mean: number;
    form: WordForm;
  }> = [];
  for (const m of meanings) {
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
    // Trim from the end; the accented stressed syllable stays at the
    // start (leveling rarely chops the stressed root).
    next = chosen.form.slice(0, Math.max(2, target));
  } else {
    // Pad by duplicating the nucleus-adjacent segment — a crude way
    // to make a short outlier feel closer to its cluster-mates.
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
