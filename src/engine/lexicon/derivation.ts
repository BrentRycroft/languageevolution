import type { Language, Phoneme, WordForm } from "../types";
import type { Rng } from "../rng";
import { isVowel, isConsonant } from "../phonology/ipa";

/**
 * Semantic tags for productive derivational suffixes. Kept small: real
 * languages rarely have more than ~5 truly productive derivational
 * affixes at a time (English "-er/-ness/-ity/-able/-ish"; Latin
 * "-tor/-tas/-ilis/-mentum"; Turkish "-ci/-lik/-siz").
 */
export const DERIVATION_TAGS = [
  "-er", // agent / instrument
  "-ness", // quality / abstract noun
  "-ic", // of-or-relating-to adjective
  "-let", // diminutive
  "-ish", // approximative adjective
] as const;

/** Draw one random phoneme matching the predicate from the language's inventory. */
function pickPhoneme(
  inventory: readonly Phoneme[],
  predicate: (p: Phoneme) => boolean,
  rng: Rng,
): Phoneme | null {
  const candidates = inventory.filter(predicate);
  if (candidates.length === 0) return null;
  return candidates[rng.int(candidates.length)]!;
}

/**
 * Build a plausible CV(C) derivational suffix from the language's
 * actual segmental inventory. Falls back to a bare `e` + random
 * consonant if the inventory is too thin for a proper pick.
 */
function synthesiseSuffix(lang: Language, rng: Rng): WordForm | null {
  const inv = lang.phonemeInventory.segmental;
  if (inv.length === 0) return null;
  const v = pickPhoneme(inv, isVowel, rng) ?? "ə";
  const c = pickPhoneme(inv, isConsonant, rng);
  if (!c) return [v];
  // Half the time emit CV, half VC — gives both prefix-friendly and
  // suffix-friendly shapes.
  return rng.chance(0.5) ? [v, c] : [c, v];
}

/**
 * Seed two-to-three language-specific productive derivational suffixes.
 * Called at language birth. Each family of descendants ends up with its
 * own repertoire, which is what "derivational productivity is
 * language-specific" means in typology: the tags are universal but the
 * actual strings are idiosyncratic.
 */
export function seedDerivationalSuffixes(
  lang: Language,
  rng: Rng,
): Array<{ affix: WordForm; tag: string }> {
  const count = 2 + rng.int(2); // 2 or 3
  const pool: Array<{ affix: WordForm; tag: string }> = [];
  const tags = DERIVATION_TAGS.slice();
  // Fisher-Yates-lite: pull `count` unique tags.
  for (let i = 0; i < count && tags.length > 0; i++) {
    const idx = rng.int(tags.length);
    const tag = tags.splice(idx, 1)[0]!;
    const affix = synthesiseSuffix(lang, rng);
    if (affix && affix.length > 0) pool.push({ affix, tag });
  }
  return pool;
}
