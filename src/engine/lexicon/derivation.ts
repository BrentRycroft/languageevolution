import type { Language, Phoneme, WordForm } from "../types";
import type { Rng } from "../rng";
import { isVowel, isConsonant } from "../phonology/ipa";

/**
 * Categories of derivational suffix. Each language ideally has at least one
 * suffix in every category its tier supports, so the genesis loop can
 * reliably reach for the right kind when coining a target abstract.
 *
 * - agentive          (-er, -or)  — X who does Y
 * - abstractNoun      (-ness, -ity, -hood, -ship)  — quality of being
 * - dominionAbstract  (-dom, -ric)  — realm/state of (kingdom, freedom)
 * - nominalisation    (-tion, -ment, -age)  — act/result of
 * - diminutive        (-let, -kin)
 * - adjectival        (-ic, -al, -ish, -ous)
 * - denominal         (-ify, -ise)  — verb-from-noun
 */
export type DerivationCategory =
  | "agentive"
  | "abstractNoun"
  | "dominionAbstract"
  | "nominalisation"
  | "diminutive"
  | "adjectival"
  | "denominal";

export interface DerivationalSuffix {
  affix: WordForm;
  tag: string;
  category: DerivationCategory;
}

/**
 * Tag pool per category. Each is an English-flavoured affix label used for
 * UI display + wordOrigin chain info. The actual phonemic affix on a
 * language is synthesised below from the language's phoneme inventory.
 */
const TAGS_BY_CATEGORY: Record<DerivationCategory, readonly string[]> = {
  agentive: ["-er", "-or", "-ist"],
  abstractNoun: ["-ness", "-ity", "-hood", "-ship"],
  dominionAbstract: ["-dom", "-ric"],
  nominalisation: ["-tion", "-ment", "-age"],
  diminutive: ["-let", "-kin", "-ie"],
  adjectival: ["-ic", "-al", "-ish", "-ous"],
  denominal: ["-ify", "-ise"],
};

/**
 * Tier gate — categories below the language's cultural tier are not
 * generated. Models the rough cross-linguistic pattern that abstract
 * nominalisation morphology is rare in pre-literate societies.
 *
 * Tier 0: only diminutive + adjectival (bodily / qualitative).
 * Tier 1: + agentive + denominal.
 * Tier 2: + abstractNoun + nominalisation + dominionAbstract.
 * Tier 3: every category, including prestige Latinate alternates.
 */
const CATEGORIES_BY_TIER: Record<number, DerivationCategory[]> = {
  0: ["diminutive", "adjectival"],
  1: ["diminutive", "adjectival", "agentive", "denominal"],
  2: [
    "diminutive",
    "adjectival",
    "agentive",
    "denominal",
    "abstractNoun",
    "nominalisation",
    "dominionAbstract",
  ],
  3: [
    "diminutive",
    "adjectival",
    "agentive",
    "denominal",
    "abstractNoun",
    "nominalisation",
    "dominionAbstract",
  ],
};

export function categoriesForTier(tier: number | undefined): DerivationCategory[] {
  const t = Math.max(0, Math.min(3, tier ?? 0));
  return CATEGORIES_BY_TIER[t]!;
}

export const DERIVATION_TAGS = TAGS_BY_CATEGORY.abstractNoun
  .concat(TAGS_BY_CATEGORY.agentive)
  .concat(TAGS_BY_CATEGORY.adjectival)
  .concat(TAGS_BY_CATEGORY.diminutive);

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

/**
 * Build the language's productive derivational suffix list. Generates at
 * least one suffix per category supported by the language's culturalTier.
 */
export function seedDerivationalSuffixes(
  lang: Language,
  rng: Rng,
): DerivationalSuffix[] {
  const categories = categoriesForTier(lang.culturalTier);
  const out: DerivationalSuffix[] = [];
  for (const category of categories) {
    const tags = TAGS_BY_CATEGORY[category];
    const tag = tags[rng.int(tags.length)]!;
    const affix = synthesiseSuffix(lang, rng);
    if (affix && affix.length > 0) {
      out.push({ affix, tag, category });
    }
  }
  return out;
}

/**
 * Find the first available suffix in the requested category for a
 * language. Returns null if the language doesn't have one (e.g. a tier-0
 * language asked for an abstractNoun suffix).
 */
export function findSuffixByCategory(
  lang: Language,
  category: DerivationCategory,
): DerivationalSuffix | null {
  const list = (lang.derivationalSuffixes ?? []) as DerivationalSuffix[];
  for (const s of list) {
    // Existing untyped (legacy) suffixes won't have a category; skip them.
    if ((s as { category?: DerivationCategory }).category === category) {
      return s;
    }
  }
  return null;
}
