import type { Language, WordForm } from "../types";
import { inflect, inflectCascade } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";
import { reduplicate } from "../morphology/reduplication";
import { pluralClassOf } from "../lexicon/nounClass";
import { closedClassForm } from "./closedClass";
import { fnv1a } from "../rng";
import type { NP, PP, Sentence, VP } from "./syntax";
import { sliceOrder } from "./wordOrder";
import { classifierMeaningFor } from "./classifiers";

export interface RealisedToken {
  surface: string;
  form: WordForm;
  english: string;
  role: "S" | "V" | "AUX" | "O" | "ADJ" | "DET" | "PREP" | "POSTP" | "POSS" | "NUM" | "NEG" | "ADV" | "PP-NP";
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
  const alignment = lang.grammar.alignment ?? "nom-acc";
  const obj = s.predicate.object;
  const transitive = !!obj;
  const subjectCaseSlot: import("../morphology/types").MorphCategory | null = alignmentSubjectCase(alignment, transitive);
  const objectCaseSlot: import("../morphology/types").MorphCategory | null = alignmentObjectCase(alignment, transitive);

  const subject = realiseNP(s.subject, lang, {
    articlePresence, caseStrategy, adjPos, possPos, numPos,
    subjectCaseSlot, objectCaseSlot,
  }, "S");
  // Phase 36 Tranche 36b: relay the subject's noun-class to the VP
  // so the verb realiser picks the matching agreement marker.
  if (s.subject.head.nounClass !== undefined) {
    s.predicate.subjectNounClass = s.subject.head.nounClass;
  }
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
        subjectCaseSlot, objectCaseSlot,
      }, "O");
  const verbTokens = realiseVerb(s.predicate, lang, s.negated, negPos, incorporatedRoot);
  const predPpTokens = s.predicate.pps.flatMap((pp) =>
    realisePP(pp, lang, { articlePresence, caseStrategy, adjPos, possPos, numPos, subjectCaseSlot, objectCaseSlot }),
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
    const relStrategy = lang.grammar.relativeClauseStrategy ?? "relativizer";
    if (relStrategy !== "internal-headed") {
      const lemma =
        relStrategy === "gap" && (s.leadingWh.lemma === "who" || s.leadingWh.lemma === "that" || s.leadingWh.lemma === "which")
          ? null
          : s.leadingWh.lemma;
      if (lemma) {
        const wf = closedClassForm(lang, lemma) ?? [];
        if (wf.length > 0) {
          out.push({
            surface: wf.join(""),
            form: wf,
            english: lemma,
            role: "DET",
            resolution: "concept",
          });
        }
      }
    }
  }
  if (s.leadingConj) {
    const isAnd = s.leadingConj.lemma === "and";
    const dropForSVC = isAnd && !!lang.grammar.serialVerbConstructions;
    if (!dropForSVC) {
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
    const qPdm = lang.morphology.paradigms["discourse.q"];
    const qf = qPdm?.affix ?? closedClassForm(lang, "Q") ?? [];
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
  subjectCaseSlot?: import("../morphology/types").MorphCategory | null;
  objectCaseSlot?: import("../morphology/types").MorphCategory | null;
}

function alignmentSubjectCase(
  alignment: NonNullable<Language["grammar"]["alignment"]>,
  transitive: boolean,
): import("../morphology/types").MorphCategory | null {
  switch (alignment) {
    case "erg-abs":
      return transitive ? "noun.case.erg" : "noun.case.abs";
    case "tripartite":
      return transitive ? "noun.case.erg" : "noun.case.abs";
    case "split-S":
      return transitive ? "noun.case.erg" : null;
    case "nom-acc":
    default:
      return null;
  }
}

function alignmentObjectCase(
  alignment: NonNullable<Language["grammar"]["alignment"]>,
  transitive: boolean,
): import("../morphology/types").MorphCategory | null {
  if (!transitive) return null;
  switch (alignment) {
    case "erg-abs":
      return "noun.case.abs";
    case "tripartite":
      return "noun.case.acc";
    case "split-S":
      return "noun.case.acc";
    case "nom-acc":
    default:
      return "noun.case.acc";
  }
}

function realiseNP(
  np: NP,
  lang: Language,
  ctx: NPCtx,
  role: "S" | "O" | "PP-NP" | "POSS",
): RealisedToken[] {
  let headForm = np.head.baseForm;
  const meaning = np.head.lemma;
  // Phase 36 Tranche 36b: Bantu-style noun-class prefix. Resolve the
  // class for this meaning, swap to the plural class when number ===
  // "pl", and prefix the corresponding paradigm before number/case
  // affixes. Languages without a class system (no nounClassAssignments)
  // skip this entirely.
  let nounClass: 1|2|3|4|5|6|7|8 | undefined = lang.nounClassAssignments?.[meaning];
  if (nounClass !== undefined && np.head.number === "pl") {
    nounClass = pluralClassOf(nounClass);
  }
  if (nounClass !== undefined) {
    np.head.nounClass = nounClass;
    const cat = `noun.class.${nounClass}` as const;
    const p = lang.morphology.paradigms[cat];
    if (p) headForm = inflect(headForm, p, lang, meaning);
  }
  if (np.head.number === "pl" && lang.grammar.pluralMarking === "affix") {
    const p = lang.morphology.paradigms["noun.num.pl"];
    if (p) headForm = inflect(headForm, p, lang, meaning);
  } else if (np.head.number === "pl" && lang.grammar.pluralMarking === "reduplication") {
    headForm = reduplicate(headForm, "partial-initial");
  }
  let caseSlot: import("../morphology/types").MorphCategory | null = null;
  if (role === "POSS") caseSlot = "noun.case.gen";
  else if (role === "S") caseSlot = ctx.subjectCaseSlot ?? null;
  else if (role === "O") caseSlot = ctx.objectCaseSlot ?? (np.head.case === "acc" ? "noun.case.acc" : null);
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
      if (lang.grammar.pluralMarking === "reduplication") {
        af = reduplicate(af, "partial-initial");
      } else {
        const p = lang.morphology.paradigms["adj.num.pl"];
        if (p) af = inflect(af, p, lang, a.lemma);
      }
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
            const clfMeaning = classifierMeaningFor(np.head.lemma, lang.grammar.classifierTable);
            const clfForm = lang.lexicon[clfMeaning] ?? closedClassForm(lang, "CLF") ?? [];
            if (clfForm.length > 0) {
              out.push({
                surface: clfForm.join(""),
                form: clfForm,
                english: `CLF:${clfMeaning}`,
                role: "NUM" as const,
                resolution: lang.lexicon[clfMeaning] ? "direct" : "concept",
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
    // Phase 30 Tranche 30f: ensure a coordinator is always emitted.
    // Pre-fix, when closedClassForm returned empty (rare but
    // possible after heavy phonological erosion), the coordinated
    // NP rendered as bare juxtaposition ("the bull the wolf"
    // instead of "the bull and the wolf"). Now we fall back to
    // lang.lexicon[lemma] (if present) and finally to the lemma
    // itself as a single-segment placeholder so every coordination
    // shows a separator.
    let cf = closedClassForm(lang, np.coord.lemma) ?? [];
    if (cf.length === 0 && lang.lexicon[np.coord.lemma]) {
      cf = lang.lexicon[np.coord.lemma]!.slice();
    }
    if (cf.length === 0) {
      cf = [np.coord.lemma];
    }
    out.push({
      surface: cf.join(""),
      form: cf,
      english: np.coord.lemma,
      role: "DET" as const,
      resolution: "concept",
    });
    out.push(...realiseNP(np.coord.np, lang, ctx, role));
  }
  if (np.relative) {
    return attachRelativeClause(out, np, lang, ctx, role);
  }
  return out;
}

function attachRelativeClause(
  npTokens: RealisedToken[],
  np: NP,
  lang: Language,
  ctx: NPCtx,
  role: "S" | "O" | "PP-NP" | "POSS",
): RealisedToken[] {
  const rc = np.relative;
  if (!rc) return npTokens;
  const strategy = lang.grammar.relativeClauseStrategy ?? "relativizer";

  const stripped: NP = { ...np, relative: undefined };
  const fakeS: Sentence = {
    kind: "S",
    subject: stripped,
    predicate: rc.predicate,
    negated: false,
  };
  const relRaw = realiseSentenceInner(fakeS, lang, ctx);
  const relTokens = rc.subjectGap && (strategy === "gap" || strategy === "relativizer")
    ? relRaw.filter((t) => t.role !== "S")
    : relRaw;
  const relizerForm = closedClassForm(lang, rc.relativizer) ?? [];
  const relizerTok: RealisedToken | null = relizerForm.length > 0
    ? {
        surface: relizerForm.join(""),
        form: relizerForm,
        english: rc.relativizer,
        role: "DET",
        resolution: "concept",
      }
    : null;

  switch (strategy) {
    case "internal-headed":
      return relTokens;
    case "relativizer": {
      const merged = [...relTokens];
      if (relizerTok) merged.push(relizerTok);
      return [...merged, ...npTokens];
    }
    case "resumptive": {
      const resumptiveLemma = pickResumptivePronoun(np, role);
      const resumptive = lang.lexicon[resumptiveLemma] ?? closedClassForm(lang, resumptiveLemma) ?? [];
      const insertion: RealisedToken[] = resumptive.length > 0
        ? [{ surface: resumptive.join(""), form: resumptive, english: `RESUMP:${resumptiveLemma}`, role: "PP-NP", resolution: "concept" }]
        : [{ surface: `“${resumptiveLemma}”`, form: [], english: `RESUMP:${resumptiveLemma}`, role: "PP-NP", resolution: "fallback" }];
      return [...npTokens, ...(relizerTok ? [relizerTok] : []), ...insertion, ...relTokens];
    }
    case "gap":
    default:
      return [...npTokens, ...(relizerTok ? [relizerTok] : []), ...relTokens];
  }
}

function pickResumptivePronoun(
  np: NP,
  role: "S" | "O" | "PP-NP" | "POSS",
): string {
  const subj = role === "S";
  if (np.head.number === "pl") return subj ? "they" : "them";
  const person = np.head.person ?? "3";
  if (person === "1") return "i";
  if (person === "2") return "you";
  if (np.head.isPronoun) {
    const lemma = np.head.lemma.toLowerCase();
    if (lemma === "he" || lemma === "him") return subj ? "he" : "him";
    if (lemma === "she" || lemma === "her") return subj ? "she" : "her";
    if (lemma === "it") return "it";
  }
  return subj ? "he" : "him";
}

function realiseSentenceInner(
  s: Sentence,
  lang: Language,
  parentCtx: NPCtx,
): RealisedToken[] {
  void parentCtx;
  return realiseSentence(s, lang, {
    resolveOpen: (lemma) => {
      const form = lang.lexicon[lemma];
      return { form: form ?? null, resolution: form ? "direct" : "fallback" };
    },
  });
}

function realisePP(pp: PP, lang: Language, ctx: NPCtx): RealisedToken[] {
  const npTokens = realiseNP(pp.np, lang, ctx, "PP-NP");
  if (ctx.caseStrategy === "case") return npTokens;
  const pf = closedClassForm(lang, pp.prep.lemma) ?? [];
  if (pf.length === 0) return npTokens;
  // Phase 29 Tranche 4h: realise the "mixed" caseStrategy. Per
  // (lang, prep) lemma pair, pick prep vs. postp deterministically
  // by hashing — so a "mixed" language ends up with stable per-prep
  // assignments (e.g. /at/ pre-N, /of/ post-N) rather than flipping
  // randomly. Mirrors real mixed-typology languages (Persian: prep
  // dominant + a few postpositions; Akkadian: postp dominant + a
  // few preps).
  const isPostposition =
    ctx.caseStrategy === "postposition" ||
    (ctx.caseStrategy === "mixed" && fnv1a(`${lang.id}::pp::${pp.prep.lemma}`) % 2 === 0);
  if (isPostposition) {
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

  // Phase 34 Tranche 34c: periphrastic future / perfect. When the
  // language has flipped to a periphrastic strategy, emit the
  // auxiliary as a separate token BEFORE the main verb and skip the
  // synthetic affix. Real-world: English "will go" / "going to go",
  // Spanish "voy a ir", Romance haber-perfect.
  const futureRealisation = lang.grammar.futureRealisation ?? "synthetic";
  const perfectRealisation = lang.grammar.perfectRealisation ?? "synthetic";
  let auxiliaryTokens: RealisedToken[] = [];
  let useSyntheticTense = true;
  let useSyntheticPerfect = true;
  if (vp.verb.tense === "future" && futureRealisation !== "synthetic") {
    const auxLemma =
      futureRealisation === "go-future" ? "go" :
      futureRealisation === "will-future" ? "will" :
      futureRealisation === "shall-future" ? "shall" : null;
    if (auxLemma) {
      const auxForm =
        lang.lexicon[auxLemma] ?? closedClassForm(lang, auxLemma) ?? null;
      if (auxForm && auxForm.length > 0) {
        auxiliaryTokens.push({
          surface: auxForm.join(""),
          form: auxForm.slice(),
          english: auxLemma,
          role: "AUX",
          resolution: "concept",
        });
        useSyntheticTense = false;
      }
    }
  }
  if (vp.verb.aspect === "perfect" && perfectRealisation !== "synthetic") {
    const auxLemma = perfectRealisation === "have-perfect" ? "have" : "be";
    const auxForm =
      lang.lexicon[auxLemma] ?? closedClassForm(lang, auxLemma) ?? null;
    if (auxForm && auxForm.length > 0) {
      auxiliaryTokens.push({
        surface: auxForm.join(""),
        form: auxForm.slice(),
        english: auxLemma,
        role: "AUX",
        resolution: "concept",
      });
      useSyntheticPerfect = false;
    }
  }

  const tenseCat: MorphCategory | null =
    vp.verb.tense === "past" ? "verb.tense.past" :
    vp.verb.tense === "future" && useSyntheticTense ? "verb.tense.fut" : null;
  if (tenseCat) stack.push(tenseCat);
  const aspectCat: MorphCategory | null =
    vp.verb.aspect === "perfective" ? "verb.aspect.pfv" :
    vp.verb.aspect === "imperfective" ? "verb.aspect.ipfv" :
    vp.verb.aspect === "progressive" ? "verb.aspect.prog" :
    vp.verb.aspect === "habitual" ? "verb.aspect.hab" :
    vp.verb.aspect === "perfect" && useSyntheticPerfect ? "verb.aspect.perf" :
    vp.verb.aspect === "prospective" ? "verb.aspect.prosp" : null;
  if (aspectCat) stack.push(aspectCat);
  const moodCat: MorphCategory | null =
    vp.verb.mood === "subjunctive" ? "verb.mood.subj" :
    vp.verb.mood === "imperative" ? "verb.mood.imp" :
    vp.verb.mood === "conditional" ? "verb.mood.cond" :
    vp.verb.mood === "optative" ? "verb.mood.opt" :
    vp.verb.mood === "jussive" ? "verb.mood.jus" :
    vp.verb.mood === "irrealis" ? "verb.mood.irr" :
    vp.verb.mood === "dubitative" ? "verb.mood.dub" :
    vp.verb.mood === "hortative" ? "verb.mood.hort" : null;
  if (moodCat) stack.push(moodCat);
  if (vp.verb.voice === "passive") stack.push("verb.voice.pass");

  const evidMode = lang.grammar.evidentialMarking ?? "none";
  if (evidMode !== "none" && vp.verb.evidential) {
    const evidCat: MorphCategory | null =
      vp.verb.evidential === "direct" ? "verb.evid.dir" :
      vp.verb.evidential === "reportative" ? "verb.evid.rep" :
      vp.verb.evidential === "inferred" ? "verb.evid.inf" : null;
    if (evidCat && (evidMode === "three-way" || evidCat === "verb.evid.dir")) {
      stack.push(evidCat);
    }
  }

  if (vp.verb.honorific && lang.grammar.politenessRegister && lang.grammar.politenessRegister !== "none") {
    stack.push("verb.honor.formal");
  }

  if (lang.grammar.classifierSystem) {
    const matchPdm = lang.morphology.paradigms["verb.cls.match"];
    if (matchPdm) stack.push("verb.cls.match");
  }
  // Phase 36 Tranche 36b: subject-driven noun-class agreement on the
  // verb. When the subject NP carries a class (set by realiseNP) and
  // a matching `verb.cls.N` paradigm exists, push that category onto
  // the inflection stack so the verb prefixes the agreement marker.
  const subjClass = vp.subjectNounClass;
  if (subjClass !== undefined) {
    const cat = `verb.cls.${subjClass}` as MorphCategory;
    if (lang.morphology.paradigms[cat]) stack.push(cat);
  }

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

  form = inflectCascade(form, stack, lang, meaning).form;

  if (negated) {
    if (isZeroCopula) {
      const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
      return [{ surface: negForm.join(""), form: negForm, english: "not", role: "NEG", resolution: "concept" }];
    }
    if (negPos === "prefix" || negPos === "suffix") {
      const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
      form = negPos === "prefix" ? [...negForm, ...form] : [...form, ...negForm];
      return [...auxiliaryTokens, { surface: form.join(""), form, english: vp.verb.lemma, role: "V", resolution: vp.verb.resolution }];
    }
    const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
    const verbTok: RealisedToken = { surface: form.join(""), form, english: vp.verb.lemma, role: "V", resolution: vp.verb.resolution };
    const negTok: RealisedToken = { surface: negForm.join(""), form: negForm, english: "not", role: "NEG", resolution: "concept" };
    return negPos === "pre-verb"
      ? [...auxiliaryTokens, negTok, verbTok]
      : [...auxiliaryTokens, verbTok, negTok];
  }
  if (isZeroCopula) return auxiliaryTokens;
  const verbSurface = vp.verb.baseForm.length === 0 && form.length === 0
    ? `“${vp.verb.lemma}”`
    : form.join("");
  return [
    ...auxiliaryTokens,
    {
      surface: verbSurface,
      form: vp.verb.baseForm.length === 0 && form.length === 0 ? [] : form,
      english: vp.verb.lemma,
      role: "V",
      resolution: vp.verb.resolution,
    },
  ];
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
