import type { Language } from "./types";
import type { Rng } from "./rng";
import { formToString, isVowel } from "./phonology/ipa";
import { orderedLexemeIds, meaningForLexemeId } from "./lexicon/lexemeIdentity";
import { lexFormById } from "./lexicon/access";

/**
 * naming.ts
 *
 * language name generation (procedural names per leaf at split time). Key exports: generateName.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const ENDINGS = [
  "ic", "an", "ish", "ese", "ar", "on", "en", "ae", "i", "a",
  "ia", "is", "us", "or", "el", "yn", "as", "um", "il", "ur",
  "ay", "oth", "ene", "ola", "ari",
];

export function generateName(parent: Language, rng: Rng): string {
  // SEEDED ids only, gloss-sorted — byte-identical to the prior orderedLexiconKeys(parent) (which
  // excluded keyless): the rng.int(ids.length) draw bound must match exactly, so the appended keyless
  // ids that orderedLexemeIds adds are filtered out.
  const ids = orderedLexemeIds(parent.lexemes, parent).filter((id) => meaningForLexemeId(parent, id) !== undefined);
  if (ids.length === 0) return parent.id;
  const seed = lexFormById(parent, ids[rng.int(ids.length)]!)!;
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
