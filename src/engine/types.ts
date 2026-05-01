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
  otRanking: string[];
  lastChangeGeneration: Record<Meaning, number>;
  stressPattern?: "initial" | "penult" | "final" | "antepenult" | "lexical";
  suppletion?: Record<
    Meaning,
    Partial<Record<import("./morphology/types").MorphCategory, WordForm>>
  >;
  derivationalSuffixes?: Array<{ affix: WordForm; tag: string }>;
  culturalTier?: 0 | 1 | 2 | 3;
  lexicalCapacity?: number;
  colexifiedAs?: Record<Meaning, Meaning[]>;
  substrateAccelerationRemaining?: number;
  recentLoanGens?: number[];
  variants?: Record<Meaning, FormVariant[]>;
}

export interface FormVariant {
  form: WordForm;
  weight: number;
  bornGeneration: number;
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
}

export interface SavedRun {
  version: 5;
  id: string;
  label: string;
  createdAt: number;
  config: SimulationConfig;
  generationsRun: number;
  stateSnapshot?: SimulationState;
}
