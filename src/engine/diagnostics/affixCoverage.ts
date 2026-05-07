import type { Language } from "../types";
import type { DerivationCategory } from "../lexicon/derivation";

/**
 * Phase 56 T3: per-language affix-coverage diagnostic. Walks every
 * `DerivationCategory` and reports whether the language has any
 * derivational suffix in that category, whether it's productive,
 * and which surface tags are present.
 *
 * Used by the Compare tab to surface typological gaps ("this
 * language has agentive and abstractNoun but no diminutive"). Pure
 * read; no mutation.
 */

export interface AffixCoverageEntry {
  category: DerivationCategory;
  present: boolean;
  productive: boolean;
  affixTags: string[];
  /** Total usage count summed across this category's affixes. */
  totalUsage: number;
}

const ALL_CATEGORIES: DerivationCategory[] = [
  "agentive",
  "abstractNoun",
  "dominionAbstract",
  "nominalisation",
  "diminutive",
  "adjectival",
  "denominal",
  "negative",
  "repetitive",
  "temporalBefore",
  "temporalAfter",
  "intensifierExcess",
  "intensifierInsufficient",
  "mistaken",
  "adverbial",
  "privative",
];

export function affixCoverageReport(
  lang: Language,
): Record<DerivationCategory, AffixCoverageEntry> {
  const out = {} as Record<DerivationCategory, AffixCoverageEntry>;
  for (const cat of ALL_CATEGORIES) {
    out[cat] = {
      category: cat,
      present: false,
      productive: false,
      affixTags: [],
      totalUsage: 0,
    };
  }
  if (!lang.derivationalSuffixes) return out;
  for (const s of lang.derivationalSuffixes) {
    if (!s.category) continue;
    const entry = out[s.category];
    if (!entry) continue;
    entry.present = true;
    if (s.productive) entry.productive = true;
    if (!entry.affixTags.includes(s.tag)) entry.affixTags.push(s.tag);
    entry.totalUsage += s.usageCount ?? 0;
  }
  return out;
}

/** Returns a 0-1 score: fraction of categories with at least one productive affix. */
export function affixCoverageScore(lang: Language): number {
  const report = affixCoverageReport(lang);
  let productiveCount = 0;
  let total = 0;
  for (const cat of ALL_CATEGORIES) {
    total++;
    if (report[cat].productive) productiveCount++;
  }
  return total === 0 ? 0 : productiveCount / total;
}
