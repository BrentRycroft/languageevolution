import type { Language } from "./types";
import type { Rng } from "./rng";
import { formToString, isVowel } from "./phonology/ipa";

const ENDINGS = ["ic", "an", "ish", "ese", "ar", "on", "en", "ae", "i", "a"];

export function generateName(parent: Language, rng: Rng): string {
  const meanings = Object.keys(parent.lexicon).sort();
  if (meanings.length === 0) return parent.id;
  const seed = parent.lexicon[meanings[rng.int(meanings.length)]!]!;
  let root = "";
  let letters = 0;
  for (const p of seed) {
    if (letters >= 4) break;
    const s = formToString([p]);
    const ch = s[0];
    if (!ch) continue;
    if (letters === 0 || !isVowel(p) || !isVowel(seed[0]!)) {
      root += ch;
      letters++;
    }
  }
  if (root.length === 0) root = formToString(seed).slice(0, 3);
  const ending = ENDINGS[rng.int(ENDINGS.length)]!;
  const name = root.charAt(0).toUpperCase() + root.slice(1).toLowerCase() + ending;
  return name;
}
