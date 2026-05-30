import type { Language, Meaning, WordForm } from "../types";
import type { TranslatedToken } from "../translator/sentence";
import type { EnglishTag } from "../translator/tokens";
import type { DiscourseContext, DiscourseGenre } from "./discourse";
import { inflect, inflectCascade } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";
import { formToString } from "../phonology/ipa";
import { formatForm, type DisplayScript } from "../phonology/display";
import { glossToEnglish } from "../translator/glossToEnglish";
import { pickSynonymForGenre } from "./genre_bias";
import { closedClassForm } from "../translator/closedClass";
import { tryDerivedFormFromMeaning } from "../morphology/derivation";
import { composeTargetClause } from "./roleProjection";
import type { RoleClause } from "../translator/syntax";

export { composeTargetClause };

/**
 * composer.ts
 *
 * Discourse-genre narrative composer (target-side composer.ts), legacy skeleton mode (generate.ts), discourse model (mention / logophoric). Key exports: TemplateShape, AbstractTemplate, SlotAssignment.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export type TemplateShape =
  | "transitive"
  | "intransitive"
  | "transitive_adj"
  | "adj_subject"
  | "place_intrans"
  | "time_prefix_intrans"
  | "time_prefix_trans"
  | "long_ago_trans"
  | "long_ago_trans_adj"
  | "topic_trans"
  | "topic_intrans"
  | "topic_time_intrans"
  | "instrument_adjunct"
  | "benefactive"
  | "motion_source"
  | "motion_goal";

export interface AbstractTemplate {
  shape: TemplateShape;
  tense: "present" | "past" | "future";
  needs: {
    subject: boolean;
    object: boolean;
    adjective: boolean;
    time: boolean;
    place: boolean;
  };
  introducesEntity?: boolean;
  topicSubject?: boolean;
  /**
   * Sentence-level negation. When true, the composer emits a NEG token
   * at the position dictated by lang.grammar.negationPosition (or
   * defaulted to "pre-verb"). Past-tense English-style do-support is
   * implicit in the surface form when both negated and tense=past
   * are set on a tier-3 lang with a "do" entry.
   */
  negated?: boolean;
  /**
   * Verb aspect. "perfect" emits an AUX token for "have"/"has"/"had" before
   * the main verb, with the main verb glossed `verb.aspect.perf` so
   * glossToEnglish renders the past participle. Defaults to "simple".
   */
  aspect?: "simple" | "perfect";
}

export interface SlotAssignment {
  verb: Meaning;
  subject?: Meaning;
  object?: Meaning;
  adjective?: Meaning;
  time?: Meaning;
  place?: Meaning;
}

export interface ComposedSentence {
  tokens: TranslatedToken[];
  surface: string;
  english: string;
}

/**
 * Optional knobs for composeTargetSentence. When `pickAltProbability` >0
 * and `rng` is provided, the composer rolls per-slot and may substitute
 * the primary lexicon form with a Phase-20d altForms entry. `genreRegister`
 * biases the alt selection: "high"-genre prefers high-register alts,
 * "low" prefers low. "neutral" uses uniform.
 */
export interface ComposeOptions {
  rng?: { next: () => number; chance: (p: number) => boolean; int: (n: number) => number };
  pickAltProbability?: number;
  genreRegister?: "high" | "low" | "neutral";
  /**
   * Phase 61: when set, slot-form picking routes through
   * `pickSynonymForGenre` so Phase 53 T5 affix-derived synonyms +
   * Phase 57 borrow synonyms surface in narratives proportional to
   * the genre's register weighting. Without `genre`, the composer
   * falls back to the language's primary lexicon entry.
   */
  genre?: DiscourseGenre;
  /**
   * Phase 61: probability per slot of swapping the bare synonym for
   * its sister synonym (Phase 53 T5 / Phase 57). Default 0.35 — high
   * enough that synonyms surface in most lines for synonym-rich
   * languages, low enough that the canonical form still dominates.
   */
  synonymPickProbability?: number;
}

interface RoleToken {
  role: "DET" | "ADJ" | "S" | "V" | "O" | "PRON" | "PREP" | "TIME" | "ADV";
  token: TranslatedToken;
}

const TIME_LEMMAS = new Set(["morning", "evening", "night", "winter", "summer"]);
// Deictic temporal adverbs are inherently adverbial — they take NO adposition
// or article ("yesterday she went", not "in (the) yesterday"), unlike temporal
// nouns ("in summer", "in the morning"). Universal across languages.
const DEICTIC_TIME = new Set(["today", "yesterday", "tomorrow", "now"]);

// Suppletive object/oblique forms of the personal pronouns, for the English
// gloss CAPTION when a pronoun fills an object slot ("king speaks he" → "him").
// The target form itself is case-marked via the objectCase inflection; this
// only corrects the English-side caption. Mirrors realise.ts PRONOUN_OBLIQUE.
const PRONOUN_OBLIQUE: Readonly<Record<string, string>> = {
  he: "him", she: "her", i: "me", we: "us", they: "them", who: "whom",
};

function fallbackForm(lang: Language, candidates: Meaning[]): { meaning: Meaning; form: WordForm } | null {
  for (const m of candidates) {
    const f = lang.lexicon[m];
    if (f && f.length > 0) return { meaning: m, form: f };
  }
  return null;
}

function renderForm(form: WordForm, lang: Language, script: DisplayScript, meaning?: string): string {
  if (form.length === 0) return "";
  return script === "ipa" ? formToString(form) : formatForm(form, lang, script, meaning);
}

function makeToken(opts: {
  englishLemma: string;
  englishTag: EnglishTag;
  glossNote: string;
  targetForm: WordForm;
  targetSurface: string;
}): TranslatedToken {
  return {
    englishLemma: opts.englishLemma,
    englishTag: opts.englishTag,
    glossNote: opts.glossNote,
    targetForm: opts.targetForm,
    targetSurface: opts.targetSurface,
    resolution: "direct",
  };
}

/**
 * Phase 61: route slot-form picking through Phase 53 T5 / Phase 57
 * synonyms first (via `pickSynonymForGenre`), then layer the legacy
 * `altForms` swap on top.
 *
 * - `genre` set + multiple Words for `meaning` + RNG roll passes →
 *   genre-weighted synonym Word's primary form is chosen.
 * - Otherwise the primary lexicon entry is used.
 * - Then with `pickAltProbability` we may swap to an `altForms` entry
 *   (legacy Phase 20d altForms still active for languages that haven't
 *   migrated all their alts to Word entries).
 */
function pickFormWithAlts(
  lang: Language,
  meaning: Meaning,
  options: ComposeOptions,
): WordForm | null {
  const primary = lang.lexicon[meaning];
  if (!primary) return null;
  const {
    rng,
    pickAltProbability = 0,
    genreRegister = "neutral",
    genre,
    synonymPickProbability = 0.35,
  } = options;

  // Phase 61: if a genre is supplied and the language has multiple
  // lexicalised forms for this meaning, roll for a synonym swap.
  let chosen: WordForm = primary;
  if (rng && genre && synonymPickProbability > 0 && rng.chance(synonymPickProbability)) {
    const synPick = pickSynonymForGenre(lang, meaning, genre, rng as import("../rng").Rng);
    if (synPick && synPick.word.form.length > 0) {
      chosen = synPick.word.form;
    }
  }

  const alts = lang.altForms?.[meaning] ?? [];
  if (alts.length === 0) return chosen;
  if (!rng || pickAltProbability <= 0) return chosen;
  if (!rng.chance(pickAltProbability)) return chosen;
  const registers = lang.altRegister?.[meaning] ?? [];
  const matching = alts.filter(
    (_, i) =>
      registers[i] === genreRegister ||
      genreRegister === "neutral" ||
      registers[i] === undefined,
  );
  const pool = matching.length > 0 ? matching : alts;
  return pool[rng.int(pool.length)] ?? chosen;
}

function inflectNoun(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
  opts: { plural: boolean; objectCase: boolean },
  composeOptions: ComposeOptions = {},
): { form: WordForm; glossNote: string } {
  let out = form;
  const notes: string[] = [];
  if (opts.plural) {
    const p = lang.morphology.paradigms["noun.num.pl"];
    if (p) {
      out = inflect(out, p, lang, meaning);
      notes.push("num.pl");
    }
  }
  if (opts.objectCase && lang.grammar.hasCase) {
    const acc = lang.morphology.paradigms["noun.case.acc"];
    if (acc) {
      out = inflect(out, acc, lang, meaning);
      notes.push("case.acc");
    }
  }
  // Phase 61 / Phase 63: optional oblique case stack at synthesisIndex
  // ≥ 2. Phase 61 stacked spurious plural + oblique on the SAME noun
  // (so a subject could end up with num.pl + case.gen even when the
  // shape didn't ask for plural), inflating noun length. Phase 63
  // drops the spurious-plural addition and tightens the oblique-case
  // probability so it fires rarely. Romance languages dropped case
  // marking entirely — `lang.grammar.hasCase` gates this off for them.
  const idx = lang.grammar.synthesisIndex ?? 1.5;
  const rng = composeOptions.rng;
  if (
    rng &&
    idx >= 2.0 &&
    !opts.objectCase &&
    lang.grammar.hasCase &&
    rng.chance(Math.min(0.15, 0.08 * (idx - 1.5)))
  ) {
    const oblique = pickOne(rng, [
      "noun.case.gen",
      "noun.case.loc",
      "noun.case.inst",
    ] as const);
    const p = lang.morphology.paradigms[oblique];
    if (p) {
      out = inflect(out, p, lang, meaning);
      notes.push(oblique.replace(/^noun\./, ""));
    }
  }
  return { form: out, glossNote: notes.join(",") };
}

function pickOne<T>(
  rng: { int: (n: number) => number },
  arr: readonly T[],
): T {
  return arr[rng.int(arr.length)]!;
}

function inflectVerb(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
  opts: { tense: "past" | "present" | "future"; person3sg: boolean },
  composeOptions: ComposeOptions = {},
): { form: WordForm; glossNote: string } {
  const order: MorphCategory[] = [];
  if (opts.tense === "past") order.push("verb.tense.past");
  else if (opts.tense === "future") order.push("verb.tense.fut");
  if (opts.person3sg) order.push("verb.person.3sg");

  // Phase 61: heavy-synthesis stack. At synthesisIndex >= 2 the verb may
  // pick up an aspect marker, and at >= 2.5 a mood marker. Each is gated
  // on the paradigm existing in the language so we never invent morphology.
  const idx = lang.grammar.synthesisIndex ?? 1.5;
  const rng = composeOptions.rng;
  if (rng && idx >= 2.0 && rng.chance(Math.min(0.5, 0.3 * (idx - 1.5)))) {
    const aspectChoice = pickOne(rng, [
      "verb.aspect.pfv",
      "verb.aspect.ipfv",
      "verb.aspect.prog",
      "verb.aspect.hab",
    ] as const);
    if (lang.morphology.paradigms[aspectChoice]) {
      order.push(aspectChoice);
    }
  }
  if (rng && idx >= 2.5 && rng.chance(Math.min(0.4, 0.25 * (idx - 1.5)))) {
    const moodChoice = pickOne(rng, [
      "verb.mood.subj",
      "verb.mood.cond",
      "verb.mood.opt",
    ] as const);
    if (lang.morphology.paradigms[moodChoice]) {
      order.push(moodChoice);
    }
  }
  if (rng && idx >= 3.0 && rng.chance(0.15)) {
    const evidChoice = pickOne(rng, [
      "verb.evid.dir",
      "verb.voice.pass",
    ] as const);
    if (lang.morphology.paradigms[evidChoice]) {
      order.push(evidChoice);
    }
  }

  const { form: out, applied } = inflectCascade(form, order, lang, meaning);
  const notes = applied.map((c) => c.replace(/^verb\./, ""));
  return { form: out, glossNote: notes.join(",") };
}

/**
 * Phase 65 T1: discourse-aware article emission.
 *
 * - `meaning` undefined → fall back to the legacy "always emit the"
 *   behaviour (used by adjuncts where definiteness isn't tracked).
 * - First mention of an entity (mentionCount === 1) → indefinite
 *   article from `lang.lexicon["a"]`. Falls through to no article
 *   when the language doesn't have an indefinite form (Latin-style).
 * - Subsequent mentions (mentionCount > 1) → definite "the".
 *
 * This wires the existing `DiscourseEntity.mentionCount` (Phase 65)
 * into emission so Romance/English narratives stop emitting "the"
 * five times per sentence.
 */
function articleRoleToken(
  lang: Language,
  script: DisplayScript,
  ctx?: DiscourseContext,
  meaning?: Meaning,
): RoleToken | null {
  if (lang.grammar.articlePresence !== "free") return null;
  let lemma: "the" | "a" = "the";
  if (ctx && meaning) {
    const ent = ctx.entities.get(meaning);
    const count = ent?.mentionCount ?? 0;
    if (count <= 1) lemma = "a";
    else lemma = "the";
  }
  let form = lang.lexicon[lemma];
  // If indefinite isn't lexicalised, fall back to definite — better
  // a slight definiteness mismatch than no article at all.
  if (!form && lemma === "a") form = lang.lexicon["the"];
  if (!form) return null;
  return {
    role: "DET",
    token: makeToken({
      englishLemma: lemma,
      englishTag: "DET",
      glossNote: "",
      targetForm: form,
      targetSurface: renderForm(form, lang, script, lemma),
    }),
  };
}

function pronounRoleToken(
  lang: Language,
  ctx: DiscourseContext,
  script: DisplayScript,
): RoleToken | null {
  if (!ctx.topic) return null;
  const target = ctx.topic.pronoun;

  // Phase 65 T2: when the language has a logophoric reference system
  // AND the current topic IS the logophoric center (i.e., the matrix
  // subject of an active quoted frame), emit the logophoric pronoun
  // form rather than the regular he/she/it/they. Closed-class slot
  // `3sg.log` / `3pl.log` is consulted; falls through to the regular
  // pronoun if no logophoric form is registered.
  const refTracking = lang.grammar.referenceTracking;
  const logophoricActive =
    (refTracking === "logophoric" || refTracking === "both") &&
    ctx.logophoricCenter?.meaning === ctx.topic.meaning;
  if (logophoricActive) {
    const isPlural = ctx.topic.pronoun === "they";
    const slot = isPlural ? "3pl.log" : "3sg.log";
    const logoForm = closedClassForm(lang, slot);
    if (logoForm && logoForm.length > 0) {
      return {
        role: "PRON",
        token: makeToken({
          englishLemma: slot,
          englishTag: "PRON",
          glossNote: "logophoric",
          targetForm: logoForm,
          targetSurface: renderForm(logoForm, lang, script, slot),
        }),
      };
    }
  }

  const candidates: Meaning[] = [target, "it", "he", "she", "they"];
  const found = fallbackForm(lang, candidates);
  if (!found) return null;
  return {
    role: "PRON",
    token: makeToken({
      englishLemma: target,
      englishTag: "PRON",
      glossNote: "",
      targetForm: found.form,
      targetSurface: renderForm(found.form, lang, script, found.meaning),
    }),
  };
}

function nounRoleToken(
  lang: Language,
  meaning: Meaning,
  role: "S" | "O",
  opts: { plural: boolean; objectCase: boolean },
  script: DisplayScript,
  composeOptions: ComposeOptions = {},
): RoleToken | null {
  let base = pickFormWithAlts(lang, meaning, composeOptions);
  // Phase 68b T3: when the slot meaning is a runtime-derived shape
  // (`${root}-${tag}`) NOT in the lexicon, build the form on the fly
  // via the productive suffix. Pre-Phase-68b this returned null and
  // the slot was dropped; runtime-derived narratives now actually
  // emit forms like "see-agt" → /siːəɹ/.
  if (!base && meaning.includes("-")) {
    const derived = tryDerivedFormFromMeaning(lang, meaning);
    if (derived) base = derived;
  }
  if (!base) return null;
  const { form, glossNote } = inflectNoun(lang, meaning, base, opts, composeOptions);
  // Object pronoun → suppletive oblique caption ("he"→"him") so the English
  // gloss reads naturally; the target form is already case-marked above.
  const captionLemma = role === "O" ? (PRONOUN_OBLIQUE[meaning] ?? meaning) : meaning;
  return {
    role,
    token: makeToken({
      englishLemma: captionLemma,
      englishTag: "N",
      glossNote,
      targetForm: form,
      targetSurface: renderForm(form, lang, script, meaning),
    }),
  };
}

function verbRoleToken(
  lang: Language,
  meaning: Meaning,
  opts: { tense: "past" | "present" | "future"; person3sg: boolean },
  script: DisplayScript,
  composeOptions: ComposeOptions = {},
): RoleToken | null {
  const base = pickFormWithAlts(lang, meaning, composeOptions);
  if (!base) return null;
  const { form, glossNote } = inflectVerb(lang, meaning, base, opts, composeOptions);
  return {
    role: "V",
    token: makeToken({
      englishLemma: meaning,
      englishTag: "V",
      glossNote,
      targetForm: form,
      targetSurface: renderForm(form, lang, script, meaning),
    }),
  };
}

function adjectiveRoleToken(
  lang: Language,
  meaning: Meaning,
  script: DisplayScript,
  composeOptions: ComposeOptions = {},
): RoleToken | null {
  const form = pickFormWithAlts(lang, meaning, composeOptions);
  if (!form) return null;
  return {
    role: "ADJ",
    token: makeToken({
      englishLemma: meaning,
      englishTag: "ADJ",
      glossNote: "",
      targetForm: form,
      targetSurface: renderForm(form, lang, script, meaning),
    }),
  };
}

function placeRoleTokens(
  lang: Language,
  meaning: Meaning,
  script: DisplayScript,
): RoleToken[] {
  const out: RoleToken[] = [];
  const prepForm = lang.lexicon["at"] ?? lang.lexicon["in"] ?? lang.lexicon["on"];
  if (prepForm) {
    out.push({
      role: "PREP",
      token: makeToken({
        englishLemma: "at",
        englishTag: "PREP",
        glossNote: "",
        targetForm: prepForm,
        targetSurface: renderForm(prepForm, lang, script, "at"),
      }),
    });
  }
  const detTok = articleRoleToken(lang, script);
  if (detTok) out.push(detTok);
  const placeForm = lang.lexicon[meaning];
  if (placeForm) {
    out.push({
      role: "O",
      token: makeToken({
        englishLemma: meaning,
        englishTag: "N",
        glossNote: "",
        targetForm: placeForm,
        targetSurface: renderForm(placeForm, lang, script, meaning),
      }),
    });
  }
  return out;
}

function timePrefixRoleTokens(
  lang: Language,
  meaning: Meaning,
  script: DisplayScript,
): RoleToken[] {
  const out: RoleToken[] = [];
  // Deictic adverbs (today/yesterday/tomorrow) surface bare — no adposition,
  // no article. Temporal nouns take "in" (+ optional article).
  const isDeictic = DEICTIC_TIME.has(meaning);
  const prepForm = lang.lexicon["in"] ?? lang.lexicon["at"];
  if (!isDeictic && prepForm) {
    out.push({
      role: "PREP",
      token: makeToken({
        englishLemma: "in",
        englishTag: "PREP",
        glossNote: "",
        targetForm: prepForm,
        targetSurface: renderForm(prepForm, lang, script, "in"),
      }),
    });
  }
  const detTok = isDeictic ? null : articleRoleToken(lang, script);
  if (detTok) out.push(detTok);
  const timeForm = lang.lexicon[meaning];
  if (timeForm) {
    out.push({
      role: "TIME",
      token: makeToken({
        englishLemma: meaning,
        englishTag: TIME_LEMMAS.has(meaning) ? "N" : "ADV",
        glossNote: "",
        targetForm: timeForm,
        targetSurface: renderForm(timeForm, lang, script, meaning),
      }),
    });
  }
  return out;
}

/**
 * Build a PP-like adjunct sequence: ADP + (DET) + N. The ADP form is taken
 * from the language's lexicon under the requested lemma (with a small
 * fallback chain for proto-languages missing the exact entry). When the
 * language uses postpositions, the adposition is emitted *after* the noun.
 * Used by instrument / benefactive / motion-source / motion-goal shapes.
 */
function adjunctRoleTokens(
  lang: Language,
  prepLemma: string,
  fallbackLemmas: readonly string[],
  meaning: Meaning,
  script: DisplayScript,
): RoleToken[] {
  const out: RoleToken[] = [];
  let prepForm = lang.lexicon[prepLemma];
  let prepUsedLemma = prepLemma;
  if (!prepForm) {
    for (const fb of fallbackLemmas) {
      if (lang.lexicon[fb]) {
        prepForm = lang.lexicon[fb];
        prepUsedLemma = fb;
        break;
      }
    }
  }
  const nounForm = lang.lexicon[meaning];
  if (!nounForm) return out;
  const prepTok: RoleToken | null = prepForm
    ? {
        role: "PREP",
        token: makeToken({
          englishLemma: prepLemma,
          englishTag: "PREP",
          glossNote: "",
          targetForm: prepForm,
          targetSurface: renderForm(prepForm, lang, script, prepUsedLemma),
        }),
      }
    : null;
  const nounTok: RoleToken = {
    role: "O",
    token: makeToken({
      englishLemma: meaning,
      englishTag: "N",
      glossNote: "",
      targetForm: nounForm,
      targetSurface: renderForm(nounForm, lang, script, meaning),
    }),
  };
  const det = articleRoleToken(lang, script);
  if (lang.grammar.caseStrategy === "postposition") {
    if (det) out.push(det);
    out.push(nounTok);
    if (prepTok) out.push(prepTok);
  } else {
    if (prepTok) out.push(prepTok);
    if (det) out.push(det);
    out.push(nounTok);
  }
  return out;
}

function longAgoRoleToken(lang: Language, script: DisplayScript): RoleToken | null {
  const cand = ["long-ago", "before", "ancient", "past"];
  for (const m of cand) {
    const f = lang.lexicon[m];
    if (f) {
      return {
        role: "ADV",
        token: makeToken({
          englishLemma: "long-ago",
          englishTag: "ADV",
          glossNote: "",
          targetForm: f,
          targetSurface: renderForm(f, lang, script, m),
        }),
      };
    }
  }
  return null;
}

function buildSubjectGroup(
  lang: Language,
  ctx: DiscourseContext,
  meaning: Meaning | undefined,
  topic: boolean,
  adj: Meaning | undefined,
  script: DisplayScript,
  composeOptions: ComposeOptions = {},
): RoleToken[] {
  const out: RoleToken[] = [];
  if (topic) {
    const pron = pronounRoleToken(lang, ctx, script);
    if (pron) {
      out.push(pron);
      return out;
    }
  }
  if (!meaning) return out;
  // Phase 65 T1: pass ctx + meaning so the article gate can emit
  // indefinite "a" on first mention and definite "the" on later.
  const det = articleRoleToken(lang, script, ctx, meaning);
  if (det) out.push(det);
  const adjPos = lang.grammar.adjectivePosition ?? "pre";
  if (adj && adjPos === "pre") {
    const adjTok = adjectiveRoleToken(lang, adj, script, composeOptions);
    if (adjTok) out.push(adjTok);
  }
  const subj = nounRoleToken(
    lang,
    meaning,
    "S",
    { plural: false, objectCase: false },
    script,
    composeOptions,
  );
  if (subj) out.push(subj);
  if (adj && adjPos === "post") {
    const adjTok = adjectiveRoleToken(lang, adj, script, composeOptions);
    if (adjTok) out.push(adjTok);
  }
  return out;
}

function buildObjectGroup(
  lang: Language,
  meaning: Meaning,
  adj: Meaning | undefined,
  script: DisplayScript,
  composeOptions: ComposeOptions = {},
  ctx?: DiscourseContext,
): RoleToken[] {
  const out: RoleToken[] = [];
  const det = articleRoleToken(lang, script, ctx, meaning);
  if (det) out.push(det);
  const adjPos = lang.grammar.adjectivePosition ?? "pre";
  if (adj && adjPos === "pre") {
    const adjTok = adjectiveRoleToken(lang, adj, script, composeOptions);
    if (adjTok) out.push(adjTok);
  }
  const obj = nounRoleToken(
    lang,
    meaning,
    "O",
    { plural: false, objectCase: true },
    script,
    composeOptions,
  );
  if (obj) out.push(obj);
  if (adj && adjPos === "post") {
    const adjTok = adjectiveRoleToken(lang, adj, script, composeOptions);
    if (adjTok) out.push(adjTok);
  }
  return out;
}

function arrangeSVO(
  order: Language["grammar"]["wordOrder"],
  S: RoleToken[],
  V: RoleToken[],
  O: RoleToken[],
): RoleToken[] {
  switch (order) {
    case "SOV": return [...S, ...O, ...V];
    case "SVO": return [...S, ...V, ...O];
    case "VSO": return [...V, ...S, ...O];
    case "VOS": return [...V, ...O, ...S];
    case "OVS": return [...O, ...V, ...S];
    case "OSV": return [...O, ...S, ...V];
  }
}

function arrangeSV(
  order: Language["grammar"]["wordOrder"],
  S: RoleToken[],
  V: RoleToken[],
): RoleToken[] {
  switch (order) {
    case "SOV":
    case "SVO":
    case "OVS":
    case "OSV":
      return [...S, ...V];
    case "VSO":
    case "VOS":
      return [...V, ...S];
  }
}

/**
 * Phase 73c Tier C Phase 2: token-realisation half of the composer.
 *
 * Pre-Phase-2, `composeTargetSentence` was a single ~250-line
 * function that mixed structural extraction (which participants
 * play which roles) with token emission (do-support, perfect-aspect
 * AUX, word-order arrangement, English caption rendering).
 *
 * Phase 2 splits the function in two:
 *   1. `composeTargetClause` (in `./roleProjection.ts`) — pure data
 *      transform producing a `RoleClause` IR view of the inputs.
 *   2. `projectRoleClauseToTokens` (this function) — the legacy
 *      token-realisation body, now consuming the clause alongside
 *      `(template, slots)` for back-compat reads of fields the IR
 *      doesn't yet cover (shape-driven opener/adjunct dispatch).
 *
 * The Phase 2 contract is byte-identical narrative output. Phase 4
 * narrows this signature to `(clause, lang, ctx, script, options)`
 * once the clause is sufficient.
 */
export function projectRoleClauseToTokens(
  clause: RoleClause,
  lang: Language,
  template: AbstractTemplate,
  slots: SlotAssignment,
  ctx: DiscourseContext,
  script: DisplayScript = "ipa",
  options: ComposeOptions = {},
): ComposedSentence {
  void clause; // Phase 2 byte-identity: clause is constructed for
               // tests + Phase 4. Token realisation here still reads
               // template/slots directly; Phase 4 will narrow.
  const tense = template.tense;
  const openerTokens: RoleToken[] = [];

  if (template.shape === "long_ago_trans" || template.shape === "long_ago_trans_adj") {
    const t = longAgoRoleToken(lang, script);
    if (t) openerTokens.push(t);
  }
  if (
    template.shape === "time_prefix_intrans" ||
    template.shape === "time_prefix_trans" ||
    template.shape === "topic_time_intrans"
  ) {
    if (slots.time) openerTokens.push(...timePrefixRoleTokens(lang, slots.time, script));
  }

  const topic = !!template.topicSubject;
  const subjectIs3sgFromTopic =
    topic && ctx.topic ? ctx.topic.pronoun !== "they" : true;
  const subjectIs3sg = topic ? subjectIs3sgFromTopic : true;

  const verbTokens: RoleToken[] = [];

  // Do-support for past/present negation: "did/do + not + bare verb". This is
  // a cross-linguistically RARE strategy (essentially English-specific —
  // WALS ch.112), so it is GATED on the `grammar.doSupport` typology flag.
  // Languages without it (the default) fall through to inline NEG below, which
  // emits the negator at the language's own `negationPosition`. We inflect
  // "do" via verbRoleToken so suppletion fires → past "did", present 3sg "does".
  const negated = !!template.negated;
  const auxNot = lang.lexicon["not"];
  const doForm = lang.lexicon["do"];
  let didDoSupport = false;
  if (negated && auxNot && doForm && lang.grammar.doSupport) {
    const auxTok = verbRoleToken(
      lang,
      "do",
      {
        tense,
        person3sg: tense === "present" && subjectIs3sg,
      },
      script,
    );
    if (auxTok) {
      didDoSupport = true;
      // Re-tag as AUX with the correct English surface form so
      // glossToEnglish renders "did"/"does"/"do" verbatim. Clear the
      // glossNote so the past/3sg flag isn't propagated to other verbs
      // (the main V is bare under do-support).
      auxTok.token.englishTag = "AUX";
      auxTok.token.englishLemma =
        tense === "past" ? "did" : subjectIs3sg ? "does" : "do";
      auxTok.token.glossNote = "";
      verbTokens.push(auxTok);
      verbTokens.push({
        role: "ADV",
        token: makeToken({
          englishLemma: "not",
          englishTag: "ADV",
          glossNote: "negation",
          targetForm: auxNot,
          targetSurface: renderForm(auxNot, lang, script, "not"),
        }),
      });
    }
  }

  if (tense === "future") {
    const willForm = lang.lexicon["will"];
    if (willForm) {
      verbTokens.push({
        role: "V",
        token: makeToken({
          englishLemma: "will",
          englishTag: "AUX",
          glossNote: "tense.fut",
          targetForm: willForm,
          targetSurface: renderForm(willForm, lang, script, "will"),
        }),
      });
    }
  }

  // Perfect aspect: emit AUX "have/has/had" before the main verb, mark
  // the main V with glossNote `verb.aspect.perf` so glossToEnglish renders
  // its English caption as the past participle ("had seen", "has gone").
  // Skipped under do-support and under future (those auxiliaries don't
  // chain with perfect in the simulator's surface English).
  const wantsPerfect = template.aspect === "perfect" && !didDoSupport && tense !== "future";
  let perfectAux: RoleToken | null = null;
  if (wantsPerfect) {
    const haveForm = lang.lexicon["have"];
    if (haveForm) {
      const auxLemma = tense === "past" ? "had" : subjectIs3sg ? "has" : "have";
      perfectAux = {
        role: "V",
        token: makeToken({
          englishLemma: auxLemma,
          englishTag: "AUX",
          glossNote: "aspect.perf",
          targetForm: haveForm,
          targetSurface: renderForm(haveForm, lang, script, "have"),
        }),
      };
      verbTokens.push(perfectAux);
    }
  }

  // Bare verb after do-support OR perfect aspect; inflected verb otherwise.
  const vTok = verbRoleToken(
    lang,
    slots.verb,
    {
      tense: didDoSupport || perfectAux ? "present" : tense,
      person3sg:
        !didDoSupport && !perfectAux && tense === "present" && subjectIs3sg,
    },
    script,
    options,
  );
  if (vTok) {
    if (perfectAux) {
      // Tag the main V so glossToEnglish renders the past participle.
      vTok.token.glossNote = vTok.token.glossNote
        ? `${vTok.token.glossNote},aspect.perf`
        : "aspect.perf";
    }
    verbTokens.push(vTok);
  }

  // Inline NEG for languages without do-support: emit "not" at the
  // position dictated by lang.grammar.negationPosition (default
  // "pre-verb"). Skip when do-support already emitted a NEG.
  if (negated && !didDoSupport && auxNot) {
    const neg: RoleToken = {
      role: "ADV",
      token: makeToken({
        englishLemma: "not",
        englishTag: "ADV",
        glossNote: "negation",
        targetForm: auxNot,
        targetSurface: renderForm(auxNot, lang, script, "not"),
      }),
    };
    const negPos = lang.grammar.negationPosition ?? "pre-verb";
    if (negPos === "post-verb") {
      verbTokens.push(neg);
    } else if (negPos === "pre-verb") {
      verbTokens.unshift(neg);
    } else {
      // clause-final or unknown — append after verb
      verbTokens.push(neg);
    }
  }

  const adjOnSubject = template.shape === "adj_subject";
  const adjOnObject = template.shape === "transitive_adj" || template.shape === "long_ago_trans_adj";

  const subjectGroup = buildSubjectGroup(
    lang,
    ctx,
    slots.subject,
    topic,
    adjOnSubject ? slots.adjective : undefined,
    script,
    options,
  );

  let objectGroup: RoleToken[] = [];
  const usesObject = template.needs.object;
  // For motion_source / motion_goal, the place slot is a directional
  // PP rather than a generic locative — skip the default placeRoleTokens
  // (which emits "at/in/on") so we don't double-emit a preposition. The
  // adjunct PP is built below.
  const usesDirectional =
    template.shape === "motion_source" || template.shape === "motion_goal";
  if (usesObject && slots.object) {
    objectGroup = buildObjectGroup(
      lang,
      slots.object,
      adjOnObject ? slots.adjective : undefined,
      script,
      options,
      ctx,
    );
  } else if (template.needs.place && slots.place && !usesDirectional) {
    objectGroup = placeRoleTokens(lang, slots.place, script);
  }

  // Phase 20-closeout adjunct PPs. Each adjunct shape attaches a PP
  // ("with N", "for N", "from N", "to N") to its base sentence (transitive
  // for instrument/benefactive, intransitive for motion). The PP appends
  // after the SVO/SV arrangement so it reads sentence-finally regardless
  // of word order, matching how PPs naturally tail a clause in most
  // language types.
  let adjunctGroup: RoleToken[] = [];
  if (template.shape === "instrument_adjunct" && slots.place) {
    adjunctGroup = adjunctRoleTokens(lang, "with", ["by"], slots.place, script);
  } else if (template.shape === "benefactive" && slots.place) {
    adjunctGroup = adjunctRoleTokens(lang, "for", ["to"], slots.place, script);
  } else if (template.shape === "motion_source" && slots.place) {
    adjunctGroup = adjunctRoleTokens(lang, "from", ["of", "at"], slots.place, script);
  } else if (template.shape === "motion_goal" && slots.place) {
    adjunctGroup = adjunctRoleTokens(lang, "to", ["at", "in"], slots.place, script);
  }

  let arranged: RoleToken[];
  if (usesObject || (template.needs.place && slots.place && !usesDirectional)) {
    arranged = arrangeSVO(lang.grammar.wordOrder, subjectGroup, verbTokens, objectGroup);
  } else {
    arranged = arrangeSV(lang.grammar.wordOrder, subjectGroup, verbTokens);
  }

  const targetOrdered: RoleToken[] = [...openerTokens, ...arranged, ...adjunctGroup];
  const englishOrdered: RoleToken[] = [
    ...openerTokens,
    ...subjectGroup,
    ...verbTokens,
    ...objectGroup,
    ...adjunctGroup,
  ];

  const targetSurface = targetOrdered
    .map((rt) => rt.token.targetSurface)
    .filter((s) => s && s.length > 0)
    .join(" ");

  const flatTokens = targetOrdered.map((rt) => rt.token);
  const englishTokens = englishOrdered.map((rt) => rt.token);
  // Under do-support the main verb is bare ("did not see"), so don't
  // pass past tense to glossToEnglish (would otherwise past-inflect the
  // bare verb back to "saw"). Same logic applies to 3sg agreement.
  const english = glossToEnglish(englishTokens, {
    guessTense: didDoSupport ? "present" : tense === "past" ? "past" : "present",
    subjectIs3sg:
      didDoSupport || tense === "future" || perfectAux ? false : subjectIs3sg,
    preserveOrder: true,
    guessAspect: perfectAux ? "perfect" : undefined,
  });

  return {
    tokens: flatTokens,
    surface: targetSurface,
    english,
  };
}

/**
 * Phase 73c Tier C Phase 2: thin wrapper preserving the legacy
 * `composeTargetSentence` signature for the existing five call
 * sites in `discourse_generate.ts`. Builds the RoleClause IR
 * view, then projects via `projectRoleClauseToTokens`.
 */
export function composeTargetSentence(
  lang: Language,
  template: AbstractTemplate,
  slots: SlotAssignment,
  ctx: DiscourseContext,
  script: DisplayScript = "ipa",
  options: ComposeOptions = {},
): ComposedSentence {
  const clause = composeTargetClause(lang, template, slots, ctx);
  return projectRoleClauseToTokens(
    clause,
    lang,
    template,
    slots,
    ctx,
    script,
    options,
  );
}
