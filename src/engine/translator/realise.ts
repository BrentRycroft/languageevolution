import type { Language, WordForm } from "../types";
import { inflect } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";
import { closedClassForm } from "./closedClass";
import type { NP, PP, Sentence, VP } from "./syntax";
import { sliceOrder } from "./wordOrder";

export interface RealisedToken {
  surface: string;
  form: WordForm;
  english: string;
  role: "S" | "V" | "O" | "ADJ" | "DET" | "PREP" | "POSTP" | "POSS" | "NUM" | "NEG" | "ADV" | "PP-NP";
  resolution?: "direct" | "concept" | "colex" | "reverse-colex" | "fallback";
}

export type LemmaResolution = "direct" | "concept" | "colex" | "reverse-colex" | "fallback";

export interface RealiseDeps {
  resolveOpen: (lemma: string) => { form: WordForm | null; resolution: LemmaResolution };
}

export function realiseSentence(
  s: Sentence,
  lang: Language,
  deps: RealiseDeps,
): RealisedToken[] {
  populateForms(s, deps);

  const articlePresence = lang.grammar.articlePresence ?? "none";
  const caseStrategy = lang.grammar.caseStrategy ?? (lang.grammar.hasCase ? "case" : "preposition");
  const adjPos = lang.grammar.adjectivePosition ?? "pre";
  const possPos = lang.grammar.possessorPosition ?? "pre";
  const numPos = lang.grammar.numeralPosition ?? "pre";
  const negPos = lang.grammar.negationPosition ?? "pre-verb";
  const prodrop = !!lang.grammar.prodrop;

  const subject = realiseNP(s.subject, lang, {
    articlePresence, caseStrategy, adjPos, possPos, numPos,
  }, "S");
  const obj = s.predicate.object;
  const canIncorporate =
    !!lang.grammar.incorporates &&
    !!obj &&
    obj.adjectives.length === 0 &&
    !obj.determiner &&
    !obj.possessor &&
    !obj.numeral &&
    obj.pps.length === 0 &&
    !obj.head.isPronoun;
  const incorporatedRoot = canIncorporate && obj ? obj.head.baseForm : null;
  const objectTokens = canIncorporate || !obj
    ? []
    : realiseNP(obj, lang, {
        articlePresence, caseStrategy, adjPos, possPos, numPos,
      }, "O");
  const verbTokens = realiseVerb(s.predicate, lang, s.negated, negPos, incorporatedRoot);
  const predPpTokens = s.predicate.pps.flatMap((pp) =>
    realisePP(pp, lang, { articlePresence, caseStrategy, adjPos, possPos, numPos }),
  );
  const advTokens: RealisedToken[] = s.predicate.adverbs.flatMap((a) => {
    return [{
      surface: a.baseForm.length > 0 ? a.baseForm.join("") : `“${a.lemma}”`,
      form: a.baseForm,
      english: a.lemma,
      role: "ADV" as const,
      resolution: a.resolution,
    }];
  });
  const complementTokens: RealisedToken[] = (s.predicate.complement ?? []).map((a) => {
    let af = a.baseForm;
    if (af.length > 0 && s.subject.head.number === "pl") {
      const p = lang.morphology.paradigms["adj.num.pl"];
      if (p) af = inflect(af, p, lang, a.lemma);
    }
    return {
      surface: af.length > 0 ? af.join("") : `“${a.lemma}”`,
      form: af,
      english: a.lemma,
      role: "ADJ" as const,
      resolution: a.resolution,
    };
  });

  const dropSubject =
    prodrop &&
    s.subject.head.isPronoun &&
    !!lang.morphology.paradigms[
      `verb.person.${s.subject.head.person ?? "3"}${s.subject.head.number}` as MorphCategory
    ];
  const subjectFinal = dropSubject ? [] : subject;

  const order = sliceOrder(lang.grammar.wordOrder);
  const isVFinal = order[order.length - 1] === "V";
  const slot: Record<"S" | "V" | "O", RealisedToken[]> = {
    S: subjectFinal,
    V: verbTokens,
    O: objectTokens,
  };
  const out: RealisedToken[] = [];
  if (s.leadingWh) {
    const wf = closedClassForm(lang, s.leadingWh.lemma) ?? [];
    if (wf.length > 0) {
      out.push({
        surface: wf.join(""),
        form: wf,
        english: s.leadingWh.lemma,
        role: "DET",
        resolution: "concept",
      });
    }
  }
  if (s.leadingConj) {
    const cf = closedClassForm(lang, s.leadingConj.lemma) ?? [];
    if (cf.length > 0) {
      out.push({
        surface: cf.join(""),
        form: cf,
        english: s.leadingConj.lemma,
        role: "DET",
        resolution: "concept",
      });
    }
  }
  const isQuestion = !!s.interrogative;
  const interStrategy = lang.grammar.interrogativeStrategy ?? "intonation";
  if (isQuestion && interStrategy === "inversion") {
    out.push(...verbTokens);
    out.push(...subjectFinal);
    out.push(...objectTokens);
    out.push(...predPpTokens);
  } else {
    for (const k of order) {
      if (isVFinal && k === "V") {
        out.push(...predPpTokens);
      }
      out.push(...slot[k]);
    }
    if (!isVFinal) out.push(...predPpTokens);
  }
  out.push(...complementTokens);
  out.push(...advTokens);

  if (isQuestion && interStrategy === "particle") {
    const qf = closedClassForm(lang, "Q") ?? [];
    if (qf.length > 0) {
      const qTok: RealisedToken = {
        surface: qf.join(""),
        form: qf,
        english: "Q",
        role: "DET",
        resolution: "concept",
      };
      const placement = lang.grammar.interrogativeParticle ?? "final";
      if (placement === "initial") out.unshift(qTok);
      else out.push(qTok);
    }
  }
  if (isQuestion && interStrategy === "intonation") {
    out.push({ surface: "?", form: [], english: "?", role: "DET", resolution: "concept" });
  }
  return out;
}

interface NPCtx {
  articlePresence: "none" | "free" | "enclitic" | "proclitic";
  caseStrategy: "case" | "preposition" | "postposition" | "mixed";
  adjPos: "pre" | "post";
  possPos: "pre" | "post";
  numPos: "pre" | "post";
}

function realiseNP(
  np: NP,
  lang: Language,
  ctx: NPCtx,
  role: "S" | "O" | "PP-NP" | "POSS",
): RealisedToken[] {
  let headForm = np.head.baseForm;
  const meaning = np.head.lemma;
  if (np.head.number === "pl" && lang.grammar.pluralMarking === "affix") {
    const p = lang.morphology.paradigms["noun.num.pl"];
    if (p) headForm = inflect(headForm, p, lang, meaning);
  }
  const caseSlot: import("../morphology/types").MorphCategory | null =
    role === "POSS" ? "noun.case.gen"
    : np.head.case === "acc" ? "noun.case.acc"
    : null;
  if (caseSlot && lang.grammar.hasCase) {
    const p = lang.morphology.paradigms[caseSlot];
    if (p) headForm = inflect(headForm, p, lang, meaning);
  }
  if (np.determiner && (np.determiner.lemma === "the" || np.determiner.lemma === "a" || np.determiner.lemma === "an")) {
    const articleLemma = np.determiner.lemma === "an" ? "a" : np.determiner.lemma;
    const af = closedClassForm(lang, articleLemma) ?? [];
    if (ctx.articlePresence === "enclitic") headForm = [...headForm, ...af];
    else if (ctx.articlePresence === "proclitic") headForm = [...af, ...headForm];
  }
  const head: RealisedToken = {
    surface: np.head.baseForm.length === 0
      ? `“${np.head.lemma}”`
      : headForm.join(""),
    form: np.head.baseForm.length === 0 ? [] : headForm,
    english: np.head.lemma,
    role,
    resolution: np.head.resolution,
  };

  const detTokens: RealisedToken[] = [];
  if (np.determiner) {
    const lemma = np.determiner.lemma;
    if (lemma === "the" || lemma === "a" || lemma === "an") {
      if (ctx.articlePresence === "free") {
        const af = closedClassForm(lang, lemma === "an" ? "a" : lemma) ?? [];
        if (af.length > 0) {
          detTokens.push({ surface: af.join(""), form: af, english: lemma, role: "DET" });
        }
      }
    } else {
      const df = closedClassForm(lang, lemma) ?? [];
      if (df.length > 0) {
        detTokens.push({ surface: df.join(""), form: df, english: lemma, role: "DET" });
      }
    }
  }

  const adjTokens: RealisedToken[] = np.adjectives.map((a) => {
    let af = a.baseForm;
    if (np.head.number === "pl") {
      const p = lang.morphology.paradigms["adj.num.pl"];
      if (p) af = inflect(af, p, lang, a.lemma);
    }
    if (a.degree === "comparative") {
      const p = lang.morphology.paradigms["adj.degree.cmp"];
      if (p) af = inflect(af, p, lang, a.lemma);
    } else if (a.degree === "superlative") {
      const p = lang.morphology.paradigms["adj.degree.sup"];
      if (p) af = inflect(af, p, lang, a.lemma);
    }
    return {
      surface: a.baseForm.length === 0 ? `“${a.lemma}”` : af.join(""),
      form: a.baseForm.length === 0 ? [] : af,
      english: a.lemma,
      role: "ADJ" as const,
      resolution: a.resolution,
    };
  });
  const numTokens: RealisedToken[] = np.numeral
    ? (() => {
        const lex = lang.lexicon[np.numeral!.lemma];
        const nf = lex ?? closedClassForm(lang, np.numeral!.lemma) ?? [];
        const out: RealisedToken[] = [];
        if (nf.length > 0) {
          out.push({
            surface: nf.join(""),
            form: nf,
            english: np.numeral!.lemma,
            role: "NUM" as const,
            resolution: lex ? "direct" : "concept",
          });
          if (lang.grammar.classifierSystem) {
            const cf = closedClassForm(lang, "CLF") ?? [];
            if (cf.length > 0) {
              out.push({
                surface: cf.join(""),
                form: cf,
                english: "CLF",
                role: "NUM" as const,
                resolution: "concept",
              });
            }
          }
        }
        return out;
      })()
    : [];
  const possTokens: RealisedToken[] = np.possessor
    ? realiseNP(np.possessor, lang, ctx, "POSS")
    : [];
  const ppTokens: RealisedToken[] = np.pps.flatMap((pp) => realisePP(pp, lang, ctx));

  const out: RealisedToken[] = [];
  if (ctx.adjPos === "pre") {
    out.push(...detTokens);
    if (ctx.numPos === "pre") out.push(...numTokens);
    if (ctx.possPos === "pre") out.push(...possTokens);
    out.push(...adjTokens);
    out.push(head);
    if (ctx.numPos === "post") out.push(...numTokens);
    if (ctx.possPos === "post") out.push(...possTokens);
  } else {
    out.push(...detTokens);
    out.push(head);
    out.push(...adjTokens);
    if (ctx.numPos === "post") out.push(...numTokens);
    if (ctx.possPos === "post") out.push(...possTokens);
    if (ctx.numPos === "pre") out.push(...numTokens);
    if (ctx.possPos === "pre") out.push(...possTokens);
  }
  out.push(...ppTokens);
  if (np.coord) {
    const cf = closedClassForm(lang, np.coord.lemma) ?? [];
    if (cf.length > 0) {
      out.push({
        surface: cf.join(""),
        form: cf,
        english: np.coord.lemma,
        role: "DET" as const,
        resolution: "concept",
      });
    }
    out.push(...realiseNP(np.coord.np, lang, ctx, role));
  }
  return out;
}

function realisePP(pp: PP, lang: Language, ctx: NPCtx): RealisedToken[] {
  const npTokens = realiseNP(pp.np, lang, ctx, "PP-NP");
  if (ctx.caseStrategy === "case") return npTokens;
  const pf = closedClassForm(lang, pp.prep.lemma) ?? [];
  if (pf.length === 0) return npTokens;
  if (ctx.caseStrategy === "postposition") {
    return [...npTokens, { surface: pf.join(""), form: pf, english: pp.prep.lemma, role: "POSTP" }];
  }
  return [{ surface: pf.join(""), form: pf, english: pp.prep.lemma, role: "PREP" }, ...npTokens];
}

function realiseVerb(
  vp: VP,
  lang: Language,
  negated: boolean,
  negPos: NonNullable<Language["grammar"]["negationPosition"]>,
  incorporatedRoot: WordForm | null,
): RealisedToken[] {
  let form = vp.verb.baseForm;
  const meaning = vp.verb.lemma;
  const isZeroCopula = vp.verb.lemma === "be" && form.length === 0;

  if (incorporatedRoot && incorporatedRoot.length > 0) {
    form = [...incorporatedRoot, ...form];
  }

  const stack: import("../morphology/types").MorphCategory[] = [];
  const tenseCat: MorphCategory | null =
    vp.verb.tense === "past" ? "verb.tense.past" :
    vp.verb.tense === "future" ? "verb.tense.fut" : null;
  if (tenseCat) stack.push(tenseCat);
  const aspectCat: MorphCategory | null =
    vp.verb.aspect === "perfective" ? "verb.aspect.pfv" :
    vp.verb.aspect === "imperfective" ? "verb.aspect.ipfv" :
    vp.verb.aspect === "progressive" ? "verb.aspect.prog" : null;
  if (aspectCat) stack.push(aspectCat);
  const moodCat: MorphCategory | null =
    vp.verb.mood === "subjunctive" ? "verb.mood.subj" :
    vp.verb.mood === "imperative" ? "verb.mood.imp" : null;
  if (moodCat) stack.push(moodCat);
  if (vp.verb.voice === "passive") stack.push("verb.voice.pass");

  const ps = vp.verb.subjectPerson;
  const ns = vp.verb.subjectNumber;
  if (ps && ns) {
    const cat = `verb.person.${ps}${ns}` as MorphCategory;
    if (lang.morphology.paradigms[cat]) {
      stack.push(cat);
    } else if (ps === "3" && ns === "sg" && lang.morphology.paradigms["verb.person.3sg"]) {
      stack.push("verb.person.3sg");
    }
  }

  const synth = lang.grammar.synthesisIndex ?? 2.0;
  const cap = Math.max(1, Math.round(synth));
  const applied = stack.slice(0, cap);

  const fusion = lang.grammar.fusionIndex ?? 0.5;
  for (const cat of applied) {
    const p = lang.morphology.paradigms[cat];
    if (!p) continue;
    const before = form;
    form = inflect(before, p, lang, meaning);
    if (fusion >= 0.7 && p.position === "suffix") {
      while (
        form.length >= 2 &&
        form[form.length - p.affix.length - 1] === p.affix[0]
      ) {
        form.splice(form.length - p.affix.length, 0);
        break;
      }
      const seam = before.length;
      if (seam > 0 && seam < form.length && form[seam - 1] === form[seam]) {
        form.splice(seam, 1);
      }
    }
  }

  if (negated) {
    if (isZeroCopula) {
      const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
      return [{ surface: negForm.join(""), form: negForm, english: "not", role: "NEG", resolution: "concept" }];
    }
    if (negPos === "prefix" || negPos === "suffix") {
      const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
      form = negPos === "prefix" ? [...negForm, ...form] : [...form, ...negForm];
      return [{ surface: form.join(""), form, english: vp.verb.lemma, role: "V", resolution: vp.verb.resolution }];
    }
    const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
    const verbTok: RealisedToken = { surface: form.join(""), form, english: vp.verb.lemma, role: "V", resolution: vp.verb.resolution };
    const negTok: RealisedToken = { surface: negForm.join(""), form: negForm, english: "not", role: "NEG", resolution: "concept" };
    return negPos === "pre-verb" ? [negTok, verbTok] : [verbTok, negTok];
  }
  if (isZeroCopula) return [];
  const verbSurface = vp.verb.baseForm.length === 0 && form.length === 0
    ? `“${vp.verb.lemma}”`
    : form.join("");
  return [{
    surface: verbSurface,
    form: vp.verb.baseForm.length === 0 && form.length === 0 ? [] : form,
    english: vp.verb.lemma,
    role: "V",
    resolution: vp.verb.resolution,
  }];
}

function populateForms(s: Sentence, deps: RealiseDeps): void {
  const visitNP = (np: NP) => {
    const r = deps.resolveOpen(np.head.lemma);
    if (r.form) np.head.baseForm = r.form;
    np.head.resolution = r.resolution;
    for (const a of np.adjectives) {
      const ar = deps.resolveOpen(a.lemma);
      if (ar.form) a.baseForm = ar.form;
      a.resolution = ar.resolution;
    }
    if (np.possessor) visitNP(np.possessor);
    for (const pp of np.pps) visitNP(pp.np);
    if (np.coord) visitNP(np.coord.np);
  };
  visitNP(s.subject);
  if (s.predicate.object) visitNP(s.predicate.object);
  for (const pp of s.predicate.pps) visitNP(pp.np);
  for (const a of s.predicate.adverbs) {
    const ar = deps.resolveOpen(a.lemma);
    if (ar.form) a.baseForm = ar.form;
    a.resolution = ar.resolution;
  }
  for (const c of s.predicate.complement ?? []) {
    const cr = deps.resolveOpen(c.lemma);
    if (cr.form) c.baseForm = cr.form;
    c.resolution = cr.resolution;
  }
  const vr = deps.resolveOpen(s.predicate.verb.lemma);
  if (vr.form) s.predicate.verb.baseForm = vr.form;
  s.predicate.verb.resolution = vr.resolution;
}
