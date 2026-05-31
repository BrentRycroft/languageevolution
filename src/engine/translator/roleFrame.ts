/**
 * roleFrame.ts — Tier C Phase 0 (Phase 73c).
 *
 * Participant-role IR types introduced ALONGSIDE the legacy
 * `Sentence`/`NP`/`VP` shapes in `syntax.ts`. Pure scaffolding —
 * no call site constructs or consumes these yet. They land here
 * so Phase 2 (composer emits RoleClause), Phase 3 (parser emits
 * RoleClause via extended AST bridge), and Phase 4 (realiser
 * consumes RoleClause) have stable type targets.
 *
 * Design choice: a clause is a predicate + an unordered set of
 * participants, each tagged with a semantic role. Surface word
 * order is the realiser's job, not the IR's. This is the
 * structural break from `Sentence`, where slot positions
 * (subject/object) embed an English parse-tree assumption.
 *
 * Structural relations the legacy AST IR couldn't express
 * (`coordinatedWith`, `embeddedIn`) are first-class fields rather
 * than feature flags, so the parser can preserve them through
 * the pipeline.
 */

import type {
  Aspect,
  Degree,
  Evidential,
  Mood,
  Number_,
  Person,
  Voice,
} from "./syntax";
export type { Degree };

/**
 * Semantic-role inventory. Drawn from canonical case-grammar /
 * thematic-role surveys (Fillmore, Dowty); kept small enough that
 * predicate `argFrame` slots can be hand-authored for high-
 * frequency verbs in Phase 5 without combinatoric explosion.
 *
 * "agent" + "patient" cover prototypical transitive predicates.
 * "experiencer" + "stimulus" cover psych-predicates (see, fear,
 * hear) where the English subject is NOT semantically the agent.
 * "theme" is the default core role for predicates without a
 * clear agent (fall, exist, die). Adjuncts use "instrument",
 * "location", "time", "manner".
 */
export type SemanticRole =
  | "agent"
  | "patient"
  | "theme"
  | "experiencer"
  | "stimulus"
  | "recipient"
  | "goal"
  | "source"
  | "instrument"
  | "location"
  | "time"
  | "manner";

/**
 * Participant-level feature bundle. Optional fields mirror the
 * subset of `NounRef` that survives the role-frame abstraction:
 * surface number/person, pronoun status, noun class. The legacy
 * `case` field is NOT carried here — case is assigned by the
 * realiser based on `role` + the language's declared alignment.
 */
export interface ParticipantFeatures {
  number?: Number_;
  person?: Person;
  isPronoun?: boolean;
  nounClass?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /**
   * Phase 3 internal flag: set when the parser synthesised this
   * participant (WH-subject fallback, imperative "you", RC
   * subject-gap fill-in). Used by `parseSyntaxAllAsClauses` to
   * track which subjects can be inherited from a preceding clause
   * in S-coordination. The realiser does NOT read this.
   */
  synthesized?: boolean;
}

/**
 * Internal participant modifiers. The legacy NP fields
 * (determiner, adjectives, possessor, numeral, pps, coord,
 * relative) map onto this union. Each modifier kind carries the
 * minimum information the realiser needs to surface it; richer
 * agreement / case / scope features are handled at realisation
 * time off the modifier's own structure.
 */
export type ParticipantModifier =
  | { kind: "determiner"; lemma: string }
  | { kind: "adjective"; lemma: string; degree?: Degree }
  | { kind: "possessor"; participant: Participant }
  | { kind: "numeral"; lemma: string; ordinal?: boolean }
  | { kind: "oblique"; relation: SemanticRole; participant: Participant; preposition?: string }
  | { kind: "coordination"; conjunction: string; participant: Participant }
  | { kind: "relative"; clause: RoleClause; relativiser?: string; subjectGap: boolean };

/**
 * Participant in a predicate's argument structure. The `role`
 * field is the IR's structural commitment — surface order +
 * case-marking are derived from `role` × language declarations
 * at realisation time.
 *
 * `adjunct: true` distinguishes oblique adjuncts (instrument,
 * location, time, manner — typically PP-shaped) from core
 * arguments (agent, patient, theme, experiencer, stimulus,
 * recipient, goal, source).
 */
export interface Participant {
  lemma: string;
  pos: "N" | "PRON";
  role: SemanticRole;
  features?: ParticipantFeatures;
  modifiers?: ParticipantModifier[];
  adjunct?: boolean;
  /**
   * Phase 3: original preposition lemma for adjunct participants.
   * Necessary because role-tag → preposition is not injective (`at`,
   * `in`, `on` all map to `location`), and byte-identity through
   * the `Sentence` adapter requires preserving the surface lemma.
   */
  preposition?: string;
}

/**
 * Predicate-level feature bundle. TAM + voice + evidentiality +
 * honorific dimensions. Tier C Phase 1 adds language-declared
 * `grammaticalisedAxes` to gate which dimensions actually surface
 * morphologically; an `aspect: "progressive"` here is a request
 * that the realiser honours only if the language declares it.
 */
export interface PredicateFeatures {
  tense?: "past" | "present" | "future";
  aspect?: Aspect;
  mood?: Mood;
  voice?: Voice;
  evidential?: Evidential;
  honorific?: boolean;
}

/**
 * Predicate (verbal head) descriptor. `argFrame` lists the
 * semantic roles the predicate's lexical entry licenses
 * (Phase 5 hand-authors this for high-frequency verbs;
 * absent → default frame inferred from POS + transitivity).
 */
export interface PredicateFrame {
  lemma: string;
  features?: PredicateFeatures;
  argFrame?: ReadonlyArray<SemanticRole>;
  /**
   * Phase 3: predicative complements for copular constructions
   * ("X is happy"). Each entry is a property attributed to the
   * subject; the realiser surfaces these per the language's
   * copular strategy. Attributive adjectives ("the big king")
   * stay on the participant via `ParticipantModifier.kind:
   * "adjective"`.
   */
  complement?: ReadonlyArray<{ lemma: string; degree?: Degree }>;
}

/**
 * Top-level clause IR. Replaces `Sentence` once Phase 4 lands.
 *
 * - `participants` is unordered; the realiser arranges per
 *   `lang.grammar.wordOrder`.
 * - `coordinatedWith` carries clause-level coordination
 *   ("X went and Y came") as a structural field rather than a
 *   feature flag.
 * - `embeddedIn` carries complementation, relativisation, and
 *   adverbial subordination as structural fields — replaces the
 *   legacy AST IR's "ride as feature flags" pattern for these
 *   constructs.
 */
export interface RoleClause {
  kind: "RoleClause";
  predicate: PredicateFrame;
  participants: Participant[];
  negated?: boolean;
  interrogative?: boolean;
  leadingConj?: { lemma: string };
  leadingWh?: { lemma: string };
  coordinatedWith?: RoleClause;
  embeddedIn?: {
    matrix: RoleClause;
    relation: "complement" | "relative" | "adverbial";
  };
}
