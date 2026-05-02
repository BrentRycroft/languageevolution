import type { Meaning } from "../types";
import type { DiscourseGenre } from "./discourse";
import type { AbstractTemplate } from "./composer";

const MYTH_TEMPLATES: AbstractTemplate[] = [
  { shape: "long_ago_trans",     tense: "past",   needs: { subject: true,  object: true,  adjective: false, time: false, place: false }, introducesEntity: true },
  { shape: "time_prefix_intrans", tense: "past",  needs: { subject: true,  object: false, adjective: false, time: true,  place: false }, introducesEntity: true },
  { shape: "transitive_adj",     tense: "past",   needs: { subject: true,  object: true,  adjective: true,  time: false, place: false }, introducesEntity: true },
  { shape: "topic_trans",        tense: "past",   needs: { subject: false, object: true,  adjective: false, time: false, place: false }, topicSubject: true },
  { shape: "topic_intrans",      tense: "past",   needs: { subject: false, object: false, adjective: false, time: false, place: false }, topicSubject: true },
  { shape: "place_intrans",      tense: "past",   needs: { subject: true,  object: false, adjective: false, time: false, place: true  }, introducesEntity: true },
  { shape: "long_ago_trans_adj", tense: "past",   needs: { subject: true,  object: true,  adjective: true,  time: false, place: false }, introducesEntity: true },
  { shape: "transitive",         tense: "future", needs: { subject: true,  object: true,  adjective: false, time: false, place: false }, introducesEntity: true },
];

const LEGEND_TEMPLATES: AbstractTemplate[] = [
  { shape: "transitive",     tense: "past",   needs: { subject: true,  object: true,  adjective: false, time: false, place: false }, introducesEntity: true },
  { shape: "transitive_adj", tense: "past",   needs: { subject: true,  object: true,  adjective: true,  time: false, place: false }, introducesEntity: true },
  { shape: "topic_trans",    tense: "past",   needs: { subject: false, object: true,  adjective: false, time: false, place: false }, topicSubject: true },
  { shape: "place_intrans",  tense: "past",   needs: { subject: true,  object: false, adjective: false, time: false, place: true  }, introducesEntity: true },
  { shape: "adj_subject",    tense: "past",   needs: { subject: true,  object: false, adjective: true,  time: false, place: false }, introducesEntity: true },
  { shape: "topic_intrans",  tense: "past",   needs: { subject: false, object: false, adjective: false, time: false, place: false }, topicSubject: true },
];

const DAILY_TEMPLATES: AbstractTemplate[] = [
  { shape: "intransitive",        tense: "present", needs: { subject: true,  object: false, adjective: false, time: false, place: false }, introducesEntity: true },
  { shape: "transitive",          tense: "present", needs: { subject: true,  object: true,  adjective: false, time: false, place: false }, introducesEntity: true },
  { shape: "topic_time_intrans",  tense: "present", needs: { subject: false, object: false, adjective: false, time: true,  place: false }, topicSubject: true },
  { shape: "topic_trans",         tense: "present", needs: { subject: false, object: true,  adjective: false, time: false, place: false }, topicSubject: true },
  { shape: "place_intrans",       tense: "present", needs: { subject: true,  object: false, adjective: false, time: false, place: true  }, introducesEntity: true },
  { shape: "intransitive",        tense: "future",  needs: { subject: true,  object: false, adjective: false, time: false, place: false }, introducesEntity: true },
];

const DIALOGUE_TEMPLATES: AbstractTemplate[] = [
  { shape: "transitive",     tense: "present", needs: { subject: true,  object: true,  adjective: false, time: false, place: false }, introducesEntity: true },
  { shape: "topic_intrans",  tense: "present", needs: { subject: false, object: false, adjective: false, time: false, place: false }, topicSubject: true },
  { shape: "transitive_adj", tense: "past",    needs: { subject: true,  object: true,  adjective: true,  time: false, place: false }, introducesEntity: true },
  { shape: "topic_trans",    tense: "future",  needs: { subject: false, object: true,  adjective: false, time: false, place: false }, topicSubject: true },
];

export function templatesFor(genre: DiscourseGenre): readonly AbstractTemplate[] {
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
