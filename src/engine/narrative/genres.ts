import type { Meaning } from "../types";
import type { DiscourseGenre } from "./discourse";

/**
 * Genre-specific template pools. Each template names the slot kinds it
 * needs; the planner fills them with concrete meanings (open-class) or
 * placeholder tokens that the generator resolves contextually:
 *
 *   {S}            — fresh subject NP (introduces an entity)
 *   {S=topic}      — refer back to the current topic via pronoun
 *   {O}            — fresh object NP
 *   {O=topic}      — refer back to topic as object
 *   {V}            — verb
 *   {ADJ}          — modifier on the next noun
 *   {TIME}         — time-of-day / season prefix word
 *   {PLACE}        — locative prepositional phrase
 *   {NEG}          — sentence is negated
 *
 * Genres bias which templates surface, giving narrative texture without
 * any AI: myths read different from daily life, and dialogue alternates
 * between two voices.
 */

export interface GenreTemplate {
  /** Canonical English realisation — used as input to translateSentence
   *  so the language's grammar features, articles, prepositions,
   *  agreement, etc. all kick in for free. */
  english: string;
  /** Slot count by kind, so the planner can pre-fill before realisation. */
  needs: {
    subject: boolean;
    object: boolean;
    adjective: boolean;
    time: boolean;
    place: boolean;
  };
  /** True when the template naturally introduces a NEW entity (vs.
   *  refers back to the topic). Used by the planner to alternate. */
  introducesEntity?: boolean;
  /** True when the subject should be the current topic (for pronoun
   *  substitution). */
  topicSubject?: boolean;
  /** Tense the {V} slot should be realised in. Default: "present".
   *  Myth + legend default to past so the narratives read like real
   *  folk tales ("long ago the king fought the wolf"); dialogue mixes
   *  tenses for naturalism. */
  tense?: "past" | "present" | "future";
}

/**
 * Verb-pool mapped to past-tense surface forms. The translator's
 * tokeniser already recognises these via IRREGULAR_VERBS or -ed
 * stripping, so emitting "saw" instead of "see" gives the realiser
 * a tense=past hint without us having to bypass tokenisation.
 */
export const PAST_TENSE_VERB: Record<string, string> = {
  go: "went", come: "came", see: "saw", know: "knew",
  eat: "ate", drink: "drank", give: "gave", take: "took",
  speak: "spoke", hold: "held", fight: "fought",
  make: "made", break: "broke", fall: "fell",
  sleep: "slept", die: "died",
  run: "ran", walk: "walked", fly: "flew",
};

/**
 * Future-tense rendering: prepend the auxiliary "will" so the tokeniser
 * tags the verb as future. This works for every bare verb in the pool.
 */
export function futureForm(verb: string): string {
  return `will ${verb}`;
}

export function pastForm(verb: string): string {
  return PAST_TENSE_VERB[verb] ?? `${verb}ed`;
}

// Myth & legend default to past tense — folk-tale register. Daily &
// dialogue default to present. {V}.past / {V}.fut placeholders force a
// non-default tense on a particular line so the texture varies.
const MYTH_TEMPLATES: GenreTemplate[] = [
  { english: "long ago the {S} {V} the {O}.", needs: { subject: true, object: true, adjective: false, time: false, place: false }, introducesEntity: true, tense: "past" },
  { english: "in the {TIME} the {S} {V}.", needs: { subject: true, object: false, adjective: false, time: true, place: false }, introducesEntity: true, tense: "past" },
  { english: "the {ADJ} {S} {V} the {O}.", needs: { subject: true, object: true, adjective: true, time: false, place: false }, introducesEntity: true, tense: "past" },
  { english: "{TOPIC} {V} the {O}.", needs: { subject: false, object: true, adjective: false, time: false, place: false }, topicSubject: true, tense: "past" },
  { english: "{TOPIC} {V}.", needs: { subject: false, object: false, adjective: false, time: false, place: false }, topicSubject: true, tense: "past" },
  { english: "the {S} {V} {PLACE}.", needs: { subject: true, object: false, adjective: false, time: false, place: true }, introducesEntity: true, tense: "past" },
  { english: "long ago the {S} {V} the {ADJ} {O}.", needs: { subject: true, object: true, adjective: true, time: false, place: false }, introducesEntity: true, tense: "past" },
  // One forward-looking line so the genre isn't entirely past.
  { english: "the {S} {V} the {O}.", needs: { subject: true, object: true, adjective: false, time: false, place: false }, introducesEntity: true, tense: "future" },
];

const LEGEND_TEMPLATES: GenreTemplate[] = [
  { english: "the {S} {V} the {O}.", needs: { subject: true, object: true, adjective: false, time: false, place: false }, introducesEntity: true, tense: "past" },
  { english: "the {S} {V} the {ADJ} {O}.", needs: { subject: true, object: true, adjective: true, time: false, place: false }, introducesEntity: true, tense: "past" },
  { english: "{TOPIC} {V} the {O}.", needs: { subject: false, object: true, adjective: false, time: false, place: false }, topicSubject: true, tense: "past" },
  { english: "the {S} {V} {PLACE}.", needs: { subject: true, object: false, adjective: false, time: false, place: true }, introducesEntity: true, tense: "past" },
  { english: "the {ADJ} {S} {V}.", needs: { subject: true, object: false, adjective: true, time: false, place: false }, introducesEntity: true, tense: "past" },
  { english: "{TOPIC} {V}.", needs: { subject: false, object: false, adjective: false, time: false, place: false }, topicSubject: true, tense: "past" },
];

const DAILY_TEMPLATES: GenreTemplate[] = [
  { english: "the {S} {V}.", needs: { subject: true, object: false, adjective: false, time: false, place: false }, introducesEntity: true, tense: "present" },
  { english: "the {S} {V} the {O}.", needs: { subject: true, object: true, adjective: false, time: false, place: false }, introducesEntity: true, tense: "present" },
  { english: "in the {TIME} {TOPIC} {V}.", needs: { subject: false, object: false, adjective: false, time: true, place: false }, topicSubject: true, tense: "present" },
  { english: "{TOPIC} {V} the {O}.", needs: { subject: false, object: true, adjective: false, time: false, place: false }, topicSubject: true, tense: "present" },
  { english: "the {S} {V} {PLACE}.", needs: { subject: true, object: false, adjective: false, time: false, place: true }, introducesEntity: true, tense: "present" },
  // A future-tense line for variety: planning, anticipation.
  { english: "the {S} {V}.", needs: { subject: true, object: false, adjective: false, time: false, place: false }, introducesEntity: true, tense: "future" },
];

const DIALOGUE_TEMPLATES: GenreTemplate[] = [
  { english: "the {S} {V} the {O}.", needs: { subject: true, object: true, adjective: false, time: false, place: false }, introducesEntity: true, tense: "present" },
  { english: "{TOPIC} {V}.", needs: { subject: false, object: false, adjective: false, time: false, place: false }, topicSubject: true, tense: "present" },
  { english: "the {S} {V} the {ADJ} {O}.", needs: { subject: true, object: true, adjective: true, time: false, place: false }, introducesEntity: true, tense: "past" },
  { english: "{TOPIC} {V} the {O}.", needs: { subject: false, object: true, adjective: false, time: false, place: false }, topicSubject: true, tense: "future" },
];

export function templatesFor(genre: DiscourseGenre): readonly GenreTemplate[] {
  switch (genre) {
    case "myth":     return MYTH_TEMPLATES;
    case "legend":   return LEGEND_TEMPLATES;
    case "daily":    return DAILY_TEMPLATES;
    case "dialogue": return DIALOGUE_TEMPLATES;
  }
}

// ---------------------------------------------------------------------------
// Slot pools
// ---------------------------------------------------------------------------

export const SUBJECT_NOUN_POOL: readonly Meaning[] = [
  // kinship
  "mother", "father", "child", "brother", "sister", "friend", "king",
  // animals
  "dog", "wolf", "horse", "bear",
  // social
  "warrior", "stranger",
];

export const OBJECT_NOUN_POOL: readonly Meaning[] = [
  // body
  "hand", "foot", "eye", "head", "heart",
  // environment
  "tree", "water", "fire", "stone", "moon", "sun", "river", "house",
  // food
  "bread", "meat", "milk",
];

export const VERB_POOL: readonly Meaning[] = [
  "go", "come", "see", "know", "eat", "drink", "give", "take", "speak",
  "hold", "fight", "make", "break", "fall", "sleep", "die", "run",
  "walk", "fly",
];

export const ADJECTIVE_POOL: readonly Meaning[] = [
  "big", "small", "new", "old", "good", "bad", "tall", "short",
];

export const TIME_POOL: readonly Meaning[] = [
  "morning", "evening", "night", "winter", "summer",
];

export const PLACE_POOL: readonly Meaning[] = [
  "river", "forest", "mountain", "village", "house",
];
