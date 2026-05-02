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
import {
  subjectPool,
  objectPool,
  verbPool,
  adjectivePool,
  timePool,
  placePool,
  pickWeighted,
} from "./pools";

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

/**
 * Slot filler — picks from the language's actual lexicon (frequency-
 * weighted) when it's rich enough, falls back to the small genre pools
 * when the language is sparse. Sparse-language fallback ensures narratives
 * still render for fresh proto-languages with <50 words.
 */
function fillSlots(
  template: AbstractTemplate,
  lang: Language,
  rng: Rng,
): SlotAssignment {
  const subjectsLex = subjectPool(lang);
  const objectsLex = objectPool(lang);
  const verbsLex = verbPool(lang);
  const adjsLex = adjectivePool(lang);
  const timesLex = timePool(lang);
  const placesLex = placePool(lang);

  // Need at least ~6 entries to weight-sample meaningfully; otherwise fall
  // back to the legacy hand-picked pool.
  const subjects = subjectsLex.length >= 6 ? subjectsLex : SUBJECT_NOUN_POOL.slice();
  const objects = objectsLex.length >= 6 ? objectsLex : OBJECT_NOUN_POOL.slice();
  const adjs = adjsLex.length >= 4 ? adjsLex : ADJECTIVE_POOL.slice();
  const times = timesLex.length >= 2 ? timesLex : TIME_POOL.slice();
  const places = placesLex.length >= 2 ? placesLex : PLACE_POOL.slice();

  // For verbs, transitive vs intransitive split is hard to derive from POS
  // alone; keep the legacy hand-picked verb pool as the source of truth
  // for the trans/intrans distinction, but extend with all lexicon verbs
  // as a last-resort fallback.
  const verbPoolForTemplate = template.needs.object
    ? TRANSITIVE_VERB_POOL
    : INTRANSITIVE_VERB_POOL.length > 0
      ? INTRANSITIVE_VERB_POOL
      : VERB_POOL;
  const verbs =
    verbPoolForTemplate.length > 0 ? verbPoolForTemplate.slice() : verbsLex;

  const slots: SlotAssignment = {
    verb: pickWeighted(lang, verbs, rng) ?? pick(verbs, rng),
  };
  if (template.needs.subject) {
    slots.subject =
      pickWeighted(lang, subjects, rng) ?? pick(subjects, rng);
  }
  if (template.needs.object) {
    slots.object =
      pickWeighted(lang, objects, rng) ?? pick(objects, rng);
  }
  if (template.needs.adjective) {
    slots.adjective = pickWeighted(lang, adjs, rng) ?? pick(adjs, rng);
  }
  if (template.needs.time) {
    slots.time = pickWeighted(lang, times, rng) ?? pick(times, rng);
  }
  if (template.needs.place) {
    slots.place = pickWeighted(lang, places, rng) ?? pick(places, rng);
  }
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
    const slots = fillSlots(template, lang, rng);

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
