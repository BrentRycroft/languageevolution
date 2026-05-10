/**
 * domains.ts — Phase 72g T5 (G5) Phase 1.
 *
 * Sub-state TYPE VIEWS for the Language god-object decomposition.
 *
 * The decomposition target is documented in `docs/LANGUAGE_DOMAINS.md`.
 * This file is Phase 1: pick fields from `Language` to produce the
 * seven domain views. Code that wants a phonology-only argument can
 * declare `function foo(p: PhonologyState) {...}` and pass any
 * `Language` (a Language IS a PhonologyState, structurally).
 *
 * Tradeoff (per CLAUDE.md "surface tradeoffs"): I considered making
 * `Language` extend interface-inheritance versions of these. That
 * required either (a) duplicating every field declaration with
 * exact-shape matching across two files (high maintenance burden),
 * or (b) creating a circular `Language ↔ PhonologyState` dependency.
 * `Pick<>` views avoid both: Language remains the single source of
 * truth for field shapes; sub-states are derived. The cost: you
 * cannot `interface Foo extends PhonologyState` because Pick<>
 * produces type aliases, not interfaces. That is acceptable for
 * Phase 1 — its goal is to let consumers TARGET sub-states, not to
 * compose new sub-types from them. Phase 2 (when call sites are
 * converted; documented as a separate session in
 * docs/LANGUAGE_DOMAINS.md) is when interface composition becomes
 * worth the migration cost.
 *
 * Field ownership is derived from CLAUDE.md and audit Theme A. When
 * a new field is added to Language, decide which sub-state it
 * belongs to and add it to the appropriate `Pick<>` list below.
 */

import type { Language } from "./types";

// ─── PhonologyState ─────────────────────────────────────────────────

export type PhonologyState = Pick<Language,
  | "phonemeInventory"
  | "inventoryProvenance"
  | "rootInventory"
  | "rootPatterns"
  | "enabledChangeIds"
  | "changeWeights"
  | "ruleBias"
  | "activeRules"
  | "retiredRules"
  | "diffusionState"
  | "otRanking"
  | "homonymInhibitions"
  | "homonymInhibition"
  | "functionalLoadInhibitions"
  | "contextDiversitySnapshot"
  | "phonologisationEvents"
  | "vowelShiftPressure"
  | "lexicalStress"
  | "stressPattern"
  | "phonotacticProfile"
  | "functionalLoadCache"
  | "correspondences"
  | "toneRegime"
  | "toneSandhiRules"
  | "phonemeTarget"
  | "naturalBiasOverride"
  | "categoryMomentum"
  | "volatilityIntensity"
  | "volatilityPhase"
  | "grammaticalisationCascade"
  | "substrateAccelerationRemaining"
  | "vocabularyCatchUpUntil"
  | "perWordDiffusion"
  | "lexiconUR"
  | "lexiconURRefreshPolicy"
>;

// ─── MorphologyState ────────────────────────────────────────────────

export type MorphologyState = Pick<Language,
  | "morphology"
  | "inflectionClass"
  | "nounDeclensionClass"
  | "ablautClassAssignment"
  | "grammaticalizationStage"
  | "suppletion"
  | "derivationalSuffixes"
  | "gender"
  | "nounClassAssignments"
  | "boundMorphemes"
  | "boundMorphemeOrigin"
  | "compounds"
  | "infinitiveStrategy"
>;

// ─── LexiconState ───────────────────────────────────────────────────

export type LexiconState = Pick<Language,
  | "lexicon"
  | "words"
  | "wordsByFormKey"
  | "wordFrequencyHints"
  | "wordOrigin"
  | "wordOriginChain"
  | "variants"
  | "altForms"
  | "altRegister"
  | "colexifiedAs"
  | "registerOf"
  | "meaningHistory"
  | "closedClassInventory"
  | "borrowHistory"
  | "idioms"
  | "lastChangeGeneration"
  | "localNeighbors"
  | "totalCoinages"
  | "lexicalCapacity"
  | "orthography"
  | "lexicalSpelling"
  | "conceptIds"
>;

// ─── GrammarState ───────────────────────────────────────────────────

export type GrammarState = Pick<Language,
  | "grammar"
  | "wordOrderLastFlipGen"
  | "tierEligibilityStreak"
>;

// ─── SocialState (Phase 72f mostly populates this) ──────────────────

export type SocialState = Pick<Language,
  | "conservatism"
  | "speakers"
  | "culturalTier"
  | "literaryStability"
  | "endangermentLevel"
  | "endangermentLastTransitionGen"
  | "prestigeVariety"
  | "prestigeVarietySinceGen"
  | "registerStrata"
  | "socialNetworkClustering"
>;

// ─── GeoState ───────────────────────────────────────────────────────

export type GeoState = Pick<Language,
  | "coords"
  | "territory"
>;

// ─── ContactState ───────────────────────────────────────────────────

export type ContactState = Pick<Language,
  | "bilingualLinks"
  | "recentLoanGens"
  | "siblingDriftDampenUntil"
>;

// ─── HistoricalRoleState ────────────────────────────────────────────

export type HistoricalRoleState = Pick<Language,
  | "historicalRole"
  | "historicalRoleAssignedGen"
>;

// ─── ModuleHostState ────────────────────────────────────────────────

export type ModuleHostState = Pick<Language,
  | "activeModules"
  | "moduleState"
>;
