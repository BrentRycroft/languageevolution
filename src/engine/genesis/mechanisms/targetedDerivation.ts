import type { Language, Meaning, WordForm } from "../../types";
import type { Rng } from "../../rng";
import { derivationFor } from "../../lexicon/derivation_targets";
import { findSuffixByCategory, type DerivationalSuffix } from "../../lexicon/derivation";

/**
 * Targeted derivation: when the genesis loop is asked to coin a meaning M
 * AND M has a known derivation chain (M = root + suffix-of-category C)
 * AND the language has the root in its lexicon
 * AND the language has a suffix in category C,
 * compose root + suffix and return the new form. Records chain info on
 * the language's wordOriginChain so the UI can surface the etymology.
 *
 * Returns null when the chain doesn't apply, letting the genesis loop
 * fall through to its random mechanism cascade.
 *
 * Probability of selection (when applicable) is high — the linguistic
 * default is "use the productive morphology you have" rather than coining
 * an arbitrary new root.
 */
export interface TargetedDerivationResult {
  meaning: Meaning;
  form: WordForm;
  rootMeaning: Meaning;
  suffixTag: string;
}

export function attemptTargetedDerivation(
  lang: Language,
  meaning: Meaning,
  rng: Rng,
): TargetedDerivationResult | null {
  // Decline only deterministically — the caller sets the probability.
  void rng;

  const target = derivationFor(meaning);
  if (!target) return null;

  const root = lang.lexicon[target.root];
  if (!root || root.length === 0) return null;

  const suffix: DerivationalSuffix | null = findSuffixByCategory(lang, target.via);
  if (!suffix) return null;

  // Compose. Suffix attaches as a true suffix (after the root).
  const form: WordForm = [...root, ...suffix.affix];

  return {
    meaning,
    form,
    rootMeaning: target.root,
    suffixTag: suffix.tag,
  };
}

/**
 * Helper: record the derivation chain on the language's wordOriginChain.
 * Called by the genesis driver after a successful targeted derivation.
 */
export function recordDerivationChain(
  lang: Language,
  result: TargetedDerivationResult,
): void {
  if (!lang.wordOriginChain) lang.wordOriginChain = {};
  lang.wordOriginChain[result.meaning] = {
    tag: "derivation",
    from: result.rootMeaning,
    via: result.suffixTag,
  };
}
