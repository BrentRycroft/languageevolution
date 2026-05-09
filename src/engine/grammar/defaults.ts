import type { GrammarFeatures } from "../types";

/**
 * defaults.ts
 *
 * Word-order / case / alignment / classifier drift; typological-universal repair. Key exports: DEFAULT_GRAMMAR.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const DEFAULT_GRAMMAR: GrammarFeatures = {
  wordOrder: "SOV",
  affixPosition: "suffix",
  pluralMarking: "affix",
  tenseMarking: "past",
  hasCase: true,
  // Phase 71a T2 (G4): default alignment was previously unset, leaving
  // GrammarFeatures.alignment undefined on every language. The drift
  // step (grammar/evolve.ts:65-85) treated undefined as nom-acc for
  // logic but never wrote it back, so probes saw `alignment:
  // undefined` everywhere and any drift hop landed on a wrong value.
  // Declaring the default explicitly anchors it.
  alignment: "nom-acc",
  genderCount: 2,
  synthesisIndex: 2.0,
  fusionIndex: 0.5,
  articlePresence: "none",
  caseStrategy: "case",
  incorporates: false,
  classifierSystem: false,
  prodrop: false,
  adjectivePosition: "pre",
  possessorPosition: "pre",
  numeralPosition: "pre",
  negationPosition: "pre-verb",
  aspectMarking: "none",
  voice: "active",
  moodMarking: "declarative",
  interrogativeStrategy: "intonation",
  interrogativeParticle: "final",
};
