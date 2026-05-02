import type { Rng } from "./rng";

export type { Phoneme, Meaning, WordForm, Lexicon } from "./primitives";
import type { Meaning, WordForm, Lexicon } from "./primitives";

export type SoundChangeCategory =
  | "lenition"
  | "fortition"
  | "voicing"
  | "deletion"
  | "insertion"
  | "assimilation"
  | "vowel"
  | "metathesis"
  | "palatalization"
  | "gemination";

export type PositionBias = "initial" | "final" | "internal" | "any";

export interface SoundChange {
  id: string;
  label: string;
  category: SoundChangeCategory;
  description: string;
  positionBias?: PositionBias;
  stressFilter?: "stressed" | "unstressed" | "pretonic" | "any";
  probabilityFor: (word: WordForm) => number;
  apply: (word: WordForm, rng: Rng) => WordForm;
  enabledByDefault: boolean;
  baseWeight: number;
  priority?: number;
}

export interface LanguageEvent {
  generation: number;
  kind:
    | "sound_change"
    | "coinage"
    | "grammar_shift"
    | "semantic_drift"
    | "borrow"
    | "grammaticalize"
    | "chain_shift"
    | "taboo"
    | "actuation";
  description: string;
  meta?: {
    donorId?: string;
    recipientId?: string;
    meaning?: string;
    category?: string;
    pathway?: string;
    pairedRuleId?: string;
  };
}

export interface PhonemeInventory {
  segmental: string[];
  tones: string[];
  usesTones: boolean;
}

export interface Language {
  id: string;
  name: string;
  lexicon: Lexicon;
  enabledChangeIds: string[];
  changeWeights: Record<string, number>;
  birthGeneration: number;
  extinct?: boolean;
  deathGeneration?: number;
  grammar: GrammarFeatures;
  events: LanguageEvent[];
  wordFrequencyHints: Record<Meaning, number>;
  phonemeInventory: PhonemeInventory;
  inventoryProvenance?: Record<string, {
    source: "native" | "areal" | "internal-rule";
    sourceLangId?: string;
    sourceLangName?: string;
    generation?: number;
  }>;
  morphology: import("./morphology/types").Morphology;
  localNeighbors: Record<Meaning, string[]>;
  conservatism: number;
  speakers?: number;
  wordOrigin: Record<Meaning, string>;
  /**
   * Detailed derivation chain — parallel to wordOrigin (which is a single
   * tag string for backwards-compat). Populated by the targeted-derivation
   * mechanism so the UI can surface "freedom ← free + -dom" etymology
   * info. Optional; old runs and primitives leave it empty.
   */
  wordOriginChain?: Record<Meaning, {
    tag: string;
    from?: Meaning;
    via?: string;
    donor?: string;
  }>;
  activeRules: import("./phonology/generated-types").GeneratedRule[];
  retiredRules?: import("./phonology/generated-types").GeneratedRule[];
  ruleBias?: Record<string, number>;
  lexicalStress?: Record<string, number>;
  registerOf?: Record<string, "high" | "low">;
  coords?: { x: number; y: number };
  territory?: {
    cells: number[];
  };
  orthography: Record<string, string>;
  /**
   * Word-level orthographic overrides — frozen historical spellings that
   * outlive sound change. Once a meaning enters this map, romanize() will
   * return the stored string verbatim regardless of how the phonemic form
   * has drifted. Mirrors the English knight/though/gnome pattern. Only
   * fires for languages at cultural tier ≥ 3 (writing standardisation).
   */
  lexicalSpelling?: Record<Meaning, string>;
  otRanking: string[];
  lastChangeGeneration: Record<Meaning, number>;
  stressPattern?: "initial" | "penult" | "final" | "antepenult" | "lexical";
  suppletion?: Record<
    Meaning,
    Partial<Record<import("./morphology/types").MorphCategory, WordForm>>
  >;
  /**
   * Per-noun gender assignment when grammar.genderCount > 0.
   * Values are 0..(genderCount-1). Set lazily; missing entries get
   * heuristically assigned the first time they are needed.
   */
  gender?: Record<Meaning, number>;
  /**
   * Productive derivational suffixes the language has available for
   * coining derived words. Each is bucketed by category (agentive,
   * abstractNoun, etc.) so the genesis loop can reach for the right
   * kind. Generated at language birth via seedDerivationalSuffixes;
   * tier-gated (low-tier languages have fewer categories).
   *
   * The optional `category` field is undefined for legacy untyped
   * entries from pre-Phase-20f saves; new code treats them as
   * un-bucketed and falls back to random picking.
   */
  derivationalSuffixes?: Array<{
    affix: WordForm;
    tag: string;
    category?: import("./lexicon/derivation").DerivationCategory;
  }>;
  culturalTier?: 0 | 1 | 2 | 3;
  /**
   * Hysteresis counter for tier transitions. Increments on every tier-check
   * tick (every 20 gens) where the language is eligible for a higher tier,
   * and resets to 0 when eligibility drops. The transition only fires once
   * the streak reaches the hysteresis threshold (see TIER_HYSTERESIS_TICKS
   * in lexicon/tier.ts), preventing one-off speaker-count spikes from
   * causing premature tier promotions.
   */
  tierEligibilityStreak?: number;
  /**
   * Generation deadline for the abstract-vocabulary catch-up window.
   * Set when a language crosses into tier 2 (literacy / abstract noun
   * morphology unlocks): the genesis driver bumps targetedDerivation
   * probability from 0.4 to 0.85 until `state.generation >= this`,
   * producing a realistic "abstracts pour into the lexicon shortly
   * after literacy" effect. Cleared once expired.
   */
  vocabularyCatchUpUntil?: number;
  lexicalCapacity?: number;
  colexifiedAs?: Record<Meaning, Meaning[]>;
  /**
   * Per-meaning alternative forms (synonyms / lexical doublets) ranked by
   * frequency. The primary form lives in `lexicon[m]`; alternates compete
   * with it for use in narrative + translation. Borrowing into an
   * already-occupied slot pushes the borrowed form here instead of
   * replacing the native form (real-world doublets like sheep/mutton).
   * Pruned each generation if low-frequency.
   */
  altForms?: Record<Meaning, WordForm[]>;
  /**
   * Parallel to altForms — register tag for each alternate (the primary
   * form's register is in lang.registerOf). Lets narrative composer pick
   * register-appropriate words for high-genre myth vs. colloquial dialogue.
   */
  altRegister?: Record<Meaning, Array<"high" | "low" | "neutral">>;
  substrateAccelerationRemaining?: number;
  recentLoanGens?: number[];
  variants?: Record<Meaning, FormVariant[]>;
  bilingualLinks?: Record<string, number>;
  speakerCount?: number;
  socialNetworkClustering?: number;
  /**
   * Phase 21: form-centric primary lexicon. Each entry binds one phonemic
   * form to one or more meanings (senses). Populated by every coinage,
   * borrowing, polysemous-drift, and sound-change-merger event. The
   * existing meaning-keyed `lexicon` field is a derived view: synced
   * from `words` via `syncLexiconFromWords()` after any mutation.
   *
   * Optional + lazily populated for backwards compat: pre-Phase-21 saves
   * have undefined `words` and the migrator builds it from `lexicon`.
   * When undefined, callers should treat `lexicon` as the source of truth.
   */
  words?: Word[];
}

/**
 * One sense of a polysemous word. A word like English "bank" carries
 * multiple senses ("financial-institution", "river-edge"); each is a
 * `WordSense` attached to the same `Word.form`.
 */
export interface WordSense {
  meaning: Meaning;
  /**
   * Dominance of this sense within the word. Mirrors
   * `wordFrequencyHints[meaning]` but is per-sense so the most common
   * sense surfaces first in disambiguation.
   */
  weight: number;
  register?: "high" | "low" | "neutral";
  bornGeneration: number;
  /**
   * Origin tag for this specific sense. The first sense's origin is
   * usually the word's coinage tag ("compound", "derivation", "borrow"),
   * while later senses tagged "polysemy", "sound-change-merger", or
   * "borrow" record how they joined the word.
   */
  origin?: string;
}

/**
 * A word in the language: one phonemic form bound to one or more senses.
 * Mirrors the real-world fact that a single word like English *bank* can
 * carry multiple meanings (financial institution / river edge).
 */
export interface Word {
  form: WordForm;
  /**
   * Stable join key derived from the form via `formKeyOf` (delegates to
   * `formToString` from phonology/ipa.ts). Used as the index key in
   * lookup maps; cached on the entry to avoid repeated computation.
   */
  formKey: string;
  senses: WordSense[];
  /**
   * Index into `senses` of the dominant sense. Used by the meaning-keyed
   * `lexicon` view to decide which form to surface for `lexicon[m]` when
   * `m` is shared. Default 0; promoted on frequency change.
   */
  primarySenseIndex: number;
  bornGeneration: number;
  origin?: string;
}

export interface FormVariant {
  form: WordForm;
  weight: number;
  bornGeneration: number;
  adoptionFraction?: number;
  innovator?: "phonology" | "contact" | "drift" | "analogy" | "learner";
}

export interface LanguageNode {
  language: Language;
  parentId: string | null;
  childrenIds: string[];
  splitGeneration?: number;
}

export type LanguageTree = Record<string, LanguageNode>;

export interface GrammarFeatures {
  wordOrder: "SOV" | "SVO" | "VSO" | "VOS" | "OVS" | "OSV";
  affixPosition: "prefix" | "suffix";
  pluralMarking: "none" | "affix" | "reduplication";
  tenseMarking: "none" | "past" | "future" | "both";
  hasCase: boolean;
  genderCount: 0 | 2 | 3;
  synthesisIndex?: number;
  fusionIndex?: number;
  morphologicalType?: "isolating" | "agglutinating" | "fusional" | "polysynthetic";
  articlePresence?: "none" | "free" | "enclitic" | "proclitic";
  caseStrategy?: "case" | "preposition" | "postposition" | "mixed";
  incorporates?: boolean;
  classifierSystem?: boolean;
  prodrop?: boolean;
  adjectivePosition?: "pre" | "post";
  possessorPosition?: "pre" | "post";
  numeralPosition?: "pre" | "post";
  negationPosition?: "pre-verb" | "post-verb" | "prefix" | "suffix";
  aspectMarking?: "none" | "perfective" | "imperfective" | "progressive";
  voice?: "active" | "mixed";
  moodMarking?: "declarative" | "subjunctive" | "imperative";
  interrogativeStrategy?: "particle" | "inversion" | "intonation";
  interrogativeParticle?: "initial" | "final";
  alignment?: "nom-acc" | "erg-abs" | "tripartite" | "split-S";
  harmony?: "none" | "front-back" | "rounding" | "atr";
  evidentialMarking?: "none" | "direct-only" | "three-way";
  classifierTable?: Record<string, string>;
  relativeClauseStrategy?: "gap" | "resumptive" | "relativizer" | "internal-headed";
  serialVerbConstructions?: boolean;
  politenessRegister?: "none" | "binary" | "tiered";
}

export interface SimulationConfig {
  seed: string;
  yearsPerGeneration?: number;
  realismMultiplier?: number;
  modes: {
    phonology: boolean;
    tree: boolean;
    genesis: boolean;
    death: boolean;
    grammar: boolean;
    semantics: boolean;
  };
  phonology: {
    globalRate: number;
    enabledChangeIds: string[];
    changeWeights: Record<string, number>;
  };
  tree: {
    splitProbabilityPerGeneration: number;
    maxLeaves: number;
    unlimitedLeaves?: boolean;
    minGenerationsBetweenSplits: number;
    deathProbabilityPerGeneration: number;
    minGenerationsBeforeDeath: number;
  };
  genesis: {
    globalRate: number;
    enabledRuleIds: string[];
    ruleWeights: Record<string, number>;
  };
  grammar: {
    driftProbabilityPerGeneration: number;
  };
  semantics: {
    driftProbabilityPerGeneration: number;
    recarveProbabilityPerGeneration?: number;
  };
  obsolescence: {
    probabilityPerPairPerGeneration: number;
    maxDistanceForRivalry: number;
    copulaLossProbability?: number;
    copulaGenesisProbability?: number;
  };
  morphology: {
    grammaticalizationProbability: number;
    paradigmMergeProbability: number;
    analogyProbability?: number;
    cliticizationProbability?: number;
    suppletionProbability?: number;
  };
  contact: {
    borrowProbabilityPerGeneration: number;
  };
  phonology_lawful: {
    regularChangeProbability: number;
  };
  taboo: {
    replacementProbability: number;
  };
  seedLexicon: Lexicon;
  seedFrequencyHints?: Record<Meaning, number>;
  seedMorphology?: import("./morphology/types").Morphology;
  seedGrammar?: Partial<GrammarFeatures>;
  seedStressPattern?: NonNullable<Language["stressPattern"]>;
  seedLexicalStress?: Record<Meaning, number>;
  seedCulturalTier?: 0 | 1 | 2 | 3;
  seedSuppletion?: NonNullable<Language["suppletion"]>;
  useWorker?: boolean;
  preset?: string;
  evolutionSpeed?: string;
  mapMode?: "random" | "earth";
  originCellId?: number;
}

export interface PendingArealRule {
  rule: import("./phonology/generated").GeneratedRule;
  donorId: string;
  donorCoords: { x: number; y: number };
  birthGeneration: number;
}

export interface SimulationState {
  generation: number;
  tree: LanguageTree;
  rootId: string;
  rngState: number;
  pendingArealRules?: PendingArealRule[];
  generationsOverCap?: number;
}

export interface SavedRun {
  version: 6;
  id: string;
  label: string;
  createdAt: number;
  config: SimulationConfig;
  generationsRun: number;
  stateSnapshot?: SimulationState;
}
