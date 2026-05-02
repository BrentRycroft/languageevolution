import type { Language, Meaning, WordForm } from "../types";
import type { TranslatedToken } from "../translator/sentence";
import type { EnglishTag } from "../translator/tokens";
import type { DiscourseContext } from "./discourse";
import { inflect, inflectCascade } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";
import { formToString } from "../phonology/ipa";
import { formatForm, type DisplayScript } from "../phonology/display";
import { glossToEnglish } from "../translator/glossToEnglish";

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
}

interface RoleToken {
  role: "DET" | "ADJ" | "S" | "V" | "O" | "PRON" | "PREP" | "TIME" | "ADV";
  token: TranslatedToken;
}

const TIME_LEMMAS = new Set(["morning", "evening", "night", "winter", "summer"]);

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
 * If the language has altForms for `meaning` and the composer is given
 * a non-zero pickAltProbability, return a random alt's form (biased by
 * genre register). Otherwise return the primary form unchanged.
 */
function pickFormWithAlts(
  lang: Language,
  meaning: Meaning,
  options: ComposeOptions,
): WordForm | null {
  const primary = lang.lexicon[meaning];
  if (!primary) return null;
  const alts = lang.altForms?.[meaning] ?? [];
  if (alts.length === 0) return primary;
  const { rng, pickAltProbability = 0, genreRegister = "neutral" } = options;
  if (!rng || pickAltProbability <= 0) return primary;
  if (!rng.chance(pickAltProbability)) return primary;
  // Bias by register: high-register genre prefers high-register alts; low
  // prefers low. With no register-tag info, pick uniformly.
  const registers = lang.altRegister?.[meaning] ?? [];
  const matching = alts.filter(
    (_, i) =>
      registers[i] === genreRegister ||
      genreRegister === "neutral" ||
      registers[i] === undefined,
  );
  const pool = matching.length > 0 ? matching : alts;
  return pool[rng.int(pool.length)] ?? primary;
}

function inflectNoun(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
  opts: { plural: boolean; objectCase: boolean },
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
  return { form: out, glossNote: notes.join(",") };
}

function inflectVerb(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
  opts: { tense: "past" | "present" | "future"; person3sg: boolean },
): { form: WordForm; glossNote: string } {
  const order: MorphCategory[] = [];
  if (opts.tense === "past") order.push("verb.tense.past");
  else if (opts.tense === "future") order.push("verb.tense.fut");
  if (opts.person3sg) order.push("verb.person.3sg");
  const { form: out, applied } = inflectCascade(form, order, lang, meaning);
  const notes = applied.map((c) => c.replace(/^verb\./, ""));
  return { form: out, glossNote: notes.join(",") };
}

function articleRoleToken(lang: Language, script: DisplayScript): RoleToken | null {
  if (lang.grammar.articlePresence !== "free") return null;
  const form = lang.lexicon["the"];
  if (!form) return null;
  return {
    role: "DET",
    token: makeToken({
      englishLemma: "the",
      englishTag: "DET",
      glossNote: "",
      targetForm: form,
      targetSurface: renderForm(form, lang, script, "the"),
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
  const base = pickFormWithAlts(lang, meaning, composeOptions);
  if (!base) return null;
  const { form, glossNote } = inflectNoun(lang, meaning, base, opts);
  return {
    role,
    token: makeToken({
      englishLemma: meaning,
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
  const { form, glossNote } = inflectVerb(lang, meaning, base, opts);
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
  const prepForm = lang.lexicon["in"] ?? lang.lexicon["at"];
  if (prepForm) {
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
  const detTok = articleRoleToken(lang, script);
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
  const det = articleRoleToken(lang, script);
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
): RoleToken[] {
  const out: RoleToken[] = [];
  const det = articleRoleToken(lang, script);
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

export function composeTargetSentence(
  lang: Language,
  template: AbstractTemplate,
  slots: SlotAssignment,
  ctx: DiscourseContext,
  script: DisplayScript = "ipa",
  options: ComposeOptions = {},
): ComposedSentence {
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

  // Do-support for past/present negation: when the template is negated
  // and the language has both "do" and "not" in its lexicon, prefer
  // "did/do + not + bare verb" over inline NEG. We inflect "do" via
  // verbRoleToken so suppletion fires → past tense produces "did",
  // present 3sg produces "does".
  const negated = !!template.negated;
  const auxNot = lang.lexicon["not"];
  const doForm = lang.lexicon["do"];
  let didDoSupport = false;
  if (negated && auxNot && doForm) {
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
