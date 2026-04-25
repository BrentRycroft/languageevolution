import type { GrammarFeatures } from "../types";

/**
 * Defaults for a freshly-minted proto language. Calibrated to a
 * "moderate" typological profile — synthetic-but-not-polysynthetic,
 * fusional bias, free articles, case marking. Daughter languages drift
 * from here.
 */
export const DEFAULT_GRAMMAR: GrammarFeatures = {
  wordOrder: "SOV",
  affixPosition: "suffix",
  pluralMarking: "affix",
  tenseMarking: "past",
  hasCase: true,
  genderCount: 2,
  // Typology axes (PR B §1.3): present on every new language so the
  // realiser can rely on them, even though older saves may load without
  // these fields and pick up the defaults at runtime.
  synthesisIndex: 2.0,
  fusionIndex: 0.5,
  articlePresence: "none",
  caseStrategy: "case",
  incorporates: false,
  classifierSystem: false,
  prodrop: false,
};
