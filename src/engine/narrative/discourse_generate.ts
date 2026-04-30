import type { Language } from "../types";
import { makeRng, type Rng } from "../rng";
import { translateSentence } from "../translator/sentence";
import { formatForm, type DisplayScript } from "../phonology/display";
import {
  SUBJECT_NOUN_POOL,
  OBJECT_NOUN_POOL,
  VERB_POOL,
  TRANSITIVE_VERB_POOL,
  INTRANSITIVE_VERB_POOL,
  ADJECTIVE_POOL,
  TIME_POOL,
  PLACE_POOL,
  templatesFor,
  pastForm,
  futureForm,
  type GenreTemplate,
} from "./genres";
import {
  endTurn,
  makeDiscourse,
  mention,
  type DiscourseContext,
  type DiscourseGenre,
} from "./discourse";
import type { Meaning } from "../types";

export interface DiscourseLine {
  english: string;
  text: string;
  gloss: string;
}

function pick<T>(pool: readonly T[], rng: Rng): T {
  return pool[rng.int(pool.length)]!;
}

function fillTemplate(
  template: GenreTemplate,
  ctx: DiscourseContext,
  rng: Rng,
): { english: string; openClassSlots: Meaning[] } {
  const slots: Meaning[] = [];
  let english = template.english;

  if (template.topicSubject && ctx.topic) {
    english = english.replace("{TOPIC}", ctx.topic.pronoun);
  }

  if (template.needs.subject) {
    const s = pick(SUBJECT_NOUN_POOL, rng);
    english = english.replace("{S}", s);
    slots.push(s);
  }
  if (template.needs.object) {
    const o = pick(OBJECT_NOUN_POOL, rng);
    english = english.replace("{O}", o);
    slots.push(o);
  }
  if (template.needs.adjective) {
    const a = pick(ADJECTIVE_POOL, rng);
    english = english.replace("{ADJ}", a);
  }
  if (template.needs.time) {
    const t = pick(TIME_POOL, rng);
    english = english.replace("{TIME}", t);
  }
  if (template.needs.place) {
    const p = pick(PLACE_POOL, rng);
    english = english.replace("{PLACE}", `at the ${p}`);
    slots.push(p);
  }

  const verbPool = template.needs.object
    ? TRANSITIVE_VERB_POOL
    : INTRANSITIVE_VERB_POOL.length > 0
      ? INTRANSITIVE_VERB_POOL
      : VERB_POOL;
  const verb = pick(verbPool, rng);
  const tense = template.tense ?? "present";
  const surfaceVerb =
    tense === "past" ? pastForm(verb) :
    tense === "future" ? futureForm(verb) :
    verb;
  english = english.replace("{V}", surfaceVerb);
  return { english, openClassSlots: slots };
}

function pickTemplate(
  genre: DiscourseGenre,
  ctx: DiscourseContext,
  rng: Rng,
): GenreTemplate {
  const all = templatesFor(genre);
  const introducing = all.filter((t) => t.introducesEntity);
  const continuing = all.filter((t) => t.topicSubject);
  if (ctx.turnIndex === 0 || !ctx.topic) return pick(introducing, rng);
  return rng.next() < 0.6 ? pick(continuing, rng) : pick(introducing, rng);
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
    const { english, openClassSlots } = fillTemplate(template, ctx, rng);

    if (template.needs.subject && openClassSlots[0]) {
      mention(ctx, openClassSlots[0]);
    }
    if (template.needs.object && openClassSlots[template.needs.subject ? 1 : 0]) {
      const objMeaning = openClassSlots[template.needs.subject ? 1 : 0]!;
      const wasNew = !ctx.entities.has(objMeaning);
      mention(ctx, objMeaning);
      if (!template.needs.subject && wasNew) ctx.topic = ctx.entities.get(objMeaning)!;
    }
    const tx = translateSentence(lang, english);
    const renderToken = (t: typeof tx.targetTokens[number]): string => {
      const surf = t.targetSurface;
      if (!surf) return "";
      if (t.targetForm && t.targetForm.length > 0 && surf !== `“${t.englishLemma}”` && surf !== "?") {
        return formatForm(t.targetForm, lang, script);
      }
      return surf;
    };
    const text = tx.targetTokens.map(renderToken).filter((s) => s.length > 0).join(" ");
    const gloss = tx.targetTokens
      .map((t) => `${renderToken(t) || "·"}[${t.englishLemma}${t.glossNote ? ":" + t.glossNote : ""}]`)
      .join(" ");

    out.push({ english, text, gloss });
    endTurn(ctx);
  }

  return out;
}
