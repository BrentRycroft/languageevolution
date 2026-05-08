import type { FeatureQuery } from "./features";

/**
 * generated-types.ts
 *
 * Phonological feature geometry, sound-change rules, syllable shape, stress, tone, sandhi, and inventory homeostasis. Key exports: RuleFamily, RuleContext, GeneratedRule.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export type RuleFamily =
  | "lenition"
  | "fortition"
  | "place_assim"
  | "palatalization"
  | "vowel_shift"
  | "vowel_reduction"
  | "harmony"
  | "deletion"
  | "metathesis"
  | "tone";

export interface RuleContext {
  before?: FeatureQuery | "#" | "any";
  after?: FeatureQuery | "#" | "any";
  locus?: "intervocalic" | "onset" | "coda" | "edge" | "any";
  position?: "initial" | "medial" | "final" | "any";
}

export interface GeneratedRule {
  id: string;
  family: RuleFamily;
  templateId: string;
  description: string;
  birthGeneration: number;
  deathGeneration?: number;
  strength: number;
  lastFireGeneration: number;
  from: FeatureQuery;
  context: RuleContext;
  outputMap: Record<string, string>;
}
