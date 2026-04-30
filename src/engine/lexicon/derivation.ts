import type { Language, Phoneme, WordForm } from "../types";
import type { Rng } from "../rng";
import { isVowel, isConsonant } from "../phonology/ipa";

export const DERIVATION_TAGS = [
  "-er",
  "-ness",
  "-ic",
  "-let",
  "-ish",
] as const;

function pickPhoneme(
  inventory: readonly Phoneme[],
  predicate: (p: Phoneme) => boolean,
  rng: Rng,
): Phoneme | null {
  const candidates = inventory.filter(predicate);
  if (candidates.length === 0) return null;
  return candidates[rng.int(candidates.length)]!;
}

function synthesiseSuffix(lang: Language, rng: Rng): WordForm | null {
  const inv = lang.phonemeInventory.segmental;
  if (inv.length === 0) return null;
  const v = pickPhoneme(inv, isVowel, rng) ?? "ə";
  const c = pickPhoneme(inv, isConsonant, rng);
  if (!c) return [v];
  return rng.chance(0.5) ? [v, c] : [c, v];
}

export function seedDerivationalSuffixes(
  lang: Language,
  rng: Rng,
): Array<{ affix: WordForm; tag: string }> {
  const count = 2 + rng.int(2);
  const pool: Array<{ affix: WordForm; tag: string }> = [];
  const tags = DERIVATION_TAGS.slice();
  for (let i = 0; i < count && tags.length > 0; i++) {
    const idx = rng.int(tags.length);
    const tag = tags.splice(idx, 1)[0]!;
    const affix = synthesiseSuffix(lang, rng);
    if (affix && affix.length > 0) pool.push({ affix, tag });
  }
  return pool;
}
