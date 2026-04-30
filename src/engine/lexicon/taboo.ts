import type { Language, Meaning } from "../types";
import type { Rng } from "../rng";
import { relatedMeanings } from "../semantics/clusters";
import { neighborsOf } from "../semantics/neighbors";
import { isFormLegal } from "../phonology/wordShape";

export interface TabooEvent {
  meaning: Meaning;
  oldForm: string;
  newForm: string;
  donor: Meaning | null;
}

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
    const softener = ["e", "ə"][rng.int(2)]!;
    newForm = [...donorForm, softener];
  } else {
    newForm = [...oldForm, ...oldForm.slice(0, 2)];
  }

  if (newForm.length > 9) newForm = newForm.slice(0, 9);
  if (!isFormLegal(target, newForm)) return null;

  delete lang.lexicon[target];
  lang.lexicon[target] = newForm;
  lang.wordOrigin[target] = donor ? `taboo:${donor}` : "taboo:self";
  lang.wordFrequencyHints[target] = 0.55;

  return {
    meaning: target,
    oldForm: oldFormStr,
    newForm: newForm.join(""),
    donor,
  };
}
