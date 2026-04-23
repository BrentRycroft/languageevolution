import type { Language, Meaning } from "../types";
import type { Rng } from "../rng";
import { relatedMeanings } from "../semantics/clusters";
import { neighborsOf } from "../semantics/neighbors";
import { isSyllabic } from "../phonology/ipa";

export interface TabooEvent {
  meaning: Meaning;
  oldForm: string;
  newForm: string;
  donor: Meaning | null;
}

/**
 * Rare taboo-replacement event. Picks a high-frequency meaning, retires its
 * current form (the original becomes "unspeakable"), and installs a fresh
 * euphemism drawn from:
 *   - a related cluster-mate's form (+ a short affix), OR
 *   - a compound of two related meanings, OR
 *   - reduplication of the original form.
 * The old form is tagged in wordOrigin as taboo-archaic and dropped from
 * the lexicon. Real-world examples: `bear` in English (taboo on the Proto-
 * Germanic root for bear), many cases in South-East Asian animacy hierarchies.
 */
export function maybeTabooReplace(
  lang: Language,
  rng: Rng,
  probability: number,
): TabooEvent | null {
  if (!rng.chance(probability)) return null;
  const candidates = Object.keys(lang.lexicon).filter((m) => {
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    return freq >= 0.7 && !m.includes("-");
  });
  if (candidates.length === 0) return null;
  const target = candidates[rng.int(candidates.length)]!;
  const oldForm = lang.lexicon[target]!;
  const oldFormStr = oldForm.join("");

  // Find a euphemism source: first, a related meaning that exists in the
  // lexicon and isn't itself the target; otherwise, fall back to
  // reduplication of the original form.
  const relatedPool = new Set<string>([
    ...relatedMeanings(target),
    ...neighborsOf(target),
  ]);
  const donors = Array.from(relatedPool).filter(
    (n) => n !== target && lang.lexicon[n],
  );

  let newForm = oldForm.slice();
  let donor: Meaning | null = null;
  if (donors.length > 0 && rng.chance(0.7)) {
    donor = donors[rng.int(donors.length)]!;
    const donorForm = lang.lexicon[donor]!;
    // Euphemism = donor's form with a softening suffix.
    const softener = ["e", "ə"][rng.int(2)]!;
    newForm = [...donorForm, softener];
  } else {
    // Reduplication-style euphemism.
    newForm = [...oldForm, ...oldForm.slice(0, 2)];
  }

  // Cap length to keep things speakable.
  if (newForm.length > 9) newForm = newForm.slice(0, 9);
  // Syllabicity: a taboo replacement still has to be pronounceable;
  // if the generated euphemism lost its nucleus somehow, bail.
  if (!newForm.some((p) => isSyllabic(p))) return null;

  delete lang.lexicon[target];
  lang.lexicon[target] = newForm;
  lang.wordOrigin[target] = donor ? `taboo:${donor}` : "taboo:self";
  // Mid-low frequency while the euphemism is fresh.
  lang.wordFrequencyHints[target] = 0.55;

  return {
    meaning: target,
    oldForm: oldFormStr,
    newForm: newForm.join(""),
    donor,
  };
}
