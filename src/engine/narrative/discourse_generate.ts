import type { Language, Meaning } from "../types";
import { makeRng, type Rng } from "../rng";
import { type DisplayScript } from "../phonology/display";
import {
  SUBJECT_NOUN_POOL,
  OBJECT_NOUN_POOL,
  TRANSITIVE_VERB_POOL,
  INTRANSITIVE_VERB_POOL,
  VERB_POOL,
  ADJECTIVE_POOL,
  TIME_POOL,
  PLACE_POOL,
  templatesFor,
} from "./genres";
import {
  endTurn,
  makeDiscourse,
  mention,
  type DiscourseContext,
  type DiscourseGenre,
} from "./discourse";
import {
  composeTargetSentence,
  type AbstractTemplate,
  type SlotAssignment,
} from "./composer";

export interface DiscourseLine {
  english: string;
  text: string;
  gloss: string;
}

function pick<T>(pool: readonly T[], rng: Rng): T {
  return pool[rng.int(pool.length)]!;
}

function pickTemplate(
  genre: DiscourseGenre,
  ctx: DiscourseContext,
  rng: Rng,
): AbstractTemplate {
  const all = templatesFor(genre);
  const introducing = all.filter((t) => t.introducesEntity);
  const continuing = all.filter((t) => t.topicSubject);
  if (ctx.turnIndex === 0 || !ctx.topic) return pick(introducing, rng);
  return rng.next() < 0.6 ? pick(continuing, rng) : pick(introducing, rng);
}

function fillSlots(template: AbstractTemplate, rng: Rng): SlotAssignment {
  const verbPool = template.needs.object
    ? TRANSITIVE_VERB_POOL
    : INTRANSITIVE_VERB_POOL.length > 0
      ? INTRANSITIVE_VERB_POOL
      : VERB_POOL;
  const slots: SlotAssignment = {
    verb: pick(verbPool, rng),
  };
  if (template.needs.subject) slots.subject = pick(SUBJECT_NOUN_POOL, rng);
  if (template.needs.object) slots.object = pick(OBJECT_NOUN_POOL, rng);
  if (template.needs.adjective) slots.adjective = pick(ADJECTIVE_POOL, rng);
  if (template.needs.time) slots.time = pick(TIME_POOL, rng);
  if (template.needs.place) slots.place = pick(PLACE_POOL, rng);
  return slots;
}

function morphologicalGloss(tokens: { englishLemma: string; glossNote: string }[]): string {
  return tokens
    .map((t) => (t.glossNote ? `${t.englishLemma}.${t.glossNote.replace(/,/g, ".")}` : t.englishLemma))
    .filter((s) => s !== "?")
    .join("—");
}

export function generateDiscourseNarrative(
  lang: Language,
  seedStr: string,
  options: {
    lines?: number;
    genre?: DiscourseGenre;
    script?: DisplayScript;
  } = {},
): DiscourseLine[] {
  const lines = options.lines ?? 5;
  const script: DisplayScript = options.script ?? "ipa";
  const genre = options.genre ?? "myth";
  const rng = makeRng(`narrative.${seedStr}.${genre}`);
  const ctx = makeDiscourse(genre);
  const out: DiscourseLine[] = [];

  for (let i = 0; i < lines; i++) {
    const template = pickTemplate(genre, ctx, rng);
    const slots = fillSlots(template, rng);

    if (template.needs.subject && slots.subject) {
      mention(ctx, slots.subject as Meaning);
    }
    if (template.needs.object && slots.object) {
      const objMeaning = slots.object as Meaning;
      const wasNew = !ctx.entities.has(objMeaning);
      mention(ctx, objMeaning);
      if (!template.needs.subject && wasNew) ctx.topic = ctx.entities.get(objMeaning)!;
    }

    const composed = composeTargetSentence(lang, template, slots, ctx, script);
    if (composed.tokens.length === 0) {
      endTurn(ctx);
      continue;
    }

    out.push({
      english: composed.english,
      text: composed.surface,
      gloss: morphologicalGloss(composed.tokens),
    });
    endTurn(ctx);
  }

  return out;
}
