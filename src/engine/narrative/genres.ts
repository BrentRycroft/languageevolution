import type { Meaning } from "../types";
import type { DiscourseGenre } from "./discourse";

export interface GenreTemplate {
  english: string;
  needs: {
    subject: boolean;
    object: boolean;
    adjective: boolean;
    time: boolean;
    place: boolean;
  };
  introducesEntity?: boolean;
  topicSubject?: boolean;
  tense?: "past" | "present" | "future";
}

export const PAST_TENSE_VERB: Record<string, string> = {
  go: "went", come: "came", see: "saw", know: "knew",
  eat: "ate", drink: "drank", give: "gave", take: "took",
  speak: "spoke", hold: "held", fight: "fought",
  make: "made", break: "broke", fall: "fell",
  sleep: "slept", die: "died",
  run: "ran", walk: "walked", fly: "flew",
  hear: "heard", think: "thought", say: "said",
  call: "called", ask: "asked", carry: "carried",
  throw: "threw", pull: "pulled", push: "pushed",
  cut: "cut", bend: "bent", build: "built",
  burn: "burned", wash: "washed", weave: "wove",
  sit: "sat", stand: "stood", lie: "lay",
  swim: "swam", live: "lived", grow: "grew",
  love: "loved", fear: "feared",
};

export function futureForm(verb: string): string {
  return `will ${verb}`;
}

export function pastForm(verb: string): string {
  return PAST_TENSE_VERB[verb] ?? `${verb}ed`;
}

const MYTH_TEMPLATES: GenreTemplate[] = [
  { english: "long ago the {S} {V} the {O}.", needs: { subject: true, object: true, adjective: false, time: false, place: false }, introducesEntity: true, tense: "past" },
  { english: "in the {TIME} the {S} {V}.", needs: { subject: true, object: false, adjective: false, time: true, place: false }, introducesEntity: true, tense: "past" },
  { english: "the {ADJ} {S} {V} the {O}.", needs: { subject: true, object: true, adjective: true, time: false, place: false }, introducesEntity: true, tense: "past" },
  { english: "{TOPIC} {V} the {O}.", needs: { subject: false, object: true, adjective: false, time: false, place: false }, topicSubject: true, tense: "past" },
  { english: "{TOPIC} {V}.", needs: { subject: false, object: false, adjective: false, time: false, place: false }, topicSubject: true, tense: "past" },
  { english: "the {S} {V} {PLACE}.", needs: { subject: true, object: false, adjective: false, time: false, place: true }, introducesEntity: true, tense: "past" },
  { english: "long ago the {S} {V} the {ADJ} {O}.", needs: { subject: true, object: true, adjective: true, time: false, place: false }, introducesEntity: true, tense: "past" },
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

export const SUBJECT_NOUN_POOL: readonly Meaning[] = [
  "mother", "father", "child", "brother", "sister", "friend", "king",
  "dog", "wolf", "horse", "bear",
  "warrior", "stranger",
];

export const OBJECT_NOUN_POOL: readonly Meaning[] = [
  "hand", "foot", "eye", "head", "heart",
  "tree", "water", "fire", "stone", "moon", "sun", "river", "house",
  "bread", "meat", "milk",
];

export const TRANSITIVE_VERB_POOL: readonly Meaning[] = [
  "see", "know", "eat", "drink", "give", "take", "speak",
  "hold", "fight", "make", "break",
];

export const INTRANSITIVE_VERB_POOL: readonly Meaning[] = [
  "go", "come", "fall", "sleep", "die", "run", "walk", "fly",
];

export const VERB_POOL: readonly Meaning[] = [
  ...TRANSITIVE_VERB_POOL,
  ...INTRANSITIVE_VERB_POOL,
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
