import type { GrammarFeatures } from "../types";

export const DEFAULT_GRAMMAR: GrammarFeatures = {
  wordOrder: "SOV",
  affixPosition: "suffix",
  pluralMarking: "affix",
  tenseMarking: "past",
  hasCase: true,
  genderCount: 2,
};
