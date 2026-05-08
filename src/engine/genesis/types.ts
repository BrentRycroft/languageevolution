import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";

/**
 * types.ts
 *
 * Word-coinage mechanisms (compound, derivation, conversion, clipping, ideophone, calque, blending, reduplication). Key exports: GenesisCategory, GenesisRule.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export type GenesisCategory = "compound" | "derivation" | "reduplication";

export interface GenesisRule {
  id: string;
  label: string;
  category: GenesisCategory;
  description: string;
  enabledByDefault: boolean;
  baseWeight: number;
  tryCoin: (lang: Language, rng: Rng) => { meaning: Meaning; form: WordForm } | null;
}
