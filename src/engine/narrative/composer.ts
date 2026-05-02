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
  | "topic_time_intrans";

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
): RoleToken | null {
  const base = lang.lexicon[meaning];
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
): RoleToken | null {
  const base = lang.lexicon[meaning];
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
): RoleToken | null {
  const form = lang.lexicon[meaning];
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
    const adjTok = adjectiveRoleToken(lang, adj, script);
    if (adjTok) out.push(adjTok);
  }
  const subj = nounRoleToken(lang, meaning, "S", { plural: false, objectCase: false }, script);
  if (subj) out.push(subj);
  if (adj && adjPos === "post") {
    const adjTok = adjectiveRoleToken(lang, adj, script);
    if (adjTok) out.push(adjTok);
  }
  return out;
}

function buildObjectGroup(
  lang: Language,
  meaning: Meaning,
  adj: Meaning | undefined,
  script: DisplayScript,
): RoleToken[] {
  const out: RoleToken[] = [];
  const det = articleRoleToken(lang, script);
  if (det) out.push(det);
  const adjPos = lang.grammar.adjectivePosition ?? "pre";
  if (adj && adjPos === "pre") {
    const adjTok = adjectiveRoleToken(lang, adj, script);
    if (adjTok) out.push(adjTok);
  }
  const obj = nounRoleToken(lang, meaning, "O", { plural: false, objectCase: true }, script);
  if (obj) out.push(obj);
  if (adj && adjPos === "post") {
    const adjTok = adjectiveRoleToken(lang, adj, script);
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

  // Bare verb after do-support; inflected verb otherwise.
  const vTok = verbRoleToken(
    lang,
    slots.verb,
    {
      tense: didDoSupport ? "present" : tense,
      person3sg:
        !didDoSupport && tense === "present" && subjectIs3sg,
    },
    script,
  );
  if (vTok) verbTokens.push(vTok);

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
  );

  let objectGroup: RoleToken[] = [];
  const usesObject = template.needs.object;
  if (usesObject && slots.object) {
    objectGroup = buildObjectGroup(
      lang,
      slots.object,
      adjOnObject ? slots.adjective : undefined,
      script,
    );
  } else if (template.needs.place && slots.place) {
    objectGroup = placeRoleTokens(lang, slots.place, script);
  }

  let arranged: RoleToken[];
  if (usesObject || (template.needs.place && slots.place)) {
    arranged = arrangeSVO(lang.grammar.wordOrder, subjectGroup, verbTokens, objectGroup);
  } else {
    arranged = arrangeSV(lang.grammar.wordOrder, subjectGroup, verbTokens);
  }

  const targetOrdered: RoleToken[] = [...openerTokens, ...arranged];
  const englishOrdered: RoleToken[] = [
    ...openerTokens,
    ...subjectGroup,
    ...verbTokens,
    ...objectGroup,
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
      didDoSupport || tense === "future" ? false : subjectIs3sg,
    preserveOrder: true,
  });

  return {
    tokens: flatTokens,
    surface: targetSurface,
    english,
  };
}
