import type { Language } from "./types";
import type { Rng } from "./rng";
import { formToString, isVowel } from "./phonology/ipa";

const ENDINGS = [
  "ic", "an", "ish", "ese", "ar", "on", "en", "ae", "i", "a",
  "ia", "is", "us", "or", "el", "yn", "as", "um", "il", "ur",
  "ay", "oth", "ene", "ola", "ari",
];

export function generateName(parent: Language, rng: Rng): string {
  const meanings = Object.keys(parent.lexicon).sort();
  if (meanings.length === 0) return parent.id;
  const seed = parent.lexicon[meanings[rng.int(meanings.length)]!]!;
  let root = "";
  let letters = 0;
  let prevWasVowel: boolean | null = null;
  for (const p of seed) {
    if (letters >= 4) break;
    const s = formToString([p]);
    const ch = s[0];
    if (!ch) continue;
    const thisIsVowel = isVowel(p);
    if (letters === 0 || !(thisIsVowel && prevWasVowel === true)) {
      root += ch;
      letters++;
      prevWasVowel = thisIsVowel;
    }
  }
  if (root.length === 0) root = formToString(seed).slice(0, 3);
  const ending = ENDINGS[rng.int(ENDINGS.length)]!;
  const name = root.charAt(0).toUpperCase() + root.slice(1).toLowerCase() + ending;
  return name;
}
