import type { Rng } from "./rng";

/**
 * types.ts — engine-wide shared types.
 *
 * The central type vocabulary the simulator speaks. Defines the
 * SimulationState / Language / Word / Paradigm / Grammar shapes
 * passed between every layer (config → engine → UI). The Language
 * interface in particular is the canonical state shape; per-meaning
 * maps (lexicon, wordFrequencyHints, inflectionClass,
 * nounDeclensionClass, ablautClassAssignment, grammaticalizationStage,
 * etc.) all live here.
 *
 * When adding a per-meaning field, also update:
 *   - tree/split.ts (inherit on daughter split)
 *   - lexicon/mutate.ts:deleteMeaning (purge on delete)
 *   - contact/borrow.ts (decide if borrowed entries get assigned)
 *   - persistence/migrate.ts (schema migration if persisted)
 *
 * See CLAUDE.md for the full per-phase feature catalogue and
 * ARCHITECTURE.md for the design walkthrough.
 */

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
  | "retroflex"
  | "delabialisation"
  | "deaspiration";

export type PositionBias = "initial" | "final" | "internal" | "any";

export interface SoundChange {
  id: string;
  label: string;
  category: SoundChangeCategory;
  description: string;
  positionBias?: PositionBias;
  stressFilter?: "stressed" | "unstressed" | "pretonic" | "any";
  probabilityFor: (word: WordForm) => number;
  /**
   * Phase 74 (perf): necessary-trigger phonemes. If set, `probabilityFor`
   * is GUARANTEED to return 0 for any word containing NONE of these
   * phonemes (e.g. a substitution `from→to` can't fire without `from`
   * present). The hot loop uses an O(1) phoneme-presence check to skip
   * such rules before paying for the `probabilityFor` word-scan — a
   * byte-identical fast path for the existing `base <= 0` early-out.
   * Omit it for rules whose probability can be non-zero regardless of
   * any specific phoneme (deletion/insertion/stress/tone): those are
   * always evaluated. Set ONLY when absence provably forces probability 0.
   */
  triggers?: readonly Phoneme[];
  apply: (word: WordForm, rng: Rng) => WordForm;
  enabledByDefault: boolean;
  baseWeight: number;
  priority?: number;
  /**
   * Phase 36 Tranche 36g: cross-linguistic actuation frequency.
   * Lenitions, vowel reductions, palatalisation are "common"
   * (×1.5). Metathesis, dissimilation, marked fortition are "rare"
   * (×0.4). Most others land on "ordinary" (×1.0). Default ordinary.
   */
  frequency?: "common" | "ordinary" | "rare";
  /**
   * Phase 36 Tranche 36g: actuation regime.
   * - "diffuse" (default): Wang-style lexical diffusion; rule fires
   *   word-by-word over many generations as adoption ramps via the
   *   sigmoid in apply.ts.
   * - "blanket": Neogrammarian. When the rule actuates in a
   *   language, every applicable site flips in a single generation.
   *   Used for major obstruent shifts and chain-shifts.
   */
  regime?: "blanket" | "diffuse";
  /**
   * Phase 36 Tranche 36r: short rationale for frequency/regime
   * choices. One sentence, surfaces in the rule-catalog UI tooltip.
   */
  rationale?: string;
  /**
   * Phase 72g T1 (stratal phonology): stratum tag for ordering.
   *   - "lexical" (post-Phase-72g default for morphologically-
   *     conditioned rules): applies to UR before allomorph spell-out;
   *     fires only when stratal mode is enabled. Sees UR phonemes.
   *   - "post-lexical" (default): applies to the surface form after
   *     allomorphy and inflection have been built. Sees SR phonemes.
   *
   * In stratal mode, lexical rules run first against the UR and
   * write to an intermediate representation; post-lexical rules then
   * run against the intermediate to produce the SR. In legacy
   * (non-stratal) mode this field is ignored — all rules run in
   * priority order against the surface.
   */
  stratum?: "lexical" | "post-lexical";
}

/**
 * Phase 73d Tier D Phase D1: per-daughter latent typological
 * direction. Three orthogonal-ish axes each in [-1, 1]. The
 * combination determines a daughter's correlated bias profile:
 * a daughter with `simplification: +0.8, palatalization: +0.4,
 * synthesis: -0.3` will favour lenition + open syllables +
 * palatalization + isolating morphology — the Romance-ish corner.
 * Opposing axes give the Slavic / Germanic / Indic profiles.
 *
 * Sampled per-daughter at split with anti-correlation across
 * siblings; sisters end up in opposing halves of the typology
 * space.
 */
export interface TypologicalDirection {
  /** + = lenition + cluster-loss + open-syllable target;
   *  − = fortition + cluster-preservation + closed-syllable. */
  simplification: number;
  /** + = palatalization + harmony developing;
   *  − = back-vowel + no harmony. */
  palatalization: number;
  /** + = synthetic + fixed stress;
   *  − = isolating + lexical/final stress. */
  synthesis: number;
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
    | "kinship_simplification"
    | "grammar_cascade"
    // Phase 48 D4-D: phonologisation event — a phoneme's contextual
    // diversity rose past the threshold and a new contrast emerged.
    | "phonologisation"
    // Phase 56 T2: paradigm collision detected — sound change has
    // reduced two paradigms to homophony, signalling that the
    // language is ripe for renewal (recruiting a new affix or
    // shedding the merged distinction).
    | "paradigm-renewal"
    // Phase 70 T1: Historical Mode milestone fired (HOI4-style
    // soft-railroad). Surfaces in EventsLog with milestoneId / role.
    | "historical_milestone";
  description: string;
  meta?: {
    donorId?: string;
    recipientId?: string;
    meaning?: string;
    category?: string;
    pathway?: string;
    pairedRuleId?: string;
    // Phase 56 T2: paradigm-collision identifier (catA|catB|affix)
    // for idempotency. catA / catB / affix surface the colliding
    // pair for downstream consumers (UI, renewal-driven recruiter).
    collisionKey?: string;
    catA?: string;
    catB?: string;
    affix?: string;
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
  /**
   * Phase 72f T1: vitality / endangerment level. Pre-72f, languages
   * had a binary alive→extinct transition. Real-world endangerment
   * is a continuum:
   *   - "vigorous"   — actively spoken across all generations.
   *   - "endangered" — older speakers shifting; child-acquisition rate
   *                    falling.
   *   - "moribund"   — only elderly speakers; not transmitted.
   *   - "extinct"    — no speakers; equivalent to extinct: true.
   *
   * The transition logic is driven by population pressure × diversity
   * (see steps/tree.ts:assessEndangerment). Endangered/moribund
   * languages get reduced innovation rates (audit S7 row 4: "death is
   * binary alive→extinct; no endangered states").
   *
   * The legacy `extinct: boolean` is kept as the canonical "is this
   * language alive?" check (every read site uses it). When
   * endangermentLevel transitions to "extinct" we set
   * `extinct = true` for back-compat.
   */
  endangermentLevel?: "vigorous" | "endangered" | "moribund" | "extinct";
  endangermentLastTransitionGen?: number;
  /**
   * Phase 72f T3: prestige-variety flag. A prestige variety is a
   * standardised, codified register (Classical Latin, Mandarin
   * standard, RP English) that exists alongside an unmarked
   * vernacular. Prestige varieties:
   *   - innovate slower (×0.5 in the phonology rate composition).
   *   - resist analogical levelling and grammar drift.
   *   - get spawned at tier 2 transitions when literacy is
   *     established (handled in steps/tier.ts).
   * Per audit S8 row 6 ("no standard-vs-vernacular distinction").
   * Daughter languages do NOT auto-inherit this flag — prestige is
   * institutional, not phylogenetic.
   */
  prestigeVariety?: boolean;
  prestigeVarietySinceGen?: number;
  /**
   * Phase 72f T2: continuous volatility intensity scalar replacing
   * the legacy 2-state phase machine (volatilityPhase: "stable" |
   * "upheaval"). The scalar lives on [0, 2] where 1.0 is the neutral
   * baseline. The phase machine (volatilityPhase) is preserved for
   * back-compat readers; new code should consult `volatilityIntensity`
   * directly. Continuous values let prestige + tier + bilingual
   * contact each contribute fractional amounts to the resulting rate.
   * Per audit S8 row 1 ("volatility is 2-state phase machine; should
   * be continuous").
   */
  volatilityIntensity?: number;
  /**
   * Phase 72f T5: per-(meaning, ruleId) lexical diffusion timestamps.
   * Pre-72f, Wang-style S-curve adoption was tracked per-rule
   * per-language only (`diffusionState[ruleId]`), so every meaning in
   * the lexicon was treated as adopting at the same generation. Real
   * diffusion proceeds word-by-word — high-frequency words first,
   * then medium, then low. This map stores `(ruleId, meaning) →
   * adoptedAt` so the inner loop can branch on per-word adoption.
   * Per audit S8 row 9.
   */
  perWordDiffusion?: Record<string, Record<string, number>>;
  /**
   * Phase 72g T1: stratal phonology underlying-representation layer.
   * When `lexiconUR` is defined, sound-change application uses the
   * stratal cascade (lexical → post-lexical). UR refresh policy is
   * controlled by `lexiconURRefreshPolicy`:
   *   - "each-gen" (default): UR is refreshed to match SR after every
   *     gen's phonology pass. Catches WITHIN-gen opacity only.
   *   - "manual" (Phase 72g full-delivery defer-1c): UR persists
   *     across gens; only the caller's explicit `enableStratalMode`
   *     or `refreshUR` call updates it. Catches CROSS-GEN opacity
   *     (counter-feeding / counter-bleeding rule interactions).
   * Undefined `lexiconUR` → legacy single-pass surface phonology.
   */
  lexiconUR?: Record<string, WordForm>;
  /**
   * Phase 72g T1 (defer-1c): policy for when stepPhonology refreshes
   * `lexiconUR`. See `lexiconUR` docstring above.
   */
  lexiconURRefreshPolicy?: "each-gen" | "manual";
  grammar: GrammarFeatures;
  events: LanguageEvent[];
  wordFrequencyHints: Record<Meaning, number>;
  phonemeInventory: PhonemeInventory;
  inventoryProvenance?: Record<string, {
    source: "native" | "areal" | "internal-rule" | "founder-addition";
    sourceLangId?: string;
    sourceLangName?: string;
    generation?: number;
  }>;
  /**
   * Phase 55 T1: root inventory for templatic (Semitic-style)
   * languages. Each entry maps a root-meaning (e.g. "write") to its
   * consonantal skeleton (`["k","t","b"]`). Non-templatic languages
   * leave this undefined; the template coinage mechanism returns
   * null for them.
   */
  rootInventory?: Record<Meaning, Phoneme[]>;
  /**
   * Phase 55 T1: CV templates that pair with rootInventory. Each
   * pattern is a string of `C` (root-consonant slots, in order) and
   * literal vowels (`a`, `i`, `u`, etc.). Example: `"CaCiC"` for
   * Semitic agentive (kaːtib "writer"), `"CaCCaC"` for intensive.
   */
  rootPatterns?: string[];
  /**
   * Phase 55 T2: idiom storage. Multi-word lemmas (`kick the bucket`
   * → die) bypass per-word translation. The phrase is normalised
   * lower-case + space-joined. Optional `literal` flag tracks
   * whether the language renders compositionally (literal:true) or
   * as a fixed unit.
   */
  idioms?: Record<string, { parts: Meaning[]; form: import("./types").WordForm; literal?: boolean }>;
  morphology: import("./morphology/types").Morphology;
  localNeighbors: Record<Meaning, string[]>;
  /**
   * Phase 41a: per-language active-module set. Modules in this set
   * have their `step` and `realise` hooks called; modules outside
   * the set are skipped entirely (the perf win).
   * Undefined → legacy code paths run (back-compat). Phase 46a
   * inverts this default after every preset declares its module set.
   */
  activeModules?: Set<string>;
  /**
   * Phase 41a: per-module per-language state, owned by each module.
   * Keyed by `module.id`. The module is the only consumer that
   * should read or write its own slot. Type-erased here; modules
   * cast to their own state type internally.
   */
  moduleState?: Record<string, unknown>;
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
  /**
   * Phase 48 T4: counter incremented every time a sound-change rule
   * was inhibited by the homonym-avoidance check (T3). Surfaced in
   * the narrative timeline + UI so the user can see when the inhibitor
   * is firing.
   */
  homonymInhibitions?: number;
  /**
   * Phase 48 T4: per-language tunable for the homonym-avoidance
   * inhibition probability. Defaults to 0.7. Set to 0 to disable;
   * 1 to make every potential homonym collision strict.
   */
  homonymInhibition?: number;
  /**
   * Phase 48 D4-A: counter incremented every time a phoneme-merger
   * was inhibited by the pairwise-functional-load gate. Surfaced
   * in the diagnostics view.
   */
  functionalLoadInhibitions?: number;
  /**
   * Phase 48 D4-D: per-phoneme context-diversity snapshot from the
   * previous generation. Compared against the current snapshot to
   * detect phonologization events (contrasts emerging via context
   * diversification). Hyman 2008.
   */
  contextDiversitySnapshot?: Record<string, number>;
  /**
   * Phase 48 D4-D: count of phonologization events logged. Surfaced
   * in diagnostics + narrative timeline.
   */
  phonologisationEvents?: number;
  /**
   * Phase 48 D4-C: per-vowel pressure scores derived from
   * height/backness crowding in the inventory. Tracked across
   * generations so chain-shift events fire when pressure rises past
   * threshold. Martinet 1955; Labov 1994.
   */
  vowelShiftPressure?: Record<string, number>;
  lexicalStress?: Record<string, number>;
  registerOf?: Record<string, "high" | "low">;
  /**
   * Phase 72d T2: meaning-merger pathway tracker. When a meaning is
   * deleted via recarving (e.g., "water" merges into "liquid"),
   * `lang.meaningHistory[deletedMeaning] = { mergedInto: targetMeaning,
   * generation: gen }`. Reverse translation can consult this to recover
   * orphaned proto-meanings that no longer exist as lexicon keys but
   * are conceptually preserved in the merged sense.
   *
   * Pre-72d there was NO trace; once a meaning was deleted, its identity
   * was lost. The audit (Theme D) flagged this as the core blocker for
   * concept reconstruction across recarving. A full UUID-based concept
   * registry is the right long-term fix; this is the minimal trace
   * mechanism that unlocks reverse inference without restructuring
   * the lexicon's key shape.
   */
  meaningHistory?: Record<string, {
    mergedInto?: string;
    /**
     * Phase 72d (full-delivery defer-2): UUID of the meaning that
     * absorbed this one. Stable across phonological / lexical drift;
     * lets reverse inference and reconstruction probes follow merger
     * pathways across the tree without string-matching.
     */
    mergedIntoConceptId?: string;
    /**
     * Phase 72d (defer-2): UUID of THIS deleted meaning at the time
     * of deletion. Pre-defer-2, once the string key was gone there
     * was no way to identify "this was concept X" in the trace.
     */
    conceptId?: string;
    generation: number;
    reason?: string;
  }>;
  /**
   * Phase 72d (full-delivery defer-2): per-language meaning → UUID
   * map. Each Meaning gets a stable ConceptId on first reference.
   * Daughters inherit the parent's map at split, so the same
   * proto-concept is the SAME UUID across all descendants. Used
   * for cross-tree reconstruction (which orphan in daughter X
   * corresponds to which proto-concept).
   */
  conceptIds?: Record<string, string>;
  /**
   * Per-language monotonic sequence used to mint ConceptIds
   * deterministically. Combined with the language `id` it namespaces
   * every mint to this language, so two runs of the same config
   * produce identical ConceptIds (the prior module-global counter
   * did not — it depended on process-wide mint order). Not inherited
   * at split: each language namespaces its own mints by its own `id`,
   * so a fresh daughter restarting at 0 cannot collide with the
   * ancestor ids it inherited (those carry the ancestor's `id`).
   */
  conceptIdSeq?: number;
  /**
   * Phase 72b T2: language-specific closed-class anchor list. Phase 71c
   * added universal anchors for "the/of/and/i/..." but the audit found
   * this is typologically wrong (Polynesian, Mandarin, Quechua all
   * lack one or more of these). When a preset declares this set,
   * the phonology brake (apply.ts:387) consults it instead of the
   * default English-shaped list. Undefined → use the default.
   */
  closedClassInventory?: ReadonlySet<string>;
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
   * Phase 73d Tier D Phase D1: latent typological direction vector
   * assigned at split. Drives correlated bias deltas across
   * `ruleBias`, `phonotacticProfile`, stress preference, and
   * `synthesisIndex`/`fusionIndex`. Each axis in [-1, 1]; sister
   * daughters at every split sample with anti-correlation, so they
   * occupy opposing halves of the typology space.
   *
   * NOT preset-specific. Historical mode opts out: when a
   * `SplitMilestone` overrides the daughter's `ruleBias` via
   * `initialBias`, the direction tag is still assigned (for
   * narrative colour) but the deltas are NOT applied — historical
   * mode wins on quantitative bias.
   */
  typologicalDirection?: TypologicalDirection;
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
   * Phase 64 T1: per-noun declension class assignment. Latin's 5
   * declensions, Russian's 3, etc. Drives variant lookup in
   * `pickAffixVariant` for `noun.*` paradigms when the paradigm
   * declares `variants` keyed on `class:N`.
   */
  nounDeclensionClass?: Record<Meaning, import("./morphology/types").NounDeclensionClass>;
  /**
   * Phase 64 T2: per-verb ablaut class assignment. Strong verbs
   * (sing/sang/sung) belong to ablaut class ≥ 1; "weak" / regular
   * verbs default to 0. Values 1-5 enumerate distinct vowel-mutation
   * series the language has developed. Read by inflectVerb to decide
   * whether to apply an ablaut paradigm vs the regular tense suffix.
   */
  ablautClassAssignment?: Record<Meaning, number>;
  /**
   * Phase 66 T1: per-meaning grammaticalization stage tracking.
   * Real chains (Latin habere → Romance aux → synthetic perfect →
   * zero) progress across many gens. Pre-Phase-66 the engine deleted
   * the source meaning the moment the first stage fired, so chains
   * couldn't continue.
   *
   * Stages:
   *   0 = independent open-class word
   *   1 = clitic (phonologically reduced; tagged origin "clitic:...")
   *   2 = bound affix (registered in lang.morphology.paradigms)
   *   3 = fused with stem (paradigm boundary lost)
   *   4 = fully absorbed / lost (form removed from lexicon)
   *
   * `targetCategory` records the morphological slot this meaning is
   * grammaticalising INTO so progressive stages can target the same
   * destination. `lastTransitionGen` is when the meaning last moved.
   */
  grammaticalizationStage?: Record<Meaning, {
    stage: 0 | 1 | 2 | 3 | 4;
    targetCategory?: import("./morphology/types").MorphCategory;
    lastTransitionGen: number;
  }>;
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
    /**
     * Phase 47 T2: position relative to the stem. Defaults to "suffix"
     * for back-compat with pre-Phase-47 entries. Synthesis path
     * concatenates as stem+affix (suffix) or affix+stem (prefix).
     */
    position?: "prefix" | "suffix";
    /** Phase 56 T1: last gen this suffix was applied — feeds decay. */
    lastUsedGeneration?: number;
    /** Phase 57 T1: donor language id when the suffix was acquired via contact. */
    donorLanguageId?: string;
    /** Phase 57 T1: gen the suffix was borrowed in. */
    borrowedGeneration?: number;
  }>;
  culturalTier?: 0 | 1 | 2 | 3;
  /**
   * Phase 38b: literary stability score ∈ [0, 1]. Computed each gen
   * from culturalTier + orthography presence. Tier-2+ literacy with
   * an orthography drags the language toward stability:
   * - phonological lambda × (1 - 0.6 × literaryStability)
   * - grammaticalisation × (1 - 0.4 × literaryStability)
   * - upheaval-vs-stable phase pick biased toward stable
   * Models Latin (1500y of near-zero change as literary medium),
   * Old Church Slavonic, Sanskrit. Tier 0-1 → ~0; tier 2 → ~0.7-1.0.
   */
  literaryStability?: number;
  /**
   * Phase 38c: grammaticalisation-cascade window. When set and
   * `state.generation < until`, every grammaticalisation roll has
   * its rate × `multiplier` (typically 3.0). Outside the window,
   * rates × 0.3. Cascades trigger on tier transitions, creolisation,
   * and at random ~0.4%/gen.
   */
  grammaticalisationCascade?: { until: number; multiplier: number; trigger?: string };
  /**
   * Phase 38e: per-category rule-level momentum. When a sound change
   * actuates, the rule's category gets a boost for ~15 gens so
   * sister rules in the same category fire faster — modelling
   * Grimm's-Law / Great-Vowel-Shift chain reactions.
   */
  categoryMomentum?: Record<string, { boost: number; until: number }>;
  /**
   * Phase 38g: total coinages this language has produced beyond its
   * seed lexicon. Tier-scaled accretion grows tier-3 lexicons to
   * ~5-10× seed size over a 200-gen run.
   */
  totalCoinages?: number;
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
   * Phase 72 code-review fix A2: cooldown tracker for
   * `tryReanalyseAlignment` (grammar/reanalysis.ts). Pre-fix the
   * `generationsSinceFlip` proxy in reanalysisInput() was set to a
   * hardcoded `50` and never read — so reanalysis could fire every
   * gen while conditions held, producing ping-pong between alignment
   * states. Now: caller (stepGrammar) sets this on each reanalysis
   * flip; `tryReanalyseAlignment` reads it and gates on a 50-gen
   * cooldown before flipping again.
   */
  alignmentLastFlipGen?: number;
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
   * Phase 39a: per-language phoneme inventory target. Replaces the
   * hard tier-table cap [22, 28, 34, 40] with a per-language attractor
   * that drifts. Pruning is a soft sigmoid around this target rather
   * than a hard cap, so languages can genuinely vary from ~10
   * (Hawaiian-style) to ~80+ (Caucasian-style) without forced
   * convergence. Initial value comes from `seedPhonemeTarget` if
   * declared, else seed inventory size, else tier default.
   */
  phonemeTarget?: number;
  /**
   * Phase 39g: per-language override on `CATEGORY_NATURAL_BIAS`.
   * Each entry is a multiplier (typically 0.85-1.15) that applies on
   * top of the global bias. Drifts ±0.02 per category per gen so
   * languages develop characteristic phonological preferences over
   * time (a fortition-leaning lineage vs a lenition-leaning one).
   */
  naturalBiasOverride?: Partial<Record<SoundChangeCategory, number>>;
  /**
   * Phase 39l: post-split mutual-intelligibility dampening. While
   * `state.generation < siblingDriftDampenUntil`, this language's
   * grammar drift rate is multiplied by 0.4. Models the ~400 yr
   * window where Old English and Old Saxon stayed mutually
   * intelligible despite their tree-split.
   */
  siblingDriftDampenUntil?: number;
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
   * Phase 36 Tranche 36f/36h: bound morphemes living as lexicon
   * entries. These are derivational suffixes/prefixes (e.g., `-er.agt`,
   * `-ness`, `-dom`) stored as form entries so they evolve with
   * sound change like any word, but flagged here so the lexicon UI
   * and the translator skip them in standalone-form contexts. Their
   * forms feed into derivational compounds via the `compounds` map.
   */
  boundMorphemes?: Set<Meaning>;
  /**
   * Phase 36 Tranche 36b: Bantu-style noun-class assignment per
   * meaning. Class 1-8. Singular/plural classes are paired; the
   * realiser picks the plural counterpart when number === "pl".
   * Languages without a class system leave this undefined.
   */
  nounClassAssignments?: Record<Meaning, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>;
  /**
   * Phase 36 Tranche 36m: borrow history. Each meaning may have been
   * borrowed multiple times (re-borrowing — Old French → English →
   * Modern French). Track the trail so the etymology UI can flag
   * "déjà-vu" entries.
   */
  borrowHistory?: Record<Meaning, Array<{
    fromLangId: string;
    generation: number;
    surface: string;
  }>>;
  /**
   * Phase 36 Tranche 36o: tone sandhi rule selection. Subset of
   * "meeussen" / "dissimilate" / "spread" / "downstep". Empty/undef
   * for non-tonal languages.
   */
  toneSandhiRules?: ReadonlyArray<"meeussen" | "dissimilate" | "spread" | "downstep">;
  /**
   * Phase 36 Tranche 36q: sociolinguistic register strata. Weights
   * sum to 1. Tier-2+ literacy tilts toward standard/literary;
   * vernacular dominates pre-literacy. Currently informational; the
   * apply pipeline reads `registerOf` per meaning to scale change
   * rate (see ApplyOptions.registerOf in phonology/apply.ts).
   */
  registerStrata?: { vernacular: number; standard: number; literary: number };
  /**
   * Phase 36 Tranche 36h: track when each bound morpheme was
   * introduced, and any replacement events. Powers etymology trace.
   */
  boundMorphemeOrigin?: Record<Meaning, {
    introducedGen: number;
    pathway: string;
    obsolescentGen?: number;
    replacedBy?: Meaning;
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
  /**
   * Phase 70 T1: Historical Mode role tag (HOI4-style soft railroad).
   * Set by `stepHistorical` after a `SplitMilestone` fires; daughters
   * inherit on subsequent random splits. The proto-language is tagged
   * "proto" at init when `config.historical?.scheduleId` is set.
   * `BiasMilestone`s look up leaves carrying the matching role.
   */
  historicalRole?: import("./historical/types").HistoricalRoleId;
  /** Generation at which `historicalRole` was assigned. */
  historicalRoleAssignedGen?: number;
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
  /**
   * Phase 37: synonym flag. When true, this sense represents an
   * alternative form for a meaning whose *primary* form lives on a
   * different Word. The simulator uses this to skip synonym senses
   * when looking up the primary form via `findPrimaryWordForMeaning`,
   * so synonyms don't compete with the canonical form for that role.
   * Synonym senses are still discoverable via `findWordsByMeaning`
   * and `selectSynonyms`.
   */
  synonym?: boolean;
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
  /**
   * Phase 53 T4: structural etymology. Records HOW this form was
   * coined: from which parts (compound), which base + affix
   * (derivation), via which sound mutation (ablaut), via which donor
   * language (borrow), or via which template (Semitic-style coinage).
   *
   * Read by the UI's etymology view, by sound-change rules that need
   * to detect morpheme boundaries (don't fuse syllables across a
   * compound boundary unless the language has reached opacity), and
   * by reanalysis logic that re-derives forms when paradigms shift.
   *
   * Optional for back-compat: pre-Phase-53 saves don't carry it. New
   * coinages populate it; the migration leaves old entries undefined.
   */
  morphStructure?: WordMorphStructure;
}

export type WordMorphStructureOrigin =
  | "compound"
  | "derivation"
  | "ablaut"
  | "reduplication"
  | "template"
  | "conversion"
  | "borrow"
  | "blending"
  | "clipping"
  | "ideophone"
  | "calque"
  | "seed";

export interface WordMorphStructure {
  origin: WordMorphStructureOrigin;
  /** For compound: the part meanings (in order). */
  parts?: Meaning[];
  /** For derivation / ablaut / reduplication: the base meaning. */
  base?: Meaning;
  /** For derivation: tag of the derivational affix used. */
  affix?: string;
  /** For borrow / calque: id of the donor language. */
  donorLanguageId?: string;
  /** For borrow / calque: meaning in the donor language. */
  donorMeaning?: Meaning;
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
  /**
   * Canonical S/V/O order. ⚠ Mutating this field at runtime does NOT
   * update the active `syntactical:wordOrder/*` module on Language;
   * the realiser prefers the module's `order-tokens` stage output and
   * only falls back to this field when no such module is active.
   * See `grammar/mutate.ts:setGrammarFeature` for the full footgun
   * note + correct mutation pattern. (Phase 72 audit C5.)
   */
  wordOrder: "SOV" | "SVO" | "VSO" | "VOS" | "OVS" | "OSV";
  affixPosition: "prefix" | "suffix";
  pluralMarking: "none" | "affix" | "reduplication";
  tenseMarking: "none" | "past" | "future" | "both";
  hasCase: boolean;
  genderCount: 0 | 2 | 3;
  synthesisIndex?: number;
  fusionIndex?: number;
  morphologicalType?: "isolating" | "agglutinating" | "fusional" | "polysynthetic";
  // Phase 39j: extended with "prefix-merged" (Arabic al-bayt) and
  // "suffix-merged" (Scandinavian huset). Existing "proclitic" /
  // "enclitic" stay for back-compat with adjacent-but-not-fused
  // attachment.
  articlePresence?: "none" | "free" | "enclitic" | "proclitic" | "prefix-merged" | "suffix-merged";
  /**
   * Phase 39k: numeral base. "decimal" (10/100), "vigesimal" (20-based,
   * Yoruba/Maya), "mixed-decimal-vigesimal" (French 70=soixante-dix,
   * 80=quatre-vingts), "subtractive-decimal" (Yoruba 45 = "five from
   * fifty"). Drift via grammaticalisation cascade.
   */
  numeralBase?: "decimal" | "vigesimal" | "mixed-decimal-vigesimal" | "subtractive-decimal";
  /**
   * Phase 39k: numeral order. "big-small" = English/Spanish/French
   * (fifty-five). "small-big" = German/Arabic/Dutch (five-and-fifty).
   */
  numeralOrder?: "big-small" | "small-big";
  /**
   * Phase 39i: existential strategy. "be-there" = English/Russian
   * (there is), "give-style" = German (es gibt), "have-style" =
   * French (il y a), "single-word" = Spanish hay, Italian c'è.
   */
  impersonalExistential?: "be-there" | "give-style" | "have-style" | "single-word";
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
  /**
   * Phase 64 T3: classifier table maps a noun's semantic class
   * (`human` / `animal` / `long_thin` / `flat` / `round` / `liquid`
   * / `vehicle` / `default`) to either a lexicon meaning string OR a
   * phoneme form to emit directly. The dual type lets languages store
   * classifiers either as proper words (looked up in the lexicon and
   * subject to evolution like any other lemma) OR as bound forms not
   * exposed in the open lexicon.
   */
  classifierTable?: Record<string, string | Phoneme[]>;
  relativeClauseStrategy?: "gap" | "resumptive" | "relativizer" | "internal-headed";
  serialVerbConstructions?: boolean;
  /**
   * Phase 36 Tranche 36k: politeness register.
   * - "none": no T-V or honorific marking.
   * - "binary" / "T-V": two-form pronoun system (tu/vous, tú/usted).
   * - "honorific": verbal honorific marking (Korean, Japanese).
   * - "tiered" / "stratal": full lexical-set substitution per register.
   */
  politenessRegister?: "none" | "binary" | "T-V" | "honorific" | "tiered" | "stratal";
  /**
   * Phase 36 Tranche 36j: switch-reference and logophoric pronoun
   * tracking. "switch-reference" marks SS/DS on the verb of a
   * subordinate clause (Pomo, Amele). "logophoric" distinguishes
   * he₁-said-he₁ from he₁-said-he₂ via a special pronoun (Ewe,
   * Yoruba). "both" enables both mechanisms.
   */
  referenceTracking?: "none" | "switch-reference" | "logophoric" | "both";
  /**
   * Phase 63: verb theme/citation markers. When present, the
   * inflector strips a matching theme from the verb's surface form
   * before appending tense/person/aspect/mood/voice paradigms. Models
   * fusional morphology where the dictionary form (e.g. Latin
   * "cantāre" with theme "-āre") is a derived shape whose theme is
   * dropped before tense+person are appended (cantāre → cant- → cantó
   * for Spanish 3sg.PST).
   *
   * Each entry is a phoneme sequence to match at the END of a verb's
   * lexicon form. The longest matching theme wins. The phonology
   * pipeline mutates these alongside the lexicon so a language that
   * starts with "-aɾe / -eɾe / -iɾe" will track its own sound changes
   * (rhotacism, vowel reduction, etc.) and continue to find the right
   * substring to strip.
   *
   * This is a general feature: any preset can declare initial themes,
   * and the simulator's grammaticalisation logic can introduce or
   * remove them as the language evolves.
   */
  verbThemes?: Phoneme[][];
  /**
   * Phase 73c Tier C Phase 1: language-declared grammaticalised
   * TAM/voice/evidentiality/case axes. When set, the
   * grammaticalisation driver (`maybeGrammaticalize`) skips pathway
   * targets whose axis-value isn't listed — so a language with
   * `aspect: ["pfv", "ipfv"]` never seeds `verb.aspect.prog` /
   * `.hab` / `.perf` / `.prosp` via the pathway map.
   *
   * Absent → no gating; legacy behaviour where every pathway target
   * can fire. Phase 4+ may auto-populate from existing flags via
   * `deriveGrammaticalisedAxes` (currently opt-in helper).
   */
  grammaticalisedAxes?: import("./morphology/types").GrammaticalisedAxes;
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
   * Phase 41a: declarative module set for the proto language.
   * Daughters inherit verbatim; runtime grammaticalisation can
   * activate / deactivate modules via the registry.
   * When omitted, languages run legacy flat-flag code paths
   * (the Phase 41-45 back-compat default).
   */
  seedActiveModules?: ReadonlyArray<string>;
  /**
   * Phase 48 T10: profile flag for languages whose rhotic is the
   * alveolar approximant ɹ rather than the trill r (English-style).
   * When true, the preset validator flags any seedLexicon entry
   * containing raw `r` as an IPA error.
   */
  rhoticApproximant?: boolean;
  /**
   * Phase 48 T10: profile flag for presets that use the
   * reconstruction-tradition notation for proto-languages (laryngeals
   * h₁/h₂/h₃ and triple-diacritic stops like gʲʰ). Required for PIE.
   * When false (default), the validator flags those phonemes as
   * outside standard IPA-2020.
   */
  reconstructionMode?: boolean;
  /**
   * Phase 39a: per-preset declared phoneme inventory target. When
   * absent, the simulator falls back to `seedLexicon`'s observed
   * inventory size or the tier-default. Real-language attestation
   * spans Pirahã (~10) → !Xóõ (~130); presets should declare a
   * target that matches the language family they're modelling.
   */
  seedPhonemeTarget?: number;
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
  /**
   * Phase 36 Tranche 36f: bound-morpheme set. At language birth the
   * preset hands a Set of meanings that are bound morphemes (e.g.,
   * `-er.agt`, `-ness`) so the lexicon UI / translator skip them
   * as standalone surface words. The forms still live in
   * `seedLexicon` and evolve under sound change.
   */
  seedBoundMorphemes?: ReadonlySet<Meaning>;
  /**
   * Phase 73e: preset-declared colexifications — concepts that share a
   * single lexeme in this language. Maps a "winner" meaning (whose form is
   * used) to the meanings it absorbs. Recorded on `colexifiedAs` at language
   * birth; the lookup cascade's reverse-colex rung resolves an absorbed
   * meaning to the winner's form. Lets presets carve the concept space the
   * way the language actually does (e.g. Bantu arm=hand, many languages
   * finger=toe) instead of mirroring the English seed inventory.
   * Example: `seedColexification: { hand: ["arm"] }`.
   */
  seedColexification?: Record<Meaning, Meaning[]>;
  /**
   * Phase 36 Tranche 36b: opt the proto language into a Bantu-style
   * noun-class system. When true, `assignAllNounClasses` runs at
   * language birth and the realiser inflects every noun with its
   * class prefix and drives verb-class agreement.
   */
  seedNounClassSystem?: boolean;
  /**
   * Phase 40d: per-preset rule-weight priors. At language birth,
   * each entry multiplies the catalog default for that rule. Daughter
   * languages inherit and the weights drift naturally over time;
   * this is a soft prior, not a cap. Used to bias families away from
   * typologically-marked rules (e.g., PIE descendants away from
   * `fortition.initial_aspiration`) and toward attested ones.
   */
  seedRuleBias?: Record<string, number>;
  /**
   * Phase 36 Tranche 36o: declarative tone-sandhi rule selection. Set
   * by tonal presets (e.g., Bantu's ["meeussen","spread"]) to filter
   * which sandhi rules can fire on the proto language. Daughter
   * languages inherit unless overridden.
   */
  seedToneSandhiRules?: ReadonlyArray<"meeussen" | "dissimilate" | "spread" | "downstep">;
  /**
   * Phase 72b T2: language-specific closed-class anchor list. Populated
   * into `lang.closedClassInventory` at init. The phonology brake
   * (apply.ts) only dampens drift on lemmas in this set. Undefined →
   * use the universal English-shaped default (CLOSED_CLASS_DEFAULT in
   * apply.ts). Romance / Germanic / Bantu / etc. should each declare
   * their own closed-class inventory matching the typology.
   */
  seedClosedClassInventory?: ReadonlySet<string>;
  useWorker?: boolean;
  preset?: string;
  evolutionSpeed?: string;
  mapMode?: "random" | "earth";
  originCellId?: number;
  /**
   * Phase 70 T1: Historical Mode (HOI4-style soft-railroad). When
   * `scheduleId` is set and matches a registered `HistoricalSchedule`
   * whose `presetId` matches `preset`, the engine consults the schedule
   * each generation and applies scheduled rate / bias / split nudges.
   * Undefined = mode off; the historical step is skipped entirely
   * (zero RNG draws, preserves existing-run determinism).
   */
  historical?: {
    scheduleId?: string;
    /** Multiplier applied to every nudge. Default 1.0; 0 fully disables. */
    intensity?: number;
  };
}

export interface PendingArealRule {
  rule: import("./phonology/generated").GeneratedRule;
  donorId: string;
  donorCoords: { x: number; y: number };
  birthGeneration: number;
}

/**
 * Phase 72g T2: reticulate (horizontal) link between two languages.
 * Records sustained contact relationships beyond the strict cladistic
 * parent / child / sibling structure of `state.tree`. Symmetric:
 * contactLinks are undirected; (langA, langB) and (langB, langA) are
 * the same link.
 */
export interface ReticulateLink {
  langA: string;
  langB: string;
  /**
   * Categorical contact kind. Phase 72g initial scope: only
   * "bilingual" is currently set (by `refreshContactLinks` from
   * `lang.bilingualLinks`). The audit envisioned upgrading specific
   * pairs to "areal" / "creolisation" / "substrate" via dedicated
   * hooks in `arealTypology.ts` / `creolization.ts` / contact
   * substrate detection. Those hooks are documented as future work
   * (see CHANGELOG defer-3 + `docs/LANGUAGE_DOMAINS.md`). For now the
   * enum is restricted to "bilingual" so consumers don't pattern-
   * match against values that are never emitted. Phase 72 code-
   * review fix A4.
   */
  kind: "bilingual";
  /** Strength on [0, 1]; mirrors bilingualLinks scoring. */
  strength: number;
  /** First gen when this link was observed. */
  firstSeenGen: number;
  /** Last gen when this link was observed (refreshed each gen it persists). */
  lastSeenGen: number;
}

export interface SimulationState {
  generation: number;
  tree: LanguageTree;
  rootId: string;
  rngState: number;
  pendingArealRules?: PendingArealRule[];
  generationsOverCap?: number;
  /**
   * Phase 72g T2: reticulate (network) tree links. The simulator's
   * primary topology is a strict cladistic tree (LanguageNode.parentId
   * → single parent). Real linguistic history has horizontal
   * connections — dialect continua, areal Sprachbund (Balkan, SE Asia,
   * Mainland Africa), creolisation. Pre-72g these were modeled
   * indirectly via `bilingualLinks` (per-language partner-strength map)
   * with no global topology.
   *
   * Post-72g, `state.contactLinks` is a global, undirected list of
   * (langA, langB, kind, strength) tuples. The existing bilingualLinks
   * remain (per-language partner cache); reticulate links are higher-
   * level, persistent contact relationships consumed by:
   *   - reconstruction probes (skip horizontal links to follow only
   *     phylogeny);
   *   - structural / areal borrowing helpers (this list is the
   *     authoritative network topology).
   *
   * Pre-72g any consumer that needed contact topology had to scan
   * every leaf's bilingualLinks. This list is populated/refreshed by
   * `src/engine/contact/reticulate.ts` once per gen.
   */
  contactLinks?: ReticulateLink[];
  /**
   * Phase 70 T1: Historical Mode idempotency tracker. Each milestone
   * key (`${atGen}:${kind}:${role}:${label}`) is appended once when it
   * fires; the runner skips already-keyed milestones on re-evaluation.
   * Undefined when Historical Mode is off — no allocation overhead.
   */
  firedHistoricalMilestones?: string[];
  /**
   * Phase 70 T1: counter for milestones that targeted an extinct or
   * missing role-bearer and were skipped silently. Surfaced in probes
   * to detect schedules that consistently miss their targets.
   */
  historicalMilestonesSkipped?: number;
  /**
   * Phase 70 T1: state-level historical milestone log. Survives the
   * per-language `MAX_EVENTS_PER_LANGUAGE = 80` cap. The UI (T3+)
   * reads from here to draw TimelineChart markers and EventsLog
   * filter chips that don't drop after long runs. Append-only.
   */
  historicalEvents?: Array<{
    generation: number;
    label: string;
    role: string;
    kind: "fired" | "skipped";
    reason?: string;
  }>;
}

export interface SavedRun {
  version: 10;
  id: string;
  label: string;
  createdAt: number;
  config: SimulationConfig;
  generationsRun: number;
  stateSnapshot?: SimulationState;
}
