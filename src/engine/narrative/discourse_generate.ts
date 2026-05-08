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
import { filterByFrame } from "./frames";
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
import { pickStanza } from "./poetry";

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
  // Phase 26d: when a genre has no topicSubject templates (e.g. poetry's
  // tight introducing-only set), fall back to introducing templates.
  if (continuing.length === 0) return pick(introducing, rng);
  return rng.next() < 0.6 ? pick(continuing, rng) : pick(introducing, rng);
}

/**
 * Slot filler — Phase 61: strict lexicon-driven, no English filler
 * pools. Pulls from `subjectPool / objectPool / verbPool / etc.` which
 * walk `lang.lexicon` directly. The legacy hand-curated pools
 * (SUBJECT_NOUN_POOL, OBJECT_NOUN_POOL, etc.) are used only as a
 * **last-resort** fallback when the language has no lexicalised
 * candidates of the right POS at all — typical post-genesis languages
 * with 100+ words skip this branch entirely.
 *
 * Verbs: transitive/intransitive split still uses the legacy
 * verb-class pool as a hint when filtering large lexicons (so we
 * don't pick a clearly-intransitive verb for a transitive template),
 * but we INTERSECT it with `verbPool(lang)` rather than overriding —
 * if the language has a transitive verb in its lexicon, that wins
 * over the curated pool.
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

  // Phase 61: prefer lexicon-derived pools at any non-empty size; fall
  // through to the curated pool only if the language has zero of that
  // POS. (Most languages by gen 5 have well over 100 entries; the
  // 6-minimum gate was a Phase 53 artifact.)
  const subjects =
    subjectsLex.length > 0 ? subjectsLex : SUBJECT_NOUN_POOL.slice();
  const objects =
    objectsLex.length > 0 ? objectsLex : OBJECT_NOUN_POOL.slice();
  const adjs = adjsLex.length > 0 ? adjsLex : ADJECTIVE_POOL.slice();
  const times = timesLex.length > 0 ? timesLex : TIME_POOL.slice();
  const places = placesLex.length > 0 ? placesLex : PLACE_POOL.slice();

  // Phase 61: verbs sample from lang.lexicon; the curated transitive /
  // intransitive lists are used as a *filter* against the lexicon
  // pool. If the lexicon has matches in the appropriate class, we keep
  // those; otherwise we fall through to the full lexicon verb pool;
  // and finally to the curated pool if the lexicon has no verbs at all.
  const wantTrans = template.needs.object;
  const verbHints = wantTrans
    ? TRANSITIVE_VERB_POOL
    : INTRANSITIVE_VERB_POOL;
  const hintsSet = new Set<string>(verbHints);
  const filteredLexVerbs = verbsLex.filter((v) => hintsSet.has(v));
  const verbs =
    filteredLexVerbs.length > 0
      ? filteredLexVerbs
      : verbsLex.length > 0
        ? verbsLex
        : verbHints.length > 0
          ? verbHints.slice()
          : VERB_POOL.slice();

  const slots: SlotAssignment = {
    verb: pickWeighted(lang, verbs, rng) ?? pick(verbs, rng),
  };
  if (template.needs.subject) {
    slots.subject =
      pickWeighted(lang, subjects, rng) ?? pick(subjects, rng);
  }
  if (template.needs.object) {
    // Phase 29 Tranche 5g: filter the object pool to candidates whose
    // semantic class intersects the verb's argument frame. Catches
    // "drink the start" and "took the color with the village"-style
    // nonsense by constraining drink → liquid, eat → food, etc.
    // Falls through to the original pool when the verb has no frame.
    const framed: string[] = slots.verb
      ? filterByFrame(slots.verb, objects).slice()
      : objects;
    // Phase 61: when the frame filter wipes everything (lexicon has
    // no semantically-compatible objects), fall back to the unfiltered
    // lexicon pool rather than to the curated English set — keeps the
    // output sourced from the language's own vocabulary.
    const objectPoolFinal = framed.length > 0 ? framed : objects;
    slots.object =
      pickWeighted(lang, objectPoolFinal, rng) ?? pick(objectPoolFinal, rng);
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

/**
 * Map discourse genre to the register the composer should bias alt-form
 * selection toward. Myth + legend prefer high-register synonyms (steed,
 * kin, art); daily + dialogue prefer low (horse, family, made).
 */
function genreRegisterFor(genre: DiscourseGenre): "high" | "low" | "neutral" {
  switch (genre) {
    case "myth":
    case "legend":
    case "poetry": // Phase 26d: poetic register prefers elevated alt forms.
      return "high";
    case "daily":
    case "dialogue":
      return "low";
  }
}

function morphologicalGloss(tokens: { englishLemma: string; glossNote: string }[]): string {
  return tokens
    .map((t) => (t.glossNote ? `${t.englishLemma}.${t.glossNote.replace(/,/g, ".")}` : t.englishLemma))
    .filter((s) => s !== "?")
    .join("—");
}

/**
 * Phase 30 Tranche 30e: surface-level article elision for casual
 * registers. Strips the article-final vowel when the next word
 * begins with a vowel. Heuristic-only: looks for whitespace-bounded
 * 1-3 char "article-like" tokens followed by a vowel-initial token.
 */
function applyArticleElision(surface: string): string {
  const VOWELS = "aeiouæɛɔəɪʊɛɑøœɯyɨ";
  return surface.replace(
    /\b([\p{L}]{1,3})\s+([\p{L}])/gu,
    (m, art: string, next: string) => {
      const last = art[art.length - 1] ?? "";
      if (!VOWELS.includes(last.toLowerCase())) return m;
      if (!VOWELS.includes(next.toLowerCase())) return m;
      return `${art.slice(0, -1)}'${next}`;
    },
  );
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

  // Phase 26d: poetry mode generates a stanza by composing N candidate
  // lines (more than requested), scoring each on meter + rhyme, and
  // selecting the best fit per slot via pickStanza. Routes through the
  // standard composer for the actual line text, then post-processes.
  if (genre === "poetry") {
    return generatePoetryStanza(lang, lines, ctx, rng, script);
  }
  const out: DiscourseLine[] = [];

  // Per-genre negation rate: dialogue 30%, daily 25%, legend 15%, myth 10%.
  const negationRate =
    genre === "dialogue" ? 0.3 :
    genre === "daily" ? 0.25 :
    genre === "legend" ? 0.15 :
    0.1;
  // Coordination ("X and Y") rate per gen: 15% across the board.
  const coordRate = 0.15;
  // Perfect-aspect rate: applied only to non-future templates when the
  // language has a "have" entry. Slightly higher in legend/myth to give
  // the formal "had seen" / "have come" feel; lower in casual genres.
  const perfectRate =
    genre === "myth" || genre === "legend" ? 0.18 :
    genre === "dialogue" ? 0.08 :
    0.05;
  const andForm = lang.lexicon["and"];
  const haveForm = lang.lexicon["have"];

  for (let i = 0; i < lines; i++) {
    const baseTemplate = pickTemplate(genre, ctx, rng);
    // Negation: ~negationRate of templates flip to negated.
    let template: AbstractTemplate = rng.chance(negationRate)
      ? { ...baseTemplate, negated: true }
      : baseTemplate;
    // Perfect aspect: occasional flip on past/present templates when the
    // language has the "have" auxiliary in its lexicon.
    if (
      haveForm &&
      template.tense !== "future" &&
      !template.negated &&
      rng.chance(perfectRate)
    ) {
      template = { ...template, aspect: "perfect" };
    }

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

    // Phase 30 Tranche 30e: per-genre alt-pick probability. Daily +
    // dialogue stay close to the canonical (low alt rate) so they
    // read as everyday speech. Myth/legend lean on alt-form picking
    // to surface the elevated synonym pool (via genreRegister=high).
    // Poetry uses the same path through generatePoetryStanza which
    // owns its own alt-rate (see Phase 29 Tranche 5i).
    const altRate =
      genre === "myth" || genre === "legend" ? 0.18 : 0.05;
    const composed = composeTargetSentence(lang, template, slots, ctx, script, {
      rng,
      pickAltProbability: altRate,
      genreRegister: genreRegisterFor(genre),
      genre,
    });
    if (composed.tokens.length === 0) {
      endTurn(ctx);
      continue;
    }
    // Phase 30 Tranche 30e: daily/dialogue article elision. When the
    // language has free articles and the article precedes a
    // vowel-initial noun, elide the article-final vowel ("the apple"
    // → "th'apple") in the surface form. Operates on the rendered
    // string only — token-level forms stay full so the engine still
    // tracks the underlying NP.
    if (
      (genre === "daily" || genre === "dialogue") &&
      lang.grammar.articlePresence === "free"
    ) {
      composed.surface = applyArticleElision(composed.surface);
    }

    // Coordination: with coordRate probability, pick a second template +
    // slots and join them with "and" (target form). Only fires when the
    // language has "and" in its lexicon and both pieces composed cleanly.
    let finalEnglish = composed.english;
    let finalSurface = composed.surface;
    let finalGloss = morphologicalGloss(composed.tokens);
    if (andForm && rng.chance(coordRate)) {
      const tpl2 = pickTemplate(genre, ctx, rng);
      const slots2 = fillSlots(tpl2, lang, rng);
      const composed2 = composeTargetSentence(lang, tpl2, slots2, ctx, script, {
        rng,
        pickAltProbability: 0.1,
        genreRegister: genreRegisterFor(genre),
        genre,
      });
      if (composed2.tokens.length > 0) {
        // Phase 29-2c: previously this branch built two unused
        // `andSurface` / `andTargetRendered` strings (both `void`-ed).
        // Dead refactor leftover. Stripped — the actual coordination
        // surface is built below using `andForm`.
        finalEnglish = `${composed.english} and ${composed2.english}`;
        finalSurface = composed2.surface
          ? `${composed.surface} ${andForm.join("")} ${composed2.surface}`
          : composed.surface;
        finalGloss = `${morphologicalGloss(composed.tokens)} — and — ${morphologicalGloss(composed2.tokens)}`;
      }
    }

    out.push({
      english: finalEnglish,
      text: finalSurface,
      gloss: finalGloss,
    });
    endTurn(ctx);
  }

  return out;
}

/**
 * Phase 26d: poetry-mode stanza generator. Composes ~3× the requested
 * line count as candidates, scores each on meter + rhyme, and selects
 * the best fit per slot via pickStanza. Defaults to iambic + AABB —
 * tunable per ctx if we expose options later.
 */
function generatePoetryStanza(
  lang: Language,
  lineCount: number,
  ctx: DiscourseContext,
  rng: Rng,
  script: DisplayScript,
): DiscourseLine[] {
  // Phase 29 Tranche 5i: enlarge the candidate pool so pickStanza
  // has enough lines to actually satisfy the rhyme constraint.
  // Pre-fix the 3×line pool meant a 4-line AABB stanza had ~12
  // candidates and rarely found two pairs of rhymes — falling back
  // to non-rhyming output. 8×line gives ~32 candidates which lifts
  // the achieved-rhyme rate substantially.
  const candidatePoolSize = Math.max(16, lineCount * 8);
  const candidates: import("./poetry").CandidateLine[] = [];
  for (let i = 0; i < candidatePoolSize; i++) {
    const baseTemplate = pickTemplate("poetry", ctx, rng);
    const slots = fillSlots(baseTemplate, lang, rng);
    if (baseTemplate.needs.subject && slots.subject) {
      mention(ctx, slots.subject as Meaning);
    }
    const composed = composeTargetSentence(lang, baseTemplate, slots, ctx, script, {
      rng,
      pickAltProbability: 0.2, // bias toward alts (high-register selected via genreRegisterFor)
      genreRegister: "high",
      genre: "poetry",
    });
    if (composed.tokens.length === 0) continue;
    candidates.push({
      forms: composed.tokens.map((t) => t.targetForm).filter((f) => f.length > 0),
      text: composed.surface,
      english: composed.english,
    });
    endTurn(ctx);
  }
  const stanza = pickStanza(candidates, lang, {
    meter: "iambic",
    scheme: "AABB",
    lineCount,
  });
  return stanza.map((s) => ({
    english: s.english,
    text: s.text,
    gloss: "", // poetry mode doesn't render the morphological gloss line
  }));
}
