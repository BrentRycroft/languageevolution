import type { Language, LanguageTree, Meaning, WordForm } from "../../types";
import type { Rng } from "../../rng";

/**
 * Common interface for word-coinage mechanisms. Each mechanism takes the
 * language's state + the desired target meaning and either returns a
 * concrete coinage or null if it can't feed (no usable source material,
 * illegal phonotactics, etc.).
 *
 * The orchestrator picks a target meaning from the lexical-need vector,
 * then polls mechanisms in a weighted order until one accepts.
 */
export interface CoinageMechanism {
  id: string;
  label: string;
  /** "compound" etc. — shown in the lexicon glyph strip. */
  originTag: string;
  /** Register assigned to the resulting word. */
  register?: "high" | "low";
  /** Weight relative to the other mechanisms, per language style. */
  baseWeight: number;
  /**
   * Attempt to coin for `target`. Return null if the mechanism doesn't
   * fit. `tree` lets calque reach into sister languages.
   */
  tryCoin: (
    lang: Language,
    target: Meaning,
    tree: LanguageTree,
    rng: Rng,
  ) => { form: WordForm } | null;
}

import { MECHANISM_COMPOUND } from "./compound";
import { MECHANISM_DERIVATION } from "./derivation";
import { MECHANISM_REDUPLICATION } from "./reduplication";
import { MECHANISM_CALQUE } from "./calque";
import { MECHANISM_CLIPPING } from "./clipping";
import { MECHANISM_BLENDING } from "./blending";
import { MECHANISM_IDEOPHONE } from "./ideophone";
import { MECHANISM_CONVERSION } from "./conversion";

export const MECHANISMS: readonly CoinageMechanism[] = [
  MECHANISM_COMPOUND,
  MECHANISM_DERIVATION,
  MECHANISM_REDUPLICATION,
  MECHANISM_CALQUE,
  MECHANISM_CLIPPING,
  MECHANISM_BLENDING,
  MECHANISM_IDEOPHONE,
  MECHANISM_CONVERSION,
];
