import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";

export type GenesisCategory = "compound" | "derivation" | "reduplication";

export interface GenesisRule {
  id: string;
  label: string;
  category: GenesisCategory;
  description: string;
  enabledByDefault: boolean;
  baseWeight: number;
  /**
   * Attempt one coinage. Returns the new (meaning, form) or null if no site applied.
   * `tryCoin` is responsible for picking source material from the language's lexicon.
   */
  tryCoin: (lang: Language, rng: Rng) => { meaning: Meaning; form: WordForm } | null;
}
