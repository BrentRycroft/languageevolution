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
  /**
   * Per-phoneme provenance: how did this phoneme enter the
   * language's inventory? "native" (seeded from the proto), "areal"
   * (borrowed from a contact sister), or "internal-rule" (produced
   * by an internal sound change). Surfaced in the Phonemes tab as
   * 🏠 / 🤝 / 🔧 badges. Optional — pre-provenance saves don't
   * have it; the UI defaults missing entries to "native".
   */
  inventoryProvenance?: Record<string, {
    source: "native" | "areal" | "internal-rule";
    sourceLangId?: string;
    sourceLangName?: string;
    generation?: number;
  }>;
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
   * Approximate speaker population. Small communities innovate
   * faster than large ones (founder effects, reduced network size;
   * cf. Nettle 1999, Lupyan & Dale 2010). `speakerFactor(speakers)`
   * in `phonology/rate.ts` turns this into a change-rate multiplier.
   * Optional for back-compat — missing means "unspecified" and the
   * engine treats it as a neutral 10 000.
   */
  speakers?: number;
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
  activeRules: import("./phonology/generated-types").GeneratedRule[];
  /**
   * Retired rules kept for UI history.
   */
  retiredRules?: import("./phonology/generated-types").GeneratedRule[];
  /**
   * Per-family bias vector used by the procedural proposer. Higher numbers
   * mean the language is more inclined to invent rules of that family.
   */
  ruleBias?: Record<string, number>;
  /**
   * Per-meaning lexical-stress override for languages whose
   * `grammar.stressRule` is `"lexical"` (e.g. PIE mobile accent).
   * Each entry is the index of the stressed syllable (0-based) for
   * that meaning's form. Meanings absent from the map fall back to
   * the default penult rule.
   *
   * Stress is recomputed on the fly from the current form; it
   * persists across phonological drift only when the syllabification
   * is stable, which is fine for the simulator's purposes (mobile
   * accent in PIE was already mostly stable per-paradigm).
   */
  lexicalStress?: Record<string, number>;
  /**
   * Register assignment per meaning: some meanings have a "high" / "low"
   * split recorded here so narrative / cultural features can style output.
   */
  registerOf?: Record<string, "high" | "low">;
  /**
   * Persistent 2D map coordinates. Derived from the language's
   * `territory.centroid` when territories are in play; falls back to
   * an id-hash layout for pre-territory saves. Mutable across
   * generations so areal mechanics + the MapView render see the same
   * positions.
   */
  coords?: { x: number; y: number };
  /**
   * Voronoi-cell territory on the world map. Cell ids reference the
   * `WorldMap` returned by `engine/geo/map.ts::getWorldMap`. Each
   * generation, growth claims one more neighbour cell with low
   * probability; splits partition the parent's territory among
   * daughters; death frees the cells back to the unowned pool.
   *
   * Optional for back-compat — pre-§C saves don't have it. The map
   * renderer falls back to centroid-only rendering when missing.
   */
  territory?: {
    cells: number[];
  };
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
  /**
   * Primary word-stress pattern. Drifts slowly between initial (Finnish,
   * Czech), penultimate (Polish, Swahili — also the simulator default
   * when unspecified, back-compat), and final (French, Turkish).
   * Protected vowels (those under stress) reduce less, so a stress-
   * shift can reshape vowel-reduction patterns across the lexicon.
   */
  stressPattern?: "initial" | "penult" | "final" | "antepenult" | "lexical";
  /**
   * Suppletive paradigm entries. Keyed by meaning → morph category →
   * full surface form that overrides the usual `stem + affix` inflection.
   * Models the go/went, be/is/was type of paradigm-internal
   * root-alternation. Only ever populated for a handful of high-
   * frequency verbs; normal inflection is the fallback when a slot
   * isn't present here. Import type avoids pulling `MorphCategory`
   * into `types.ts` directly.
   */
  suppletion?: Record<
    Meaning,
    Partial<Record<import("./morphology/types").MorphCategory, WordForm>>
  >;
  /**
   * Language-specific productive derivational suffixes. Seeded at
   * language birth from the phoneme inventory so every descendant has
   * its own family of "affixes that mean agent / quality / place /
   * instrument / diminutive". Used by the genesis.derivation rule
   * in preference to the global fallback; also gains new members
   * over time via grammaticalisation.
   *
   * `tag` is a semantic label ("-er", "-ness", "-dim"…); `affix` is
   * the actual phoneme sequence. Missing or empty ⇒ the global
   * fallback list in `genesis/catalog.ts` is used.
   */
  derivationalSuffixes?: Array<{ affix: WordForm; tag: string }>;
  /**
   * Cultural tier in {0, 1, 2, 3}. Gates which concepts the
   * dictionary-pull genesis path is allowed to coin for this
   * language — a tier-0 forager language can't name "iron" or
   * "plow" until it advances. Advances slowly with age and
   * population via `simulation.ts::advanceCulturalTier`.
   */
  culturalTier?: 0 | 1 | 2 | 3;
  /**
   * Target lexicon size; grows with age + cultural tier + speakers.
   * Capacity-driven coinage: when `|lexicon| < lexicalCapacity`, the
   * dictionary-pull path has a high probability of firing; once the
   * language has reached capacity, new coinages slow to a trickle.
   * Missing ⇒ treated as effectively infinite (back-compat for
   * pre-concept-dictionary saves).
   */
  lexicalCapacity?: number;
  /**
   * Re-carving record: which concepts got folded into another slot
   * after a `semantics/recarve.ts::maybeRecarve` merge event. Keyed
   * by the winner's concept id; the value is the list of concepts
   * whose meanings the winner's form now carries. English `tongue`
   * carrying both "tongue" and "language" would list as
   * `tongue → [language]`. Empty / missing means no merges yet.
   */
  colexifiedAs?: Record<Meaning, Meaning[]>;
  /**
   * Substrate-simplification phase tracking. When a language's recent
   * loan rate exceeds the threshold (`loanRate10gen` averaged across
   * a 10-gen window), an accelerated-simplification phase fires —
   * paradigm-merger probability triples for `accelerationRemaining`
   * generations. Models the mass-loaning + simplification we see in
   * conquered languages (Old English under Norse, Persian under
   * Arabic). Optional + transient state.
   */
  substrateAccelerationRemaining?: number;
  /**
   * Loan-event timestamps (last `LOAN_HISTORY_WINDOW` generations
   * worth) so we can compute a moving rate without scanning the
   * full event log every step. Stored on the language; trimmed
   * each generation.
   */
  recentLoanGens?: number[];
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
  /**
   * Morphological-typology axes added in PR B.
   *
   * `synthesisIndex` — target morphemes-per-word (0..5). 1.0 = English-
   * like analytical; 2.5 = Latin-like synthetic; 4+ = polysynthetic.
   * Drives genesis bias (high synthesis prefers compounds + derivations
   * over single-root coinage) and translator output (more affixes
   * stacked on each token).
   *
   * `fusionIndex` — 0..1. 0 = agglutinative (one-morpheme-per-meaning,
   * Turkish-like); 1 = fusional (portmanteau affixes, Latin-like).
   * Drives whether stacked affixes are kept distinct or merged at the
   * realisation step.
   *
   * `articlePresence` — how the language realises definite/indefinite
   * articles. `none` = no article system (Mandarin, most Slavic);
   * `free` = standalone words (English `the`, French `le`); `enclitic`
   * = suffixed to the noun (Romanian `om-ul`, Bulgarian, Macedonian);
   * `proclitic` = clitic prefix (rarer; some Bantu).
   *
   * `caseStrategy` — case morphology, prepositions, postpositions, or
   * a mix. Decides how oblique arguments are marked at translation.
   *
   * `incorporates` — noun-incorporation flag for polysynthesis. When
   * true, certain object-noun roots can fuse into the verb stem.
   *
   * `classifierSystem` — Mandarin-style numeral classifiers. When
   * true, numerals require a classifier between numeral and noun.
   *
   * `prodrop` — whether the language allows subject-pronoun dropping
   * (Spanish, Italian, Japanese). When true, the translator omits the
   * subject when verb agreement disambiguates.
   *
   * All fields are optional for backward compatibility; pre-PR-B saves
   * fall back to their declared defaults.
   */
  synthesisIndex?: number;
  fusionIndex?: number;
  articlePresence?: "none" | "free" | "enclitic" | "proclitic";
  caseStrategy?: "case" | "preposition" | "postposition" | "mixed";
  incorporates?: boolean;
  classifierSystem?: boolean;
  prodrop?: boolean;
  /**
   * Constituent ordering inside an NP / clause beyond the top-level
   * S/V/O. All optional; defaults are pre-modifier (English-style).
   *
   * `adjectivePosition`  — where attributive adjectives sit relative
   *                        to their head noun. `pre` = English, German,
   *                        Mandarin; `post` = French, Spanish, Welsh.
   * `possessorPosition`  — where the possessor sits relative to the
   *                        possessed noun. `pre` = English ("John's
   *                        book"), `post` = Italian ("il libro di
   *                        Giovanni").
   * `numeralPosition`    — where a cardinal numeral sits relative to
   *                        its noun. `pre` = English, Spanish; `post`
   *                        = some Bantu, some Mayan.
   * `negationPosition`   — `pre-verb` = English (`do not see`),
   *                        Spanish (`no veo`); `post-verb` = some
   *                        Romance archaisms; `prefix` = morphological
   *                        ne- on the verb; `suffix` = morphological
   *                        -nai on the verb (Japanese).
   */
  adjectivePosition?: "pre" | "post";
  possessorPosition?: "pre" | "post";
  numeralPosition?: "pre" | "post";
  negationPosition?: "pre-verb" | "post-verb" | "prefix" | "suffix";
  /**
   * Aspect / mood / voice / interrogative typology added in PR B
   * follow-up. All optional; defaults applied at read-site.
   *
   * `aspectMarking`        — "none" | "perfective" | "imperfective" |
   *                          "progressive". Drives which verb.aspect.*
   *                          paradigm fires by default; tokeniser
   *                          cues (e.g. "is going") override per-line.
   * `voice`                — "active" | "mixed". When `mixed` the
   *                          translator emits passive when the input
   *                          contains "is/was/were Xed" pattern, via
   *                          verb.voice.pass.
   * `moodMarking`          — declarative | subjunctive | imperative.
   *                          Cues: "should/might/may" → subjunctive;
   *                          imperative input "do X!" → imperative.
   * `interrogativeStrategy` — how yes/no questions surface:
   *                          "particle"  = a sentence-final / initial
   *                                        particle (Mandarin 吗,
   *                                          Japanese か).
   *                          "inversion" = subject-verb inversion
   *                                        (English "Is the king …").
   *                          "intonation" = no morphological cue;
   *                                        the realiser appends "?"
   *                                        as a marker.
   * `interrogativeParticle` — when `interrogativeStrategy` is
   *                          "particle", the lemma the closed-class
   *                          table renders for it (treated like a
   *                          discourse.q particle).
   */
  aspectMarking?: "none" | "perfective" | "imperfective" | "progressive";
  voice?: "active" | "mixed";
  moodMarking?: "declarative" | "subjunctive" | "imperative";
  interrogativeStrategy?: "particle" | "inversion" | "intonation";
  interrogativeParticle?: "initial" | "final";
}

export interface SimulationConfig {
  seed: string;
  /**
   * How many years one generation represents. Drives the
   * "gen 80 ≈ 2000y" anchor in the UI and lets users reason about
   * outputs against attested diachronic linguistics. Default 25 is
   * the standard demographic figure (one human generation; cf. Pagel
   * et al. 2007 evolutionary tree-dating in 25y units). All
   * per-generation rates are calibrated against this anchor — change
   * it and the surface output speed shifts proportionally.
   */
  yearsPerGeneration?: number;
  /**
   * Master realism / pacing slider in [0.1, 5.0]. Scales every
   * stochastic rate the engine has in a single multiplier so the
   * user can pull one knob to dial between "fast / educational" (5×)
   * and "slow / research-grade" (0.2×). Default 1 = stock pacing.
   * Plumbed through `rateMultiplier` in `phonology/rate.ts`.
   */
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
    /**
     * Per-gen probability of a re-carving event: two cluster-mates
     * with a known cross-linguistic colexification merge into one
     * slot, or a single concept splits into two daughter slots.
     * Rare — this is how Russian `ruka` = arm+hand and English
     * arm/hand diverge from a common ancestor.
     */
    recarveProbabilityPerGeneration?: number;
  };
  obsolescence: {
    probabilityPerPairPerGeneration: number;
    maxDistanceForRivalry: number;
    /**
     * Per-generation chance the language drops its `be` copula
     * lexeme entirely — drives the copula → zero-copula
     * grammaticalisation pathway (PIE *h₁es- → modern Russian Ø).
     * Optional; defaults to 0.005. Set 0 to disable.
     */
    copulaLossProbability?: number;
    /**
     * Per-generation chance a zero-copula language (no `be` lexeme)
     * grammaticalises a new copula from a demonstrative, pronoun,
     * posture verb, or locative verb. Mirrors Mandarin 是 ← Old
     * Chinese demonstrative; Hebrew הוא ← pronoun; Spanish estar
     * ← stare. Optional; defaults to 0.0025 (genesis is rarer than
     * loss). Set 0 to disable.
     */
    copulaGenesisProbability?: number;
  };
  morphology: {
    grammaticalizationProbability: number;
    paradigmMergeProbability: number;
    /**
     * Per-gen probability of a lexical analogical-leveling event
     * (an outlier form gets reshaped toward its cluster mean).
     */
    analogyProbability?: number;
    /**
     * Per-gen probability of cliticization — a high-frequency
     * content word gets phonologically compressed and tagged as a
     * clitic, the intermediate stage on the way to becoming an
     * affix via `maybeGrammaticalize`.
     */
    cliticizationProbability?: number;
    /**
     * Per-gen probability of a suppletion event: a high-frequency
     * verb fills one of its inflected slots (past / perfective /
     * 1sg …) with an unrelated root drawn from another verb.
     */
    suppletionProbability?: number;
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
   * Per-preset grammar overrides. Merged into DEFAULT_GRAMMAR at proto
   * birth so presets can declare their typology (Germanic gets a
   * `the`-style article system, Romance gets free articles + SVO,
   * etc.) without engine changes.
   */
  seedGrammar?: Partial<GrammarFeatures>;
  /**
   * Optional seed stress pattern for the proto language. Overrides
   * the engine's default `penult`. Use `lexical` for languages with
   * mobile / inherited word-accent (PIE).
   */
  seedStressPattern?: NonNullable<Language["stressPattern"]>;
  /**
   * Optional seed lexical-stress map for protos with `seedStressPattern
   * = "lexical"`. Each entry maps a meaning → stressed-syllable index
   * (0-based vowel position).
   */
  seedLexicalStress?: Record<Meaning, number>;
  /**
   * Opt-in: run fast-forward steps in a Web Worker so the UI thread
   * stays responsive during long runs.
   */
  useWorker?: boolean;
  preset?: string;
  /** Evolution-speed profile id (conservative / standard / rapid / extreme). */
  evolutionSpeed?: string;
  /**
   * World-map shape. "random" generates a unique continent from the
   * sim seed; "earth" uses a fixed low-poly approximation of the
   * inhabited continents. Missing = "random" (default).
   */
  mapMode?: "random" | "earth";
  /**
   * Voronoi-cell id at which the proto-language starts. The user
   * picks this on the map preview before starting; if missing, the
   * preset's suggested origin (Earth mode) or a random viable land
   * cell (Random mode) is used.
   */
  originCellId?: number;
}

export interface SimulationState {
  generation: number;
  tree: LanguageTree;
  rootId: string;
  rngState: number;
}

export interface SavedRun {
  version: 5;
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
