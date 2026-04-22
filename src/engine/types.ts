import type { Rng } from "./rng";

export type Phoneme = string;
export type Meaning = string;
export type WordForm = Phoneme[];
export type Lexicon = Record<Meaning, WordForm>;

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
  probabilityFor: (word: WordForm) => number;
  apply: (word: WordForm, rng: Rng) => WordForm;
  enabledByDefault: boolean;
  baseWeight: number;
}

export interface LanguageEvent {
  generation: number;
  kind: "sound_change" | "coinage" | "grammar_shift" | "semantic_drift";
  description: string;
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
  /**
   * Per-word usage frequency hint in [0, 1], used for lexical-diffusion:
   * common words change faster. Keys are meanings.
   */
  wordFrequencyHints: Record<Meaning, number>;
  /**
   * Active phoneme inventory — starts from the language's current forms and
   * grows as generative rules introduce new phonemes (clicks, tones, etc.).
   */
  phonemeInventory: PhonemeInventory;
  morphology: import("./morphology/types").Morphology;
  /**
   * Per-language semantic neighbor overrides, populated at runtime for
   * compound/derived meanings that are not in the static global table.
   */
  localNeighbors: Record<Meaning, string[]>;
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
}

export interface SimulationConfig {
  seed: string;
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
  };
  obsolescence: {
    probabilityPerPairPerGeneration: number;
    maxDistanceForRivalry: number;
  };
  morphology: {
    grammaticalizationProbability: number;
    paradigmMergeProbability: number;
  };
  contact: {
    borrowProbabilityPerGeneration: number;
  };
  phonology_lawful: {
    /**
     * Probability per generation that one enabled sound change fires
     * "regularly" — applied to every matching site in every word at once,
     * simulating a linguistic sound law rather than sporadic drift.
     */
    regularChangeProbability: number;
  };
  seedLexicon: Lexicon;
  seedFrequencyHints?: Record<Meaning, number>;
  seedMorphology?: import("./morphology/types").Morphology;
  preset?: string;
  /** Evolution-speed profile id (conservative / standard / rapid / extreme). */
  evolutionSpeed?: string;
}

export interface SimulationState {
  generation: number;
  tree: LanguageTree;
  rootId: string;
  rngState: number;
}

export interface SavedRun {
  version: 3;
  id: string;
  label: string;
  createdAt: number;
  config: SimulationConfig;
  generationsRun: number;
  /**
   * Optional full-state checkpoint. If present, loading skips replay and
   * restores this state directly. Otherwise the engine replays from seed.
   */
  stateSnapshot?: SimulationState;
}
