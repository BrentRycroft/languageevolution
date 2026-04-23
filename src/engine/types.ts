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
  kind:
    | "sound_change"
    | "coinage"
    | "grammar_shift"
    | "semantic_drift"
    | "borrow"
    | "grammaticalize"
    | "chain_shift"
    | "taboo";
  description: string;
  /**
   * Optional structured metadata. Populated by the newer mechanic-depth
   * steps (borrow, grammaticalize, chain_shift) so the UI can render
   * arrows / etymology chips without regex-scraping `description`.
   */
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
  /**
   * Per-language tempo multiplier in [0.3, 1.8]. 1.0 = average.
   * Multiplied into every change-rate call so some descendants are
   * conservative ("turtle") and others innovative ("hare").
   */
  conservatism: number;
  /**
   * Origin tag per meaning. Present only for words that didn't come from
   * the proto-seed. "compound" / "derivation" / "reduplication" mirror the
   * genesis catalog ids; "borrow:LangName" marks contact loans.
   */
  wordOrigin: Record<Meaning, string>;
  /**
   * Procedurally-generated active sound laws that this language is currently
   * subject to. Each rule has a strength that grows with use and decays with
   * disuse; when strength falls below a threshold the rule retires.
   */
  activeRules: import("./phonology/generated").GeneratedRule[];
  /**
   * Retired rules kept for UI history.
   */
  retiredRules?: import("./phonology/generated").GeneratedRule[];
  /**
   * Per-family bias vector used by the procedural proposer. Higher numbers
   * mean the language is more inclined to invent rules of that family.
   */
  ruleBias?: Record<string, number>;
  /**
   * Register assignment per meaning: some meanings have a "high" / "low"
   * split recorded here so narrative / cultural features can style output.
   */
  registerOf?: Record<string, "high" | "low">;
  /**
   * Persistent 2D map coordinates. Set once at language birth and frozen
   * thereafter (users may also drag a node in MapView, which writes here).
   * Optional for back-compat — if undefined, MapView falls back to a
   * deterministic id-hash layout.
   */
  coords?: { x: number; y: number };
  /**
   * Romanization / orthography map: IPA phoneme → Latin-ish spelling.
   * Drifts slower than phonology, producing the classic "spelling vs
   * pronunciation" divergence we see in real languages.
   */
  orthography: Record<string, string>;
  /**
   * OT-style phonotactic constraint ranking. Constraint ids in order of
   * decreasing priority. Evolves via maybeLearnOt().
   */
  otRanking: string[];
  /**
   * Age-grading: generation in which each meaning's form was last adopted.
   * Recently-changed words are more likely to shift again for a few
   * generations (young speakers still refining the innovation).
   */
  lastChangeGeneration: Record<Meaning, number>;
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
    /**
     * Hard cap on simultaneously-alive leaves. Ignored when
     * `unlimitedLeaves` is true.
     */
    maxLeaves: number;
    /**
     * When true, the simulator removes the cap entirely — splits keep
     * happening as long as splitProbabilityPerGeneration fires. Useful
     * for users who want to grow trees freely. Adds proportional CPU
     * cost since every leaf gets stepped each generation.
     */
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
  taboo: {
    /** Per-generation probability of a taboo-replacement event per leaf. */
    replacementProbability: number;
  };
  seedLexicon: Lexicon;
  seedFrequencyHints?: Record<Meaning, number>;
  seedMorphology?: import("./morphology/types").Morphology;
  /**
   * Opt-in: run fast-forward steps in a Web Worker so the UI thread
   * stays responsive during long runs.
   */
  useWorker?: boolean;
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
  version: 4;
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
