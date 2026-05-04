import type { Language, LanguageTree, Meaning, WordForm } from "../../types";
import type { Rng } from "../../rng";

export interface CoinageMechanism {
  id: string;
  label: string;
  originTag: string;
  register?: "high" | "low";
  baseWeight: number;
  tryCoin: (
    lang: Language,
    target: Meaning,
    tree: LanguageTree,
    rng: Rng,
  ) => CoinageMechanismResult | null;
}

/**
 * Phase 29 Tranche 4i: when a mechanism knows its constituents
 * (compound A+B, derivation root+suffix, calque from a sister
 * language), it can return them so the genesis loop populates
 * `lang.wordOriginChain` for UI consumption. Mechanisms whose
 * result is opaque (ideophone, conversion) can omit `sources`.
 */
export interface CoinageMechanismResult {
  form: WordForm;
  sources?: {
    /** Constituent meanings drawn from this language. */
    partMeanings?: string[];
    /** Donor language id for borrowing/calque. */
    donorLangId?: string;
    /** Donor meaning in the donor language. */
    donorMeaning?: string;
    /** Suffix tag if mechanism is derivation. */
    via?: string;
  };
}
