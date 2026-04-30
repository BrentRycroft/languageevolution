import type { Language } from "./types";
import type { Rng } from "./rng";
import { formToString, isVowel } from "./phonology/ipa";

// Larger ending pool to reduce sibling collisions.
const ENDINGS = [
  "ic", "an", "ish", "ese", "ar", "on", "en", "ae", "i", "a",
  "ia", "is", "us", "or", "el", "yn", "as", "um", "il", "ur",
  "ay", "oth", "ene", "ola", "ari",
];

/**
 * Procedurally name a daughter language. Picks a content word from the
 * parent's lexicon as the root, sanitises it to ≤ 4 letters with a CV
 * rhythm (skip the second of two consecutive vowels), capitalises, and
 * appends one of ~25 endings.
 *
 * Earlier versions had a bug: the vowel-skip predicate gated on
 * `seed[0]` (the seed's *first* phoneme, constant per call) instead of
 * the previous letter, which collapsed sibling languages onto a small
 * set of name shapes. This version tracks the previous phoneme
 * properly.
 */
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
    // CV rhythm: keep the first phoneme; thereafter, skip a vowel
    // when the previous phoneme was also a vowel (avoid `aei` runs).
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
