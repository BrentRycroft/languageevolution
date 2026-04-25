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
  shouldPronominalise,
  type DiscourseContext,
  type DiscourseGenre,
} from "./discourse";
import type { Meaning } from "../types";

/**
 * §2.2 narrative generator: discourse-coherent, multi-line stories
 * realised through the §2.1 tree translator.
 *
 * Pipeline per line:
 *   1. Pick a template from the genre pool, alternating between
 *      `introducesEntity` (fresh subject) and `topicSubject` (refers
 *      back via pronoun) so the narrative has rhythm.
 *   2. Fill open-class slots from the noun/verb/adjective pools.
 *   3. Substitute the {TOPIC} placeholder with the appropriate pronoun
 *      from the discourse state (he/she/it/they).
 *   4. Run the assembled English sentence through translateSentence so
 *      the language's grammar features (article placement, agreement,
 *      negation, prodrop, word order) all kick in.
 *   5. Update the discourse context.
 *
 * Output is per-line so the UI can stream results.
 */

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
    // Don't mention the topic here — it stays as the topic for next turn.
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

  // Tense-aware verb realisation. Verb pool depends on the
  // template's transitivity demands so we don't emit "the fish die
  // the horse" — die is intransitive. Templates with {O} draw from
  // TRANSITIVE_VERB_POOL only; no-object templates draw from the
  // intransitive pool (or full pool when neither distinction
  // applies).
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

/**
 * Pick the next template, alternating between introducing-new and
 * topic-continuing patterns so the narrative gets rhythm. The first
 * sentence always introduces.
 */
function pickTemplate(
  genre: DiscourseGenre,
  ctx: DiscourseContext,
  rng: Rng,
): GenreTemplate {
  const all = templatesFor(genre);
  const introducing = all.filter((t) => t.introducesEntity);
  const continuing = all.filter((t) => t.topicSubject);
  // First sentence: introduce.
  if (ctx.turnIndex === 0 || !ctx.topic) return pick(introducing, rng);
  // Otherwise alternate, biased 60/40 towards continuing for cohesion.
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

    // Update discourse: any subject from this template becomes
    // mentioned + the topic. This drives pronoun choice next turn.
    if (template.needs.subject && openClassSlots[0]) {
      mention(ctx, openClassSlots[0]);
    }
    // Object also gets mentioned but doesn't override topic if a fresh
    // subject was introduced.
    if (template.needs.object && openClassSlots[template.needs.subject ? 1 : 0]) {
      const objMeaning = openClassSlots[template.needs.subject ? 1 : 0]!;
      const wasNew = !ctx.entities.has(objMeaning);
      mention(ctx, objMeaning);
      // If the subject was a pronoun (no fresh subject mention), the
      // object becomes the new topic candidate. Otherwise the subject
      // stays as topic.
      if (!template.needs.subject && wasNew) ctx.topic = ctx.entities.get(objMeaning)!;
    }
    // Pronominalise the next mention if appropriate (cosmetic note —
    // the actual rendering is driven by the {TOPIC} placeholder, but
    // we expose the heuristic for tests).
    void shouldPronominalise;

    // Realise via translateSentence — this gets us all the §2.1
    // grammar+typology behaviour for free. Then re-render each
    // token's WordForm through formatForm so the user's script
    // preference (IPA / Roman / both) is honoured. Without this we
    // emit raw phoneme concatenations and the narrative reads in
    // bare IPA regardless of the picker.
    const tx = translateSentence(lang, english);
    const renderToken = (t: typeof tx.targetTokens[number]): string => {
      // Quoted unresolved tokens (`"dragon"`, `"?"`) and synthesised
      // closed-class forms (NEG / Q / DET) live on `targetSurface`
      // only — they don't carry a real WordForm to romanise. Pass
      // those through verbatim. Everything else goes through
      // formatForm so the language's drifted Latin orthography
      // (when picked) actually surfaces.
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
