import type { Rng } from "./rng";

export type { Phoneme, Meaning, WordForm, Lexicon } from "./primitives";
import type { Phoneme, Meaning, WordForm, Lexicon } from "./primitives";

export type SoundChangeCategory =
  | "lenition"
  | "fortition"
  | "voicing"
  | "devoicing"
  | "deletion"
  | "insertion"
  | "assimilation"
  | "vowel"
  | "metathesis"
  | "palatalization"
  | "gemination"
  | "tonogenesis"
  | "detonogenesis"
  | "harmony"
  | "umlaut"
  | "monophthongization"
  | "compensatory"
  | "glottalization"
  | "stress"
  | "inventory"
  | "retroflex";

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
    | "actuation"
    // Phase 29 Tranche 3a: previously squashed under sound_change /
    // grammar_shift / semantic_drift. Filterable per-kind in EventsLog.
    | "volatility"
    | "areal"
    | "creolization"
    | "lexical_replacement"
    | "productivity"
    | "suppletion"
    | "merger"
    | "tier_transition"
    | "kinship_simplification";
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
  /**
   * Phase 26b: how the language realises the infinitive (citation form)
   * of a verb. The simulator stores `lang.lexicon[verbMeaning]` as the
   * BARE root; the infinitive is a derived view computed on demand by
   * `morphology/citation.ts:verbCitationForm`. Strategies:
   *
   * - `bare`               — citation form = bare root (no marker).
   * - `particle-prefix`    — emit a particle BEFORE the root (English "to V").
   * - `particle-suffix`    — emit a particle AFTER the root.
   * - `affix-prefix`       — concatenate an affix before the root.
   * - `affix-suffix`       — concatenate an affix after the root (Latin -re,
   *                           Spanish -r/-er/-ir, German -en, Italian -re).
   *
   * Defaults to `{ kind: "bare" }` for back-compat with pre-Phase-26
   * presets. The translator + LexiconView consult this when displaying
   * verbs in non-finite contexts.
   */
  infinitiveStrategy?: {
    kind: "bare" | "particle-prefix" | "particle-suffix" | "affix-prefix" | "affix-suffix";
    /** For "particle-*": the closed-class lemma to use ("to" in English). */
    particle?: string;
    /** For "affix-*": the phonological affix to concatenate. */
    affix?: WordForm;
  };
  /**
   * Phase 27a: phonotactic profile — language-specific syllable shape
   * constraints. Hawaiian-style languages (maxOnset=1, maxCoda=0) reject
   * complex clusters; English-style (maxOnset=3, maxCoda=4) accept them.
   * Used as a SOFT bias (not a hard gate) by:
   *   - genesis: prefer compliant candidates when coining.
   *   - borrowing: trigger repair on heavily-violating loans.
   *   - sound change: penalty in lambda for rules whose output violates.
   *   - phonotactic-repair pass: fix violators via existing epenthesis rules.
   *
   * `strictness` weighs the penalties. 0 = anything goes; 1 = strict
   * enforcement.
   */
  phonotacticProfile?: {
    /** Max consecutive consonants in a word-initial onset. */
    maxOnset: number;
    /** Max consecutive consonants in a word-final coda. */
    maxCoda: number;
    /** Max consecutive consonants anywhere in the word (medial CC). */
    maxCluster: number;
    /** 0..1 — how aggressively the engine biases toward compliance. */
    strictness: number;
  };
  /**
   * Phase 27b: per-phoneme functional-load cache. Updated lazily by
   * `functionalLoadMap(lang, generation)`. Generation key invalidates
   * the cache when the lexicon or inventory changes.
   */
  functionalLoadCache?: {
    generation: number;
    perPhoneme: Record<Phoneme, number>;
  };
  /**
   * Phase 29 Tranche 5c: per-rule actuation timestamp. Once a rule
   * starts firing in this language, its `actuatedAt` is set to the
   * current generation. The Wang S-curve in apply.ts gates per-rule
   * lambda by (currentGen - actuatedAt) so a rule's effect ramps up
   * over generations rather than firing at full rate the moment it's
   * enabled. Together with frequency-direction (Phase 24c) this
   * produces the lexical-diffusion S-curve: low-frequency words
   * adopt early, high-frequency content words lag by tens of
   * generations.
   */
  diffusionState?: Record<string, { actuatedAt: number }>;
  /**
   * Phase 29 Tranche 5d: sound correspondence law tracker. Each
   * (proto, daughter, environment) triple records how often a given
   * substitution actually fires across the lexicon vs how often it
   * MIGHT fire (matching site count). The fires/total ratio is the
   * "regularity" — a Grimm's-Law-grade systematic shift exhibits ≥
   * 0.8. The UI uses this to surface "this language exhibits the
   * shift /p/ → /f/ word-initially with 87% regularity" badges.
   *
   * Key format: `${from}>${to}@${environment}` where environment is
   * "any" / "initial" / "final" / "intervocalic".
   */
  correspondences?: Record<
    string,
    {
      from: Phoneme;
      to: Phoneme;
      environment: "any" | "initial" | "final" | "intervocalic";
      /** Number of attested applications across the lexicon. */
      fires: number;
      /** Number of matching sites observed (fires + non-fires). */
      total: number;
      /** Generation at which this correspondence was first recorded. */
      firstSeenGeneration: number;
      /** Most recent gen the correspondence fired. */
      lastFireGeneration: number;
    }
  >;
  suppletion?: Record<
    Meaning,
    Partial<Record<import("./morphology/types").MorphCategory, WordForm>>
  >;
  /**
   * Phase 29 Tranche 5e: per-meaning inflection class. Latin-style
   * 1st/2nd/3rd/4th conjugations (or noun declensions). Assigned at
   * coinage time biased by the form's phonological shape; consulted
   * by paradigm-pickers via the `class:N` ParadigmCondition. Languages
   * with no classification system leave this undefined for all
   * meanings (the default).
   */
  inflectionClass?: Record<Meaning, import("./morphology/types").InflectionClass>;
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
    /**
     * Phase 22: count of successful targeted-derivation applications under
     * this suffix. Once it reaches PRODUCTIVITY_THRESHOLD, the suffix is
     * promoted to a productive grammatical rule.
     */
    usageCount?: number;
    /**
     * Phase 22: true once `usageCount >= PRODUCTIVITY_THRESHOLD`. Productive
     * suffixes are surfaced in GrammarView as rules; new applications no
     * longer push individual coinage events into the timeline.
     */
    productive?: boolean;
    /**
     * Phase 22: generation at which `productive` flipped to true. Lets the UI
     * show "established gen 47" alongside the rule.
     */
    establishedGeneration?: number;
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
   * Phase 30 Tranche 30c: generation when wordOrder was last flipped.
   * The drift gate enforces a 50-gen cooldown to prevent thrashing.
   */
  wordOrderLastFlipGen?: number;
  /**
   * Phase 31 Tranche 31a: language-level tonal regime. Tone is
   * essentially all-or-nothing per language: tonal languages (Mandarin,
   * Yoruba, most Niger-Congo) tone every syllable; non-tonal languages
   * (English, Spanish, Russian) have zero contrastive tone; pitch-
   * accent languages mark one syllable per word. Pre-Phase-31 the
   * simulator allowed per-word tone drift, producing inconsistent
   * states like "32% of Bantu words are tonal, the other 68% are
   * not." `refreshInventory` now classifies the language each gen
   * based on coverage thresholds and `phonemeInventory.usesTones` is
   * derived from this field.
   */
  toneRegime?: "non-tonal" | "tonal" | "pitch-accent";
  /**
   * Phase 34 Tranche 34a: compound metadata. When a meaning is a
   * semantically-compound concept (moonlight = moon + light,
   * daylight = day + light, homework = home + work), it carries a
   * structural definition here. Two regimes:
   *   - **transparent** (`fossilized: false`): the meaning's
   *     surface form in `lang.lexicon[m]` is RECOMPUTED each gen
   *     from the current forms of its parts. Drift in the parts
   *     propagates automatically to the compound.
   *   - **fossilized** (`fossilized: true`): the compound has
   *     opacified; `lang.lexicon[m]` is frozen and drifts
   *     independently of its parts (English "lord" < "loaf-warden"
   *     became opaque centuries ago). Fossilization fires at a low
   *     per-gen probability scaled by frequency.
   *
   * Pre-Phase-34 compounds were either (a) seeded as flat
   * lexicon entries (no metadata) or (b) coined at runtime by the
   * `compound` mechanism in genesis (which also stored a flat
   * form). The new metadata enables proper diachronic modeling of
   * compound erosion + univerbation + analysis.
   */
  compounds?: Record<Meaning, {
    parts: Meaning[];
    /** Optional connector segment between parts (German -s-, Greek -o-). */
    linker?: WordForm;
    fossilized: boolean;
    fossilizedGen?: number;
    /** Generation when the compound was originally formed. */
    bornGeneration: number;
  }>;
  /**
   * Generation deadline for the abstract-vocabulary catch-up window.
   * Set when a language crosses into tier 2 (literacy / abstract noun
   * morphology unlocks): the genesis driver bumps targetedDerivation
   * probability from 0.4 to 0.85 until `state.generation >= this`,
   * producing a realistic "abstracts pour into the lexicon shortly
   * after literacy" effect. Cleared once expired.
   */
  vocabularyCatchUpUntil?: number;
  /**
   * Phase 25: time-varying volatility regime. Each language cycles
   * between a default "stable" mode (rate ≈ 1×) and occasional
   * "upheaval" periods (rate 3–5×) lasting ~10–25 generations. Models
   * real-history bursts: Norman conquest, Great Vowel Shift, the Bantu
   * expansion, etc. Triggers: tier transitions, heavy contact, random
   * exogenous events. Cleared once `until` is reached.
   */
  volatilityPhase?: {
    kind: "stable" | "upheaval";
    /** Generation at which this phase ends and a new one is rolled. */
    until: number;
    /** Rate multiplier applied to phonology + grammar steps. */
    multiplier: number;
    /** Optional human-readable trigger ("tier-2 transition", "heavy contact", etc.) for the timeline. */
    trigger?: string;
  };
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
  /**
   * Phase 29 Tranche 1e: O(1) form-key → Word lookup index, rebuilt
   * by `rebuildFormKeyIndex` (called after syncWordsAfterPhonology,
   * init, and tree split) and updated incrementally by setLexiconForm.
   * Not persisted — `migrateSavedRun` rebuilds it from `words` on
   * load. Optional for back-compat with v6 saves that haven't been
   * touched yet.
   */
  wordsByFormKey?: Map<string, Word>;
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
  /**
   * Phase 34 Tranche 34c: how the language realises future tense.
   *   - **synthetic**: affix on the verb stem (Latin amabō, Old English).
   *   - **go-future**: auxiliary "go" + main verb (Spanish ir + a, French
   *     aller + V, English going-to). Grammaticalised from a motion verb.
   *   - **will-future**: auxiliary "will" + bare verb (Modern English).
   *     Grammaticalised from a desiderative.
   *   - **shall-future**: auxiliary "shall" + bare verb (Old English,
   *     archaic Modern English).
   * Default synthetic. The grammaticalisation pathway in
   * `maybeGrammaticalize` flips to a periphrastic when the source
   * verb has high frequency.
   */
  futureRealisation?: "synthetic" | "go-future" | "will-future" | "shall-future";
  /**
   * Phase 34 Tranche 34c: how perfect aspect renders.
   *   - **synthetic**: affix on the verb stem.
   *   - **have-perfect**: "have" + past participle (Romance, Modern
   *     English have-perfect, Modern German haben-perfect).
   *   - **be-perfect**: "be" + past participle (French être-perfect for
   *     unaccusative verbs, Modern German sein-perfect).
   * Default synthetic.
   */
  perfectRealisation?: "synthetic" | "have-perfect" | "be-perfect";
  /**
   * Phase 35 Tranche 35c: demonstrative depth. Languages cluster on
   * how many distance contrasts they make on demonstratives:
   *   - **two-way**: this/that (English, French, Russian).
   *   - **three-way**: this / that-near-you / that-yonder (Spanish
   *     este/ese/aquel, Japanese kore/sore/are, Korean i/geu/jeo).
   *   - **four-way**: adds visibility or elevation (some Salishan,
   *     Tibetan).
   * Default two-way.
   */
  demonstrativeDistance?: "two-way" | "three-way" | "four-way";
  /**
   * Phase 35 Tranche 35d: number axis. Beyond singular vs plural,
   * many languages distinguish dual (Slovenian, Arabic, Hebrew,
   * Sami, Sanskrit-style) and a few have paucal (Russian-historical
   * "few", Hopi).
   *   - **sg-pl**: two-way.
   *   - **sg-du-pl**: three-way with dual.
   *   - **sg-du-pa-pl**: four-way with dual + paucal.
   * Default sg-pl.
   */
  numberSystem?: "sg-pl" | "sg-du-pl" | "sg-du-pa-pl";
  /**
   * Phase 35 Tranche 35e: aspect richness beyond perfect. Real
   * languages differ on which aspectual oppositions are
   * grammaticalised:
   *   - **simple**: tense without overt aspect (English-style
   *     simple-present).
   *   - **pfv-ipfv**: perfective vs imperfective pairing on every
   *     verb (Russian, Polish).
   *   - **prog**: progressive vs simple (English, Spanish).
   *   - **rich**: perfective + imperfective + progressive + habitual
   *     overtly marked (Mandarin, Hindi).
   * Default simple.
   */
  aspectSystem?: "simple" | "pfv-ipfv" | "prog" | "rich";
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
    /**
     * Phase 29 Tranche 3b: previously-unconditional steps now gated.
     * Default true so existing saves and presets behave identically.
     */
    contact: boolean;
    volatility: boolean;
    areal: boolean;
    creolization: boolean;
    learner: boolean;
    obsolescence: boolean;
    taboo: boolean;
    copula: boolean;
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
  /** Phase 26b: per-preset infinitive realisation strategy. See Language.infinitiveStrategy. */
  seedInfinitiveStrategy?: NonNullable<Language["infinitiveStrategy"]>;
  /** Phase 27a: per-preset phonotactic profile. See Language.phonotacticProfile. */
  seedPhonotacticProfile?: NonNullable<Language["phonotacticProfile"]>;
  /**
   * Phase 31 Tranche 31d: declarative tonal regime. Determines
   * whether the proto language is tonal at gen 0 and whether
   * tonogenesis rules can fire during the run.
   */
  seedToneRegime?: NonNullable<Language["toneRegime"]>;
  /**
   * Phase 34 Tranche 34g: declare seeded compound meanings. Each
   * entry maps the compound meaning to its constituent meanings
   * + optional linker. At language birth, the simulator computes
   * the initial surface from the parts (which must be in
   * `seedLexicon`) and stores the compound metadata on
   * `lang.compounds`. Transparent compounds drift with their parts
   * until they fossilise (Phase 34 Tranche 34a).
   *
   * Example: `seedCompounds: { moonlight: { parts: ["moon", "light"] } }`.
   */
  seedCompounds?: Record<Meaning, {
    parts: Meaning[];
    linker?: WordForm;
  }>;
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
  version: 7;
  id: string;
  label: string;
  createdAt: number;
  config: SimulationConfig;
  generationsRun: number;
  stateSnapshot?: SimulationState;
}
