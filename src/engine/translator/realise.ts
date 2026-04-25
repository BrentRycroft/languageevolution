import type { Language, WordForm } from "../types";
import { inflect } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";
import { closedClassForm } from "./closedClass";
import type { NP, PP, Sentence, VP } from "./syntax";

/**
 * Walk a parsed Sentence and emit a sequence of target-language
 * surface forms, applying language-specific:
 *
 *   - subject-verb agreement (verb.person.* paradigm choice)
 *   - adjective placement (pre- or post-noun)
 *   - possessor placement (pre- or post-noun)
 *   - numeral placement
 *   - article placement (free / enclitic / proclitic / drop)
 *   - PP order (prep+NP for `preposition`, NP+postp for `postposition`)
 *   - negation insertion (pre-verb / post-verb / morphological)
 *   - prodrop (omit subject pronoun when the verb's agreement is
 *              unambiguous)
 *   - top-level S/V/O ordering
 *
 * Each emitted token carries its surface string plus an `english` tag
 * (for gloss display). `resolveLemma` is supplied by the caller so this
 * module stays decoupled from the open-class lookup chain.
 */

export interface RealisedToken {
  surface: string;
  english: string;
  /** Tag used by the gloss / debug view. */
  role: "S" | "V" | "O" | "ADJ" | "DET" | "PREP" | "POSTP" | "POSS" | "NUM" | "NEG" | "ADV" | "PP-NP";
  /** How the open-class lemma resolved (direct / colex / fallback /
   *  concept). Closed-class tokens are tagged "concept" because they
   *  come from the per-language closed-class table, not the lexicon. */
  resolution?: "direct" | "concept" | "colex" | "reverse-colex" | "fallback";
}

export type LemmaResolution = "direct" | "concept" | "colex" | "reverse-colex" | "fallback";

export interface RealiseDeps {
  /** Resolve a lemma to a target form via the open-class chain. */
  resolveOpen: (lemma: string) => { form: WordForm | null; resolution: LemmaResolution };
}

export function realiseSentence(
  s: Sentence,
  lang: Language,
  deps: RealiseDeps,
): RealisedToken[] {
  // Resolve every leaf lemma up front so subsequent realisation steps
  // can compose freely.
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
  const objectTokens = s.predicate.object
    ? realiseNP(s.predicate.object, lang, {
        articlePresence, caseStrategy, adjPos, possPos, numPos,
      }, "O")
    : [];
  const verbTokens = realiseVerb(s.predicate, lang, s.negated, negPos);
  const predPpTokens = s.predicate.pps.flatMap((pp) =>
    realisePP(pp, lang, { articlePresence, caseStrategy, adjPos, possPos, numPos }),
  );
  const advTokens: RealisedToken[] = s.predicate.adverbs.flatMap((a) => {
    if (a.baseForm.length === 0) return [];
    return [{
      surface: a.baseForm.join(""),
      english: a.lemma,
      role: "ADV" as const,
      resolution: a.resolution,
    }];
  });

  // Prodrop: if the language drops pronouns and the subject is a
  // pronoun (rather than a real noun), and the verb's agreement is
  // marked, omit the subject.
  const dropSubject =
    prodrop &&
    s.subject.head.isPronoun &&
    !!lang.morphology.paradigms[
      `verb.person.${s.subject.head.person ?? "3"}${s.subject.head.number}` as MorphCategory
    ];
  const subjectFinal = dropSubject ? [] : subject;

  // Top-level S/V/O ordering. PPs and adverbs follow the predicate
  // wherever it lands.
  const order = sliceOrder(lang.grammar.wordOrder);
  const slot: Record<"S" | "V" | "O", RealisedToken[]> = {
    S: subjectFinal,
    V: verbTokens,
    O: objectTokens,
  };
  const out: RealisedToken[] = [];
  for (const k of order) out.push(...slot[k]);
  out.push(...predPpTokens);
  out.push(...advTokens);
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
  role: "S" | "O" | "PP-NP",
): RealisedToken[] {
  // Inflect the head form for case + number.
  let headForm = np.head.baseForm;
  const meaning = np.head.lemma;
  if (np.head.number === "pl" && lang.grammar.pluralMarking === "affix") {
    const p = lang.morphology.paradigms["noun.num.pl"];
    if (p) headForm = inflect(headForm, p, lang, meaning);
  }
  if (np.head.case === "acc" && lang.grammar.hasCase) {
    const p = lang.morphology.paradigms["noun.case.acc"];
    if (p) headForm = inflect(headForm, p, lang, meaning);
  }
  // Article attachment (enclitic / proclitic) on the head form.
  if (np.determiner && (np.determiner.lemma === "the" || np.determiner.lemma === "a" || np.determiner.lemma === "an")) {
    const articleLemma = np.determiner.lemma === "an" ? "a" : np.determiner.lemma;
    const af = closedClassForm(lang, articleLemma) ?? [];
    if (ctx.articlePresence === "enclitic") headForm = [...headForm, ...af];
    else if (ctx.articlePresence === "proclitic") headForm = [...af, ...headForm];
  }
  const head: RealisedToken = {
    surface: headForm.join(""),
    english: np.head.lemma,
    role,
    resolution: np.head.resolution,
  };

  // Free-article emission (handled separately from enclitic/proclitic).
  const detTokens: RealisedToken[] = [];
  if (np.determiner) {
    const lemma = np.determiner.lemma;
    if (lemma === "the" || lemma === "a" || lemma === "an") {
      if (ctx.articlePresence === "free") {
        const af = closedClassForm(lang, lemma === "an" ? "a" : lemma) ?? [];
        if (af.length > 0) {
          detTokens.push({ surface: af.join(""), english: lemma, role: "DET" });
        }
      }
    } else {
      // Non-article determiners (this/that/my/your) always emit.
      const df = closedClassForm(lang, lemma) ?? [];
      if (df.length > 0) {
        detTokens.push({ surface: df.join(""), english: lemma, role: "DET" });
      }
    }
  }

  const adjTokens: RealisedToken[] = np.adjectives.map((a) => ({
    surface: a.baseForm.join(""),
    english: a.lemma,
    role: "ADJ" as const,
    resolution: a.resolution,
  }));
  const numTokens: RealisedToken[] = np.numeral
    ? (() => {
        const nf = closedClassForm(lang, np.numeral!.lemma) ?? [];
        return nf.length > 0
          ? [{ surface: nf.join(""), english: np.numeral!.lemma, role: "NUM" as const }]
          : [];
      })()
    : [];
  const possTokens: RealisedToken[] = np.possessor
    ? realiseNP(np.possessor, lang, ctx, "PP-NP").map((t) => ({ ...t, role: "POSS" as const }))
    : [];
  const ppTokens: RealisedToken[] = np.pps.flatMap((pp) => realisePP(pp, lang, ctx));

  // Compose: pre-modifiers in reading order (DET, NUM, ADJ, POSS, then HEAD)
  // or post-modifiers (HEAD then …) per language.
  const out: RealisedToken[] = [];
  // Determiners always lead in pre-modifier languages, follow head in
  // post-modifier languages; we keep them with the adjective bundle.
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
  return out;
}

function realisePP(pp: PP, lang: Language, ctx: NPCtx): RealisedToken[] {
  const npTokens = realiseNP(pp.np, lang, ctx, "PP-NP");
  // Preposition emission gated by case strategy.
  if (ctx.caseStrategy === "case") return npTokens; // case marking on NP only
  const pf = closedClassForm(lang, pp.prep.lemma) ?? [];
  if (pf.length === 0) return npTokens;
  if (ctx.caseStrategy === "postposition") {
    return [...npTokens, { surface: pf.join(""), english: pp.prep.lemma, role: "POSTP" }];
  }
  // preposition or mixed → emit as preposition.
  return [{ surface: pf.join(""), english: pp.prep.lemma, role: "PREP" }, ...npTokens];
}

function realiseVerb(
  vp: VP,
  lang: Language,
  negated: boolean,
  negPos: NonNullable<Language["grammar"]["negationPosition"]>,
): RealisedToken[] {
  let form = vp.verb.baseForm;
  const meaning = vp.verb.lemma;
  // Tense
  const tenseCat: MorphCategory | null =
    vp.verb.tense === "past" ? "verb.tense.past" :
    vp.verb.tense === "future" ? "verb.tense.fut" : null;
  if (tenseCat) {
    const p = lang.morphology.paradigms[tenseCat];
    if (p) form = inflect(form, p, lang, meaning);
  }
  // Subject-verb agreement: pick the most-specific person+number paradigm.
  const ps = vp.verb.subjectPerson;
  const ns = vp.verb.subjectNumber;
  if (ps && ns) {
    const cat = `verb.person.${ps}${ns}` as MorphCategory;
    const p = lang.morphology.paradigms[cat];
    if (p) form = inflect(form, p, lang, meaning);
    else if (ps === "3" && ns === "sg") {
      // Fallback: legacy 3sg paradigm.
      const p3 = lang.morphology.paradigms["verb.person.3sg"];
      if (p3) form = inflect(form, p3, lang, meaning);
    }
  }
  // Negation.
  if (negated) {
    if (negPos === "prefix" || negPos === "suffix") {
      const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
      form = negPos === "prefix" ? [...negForm, ...form] : [...form, ...negForm];
      return [{ surface: form.join(""), english: vp.verb.lemma, role: "V", resolution: vp.verb.resolution }];
    }
    const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
    const verbTok: RealisedToken = { surface: form.join(""), english: vp.verb.lemma, role: "V", resolution: vp.verb.resolution };
    const negTok: RealisedToken = { surface: negForm.join(""), english: "not", role: "NEG", resolution: "concept" };
    return negPos === "pre-verb" ? [negTok, verbTok] : [verbTok, negTok];
  }
  return [{ surface: form.join(""), english: vp.verb.lemma, role: "V", resolution: vp.verb.resolution }];
}

function sliceOrder(wo: Language["grammar"]["wordOrder"]): Array<"S" | "V" | "O"> {
  switch (wo) {
    case "SOV": return ["S", "O", "V"];
    case "SVO": return ["S", "V", "O"];
    case "VSO": return ["V", "S", "O"];
    case "VOS": return ["V", "O", "S"];
    case "OVS": return ["O", "V", "S"];
    case "OSV": return ["O", "S", "V"];
  }
}

/**
 * Resolve every leaf form in the sentence via the deps.resolveOpen
 * callback. Mutates the tree in place AND records the resolution kind
 * on each leaf node so realisation can stamp it onto the emitted
 * RealisedToken (preserves "direct" vs "fallback" gloss state). Lemmas
 * with no dictionary resolution get an empty form — the caller surfaces
 * those via the `missing` list (see translateSentence).
 */
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
  };
  visitNP(s.subject);
  if (s.predicate.object) visitNP(s.predicate.object);
  for (const pp of s.predicate.pps) visitNP(pp.np);
  for (const a of s.predicate.adverbs) {
    const ar = deps.resolveOpen(a.lemma);
    if (ar.form) a.baseForm = ar.form;
    a.resolution = ar.resolution;
  }
  const vr = deps.resolveOpen(s.predicate.verb.lemma);
  if (vr.form) s.predicate.verb.baseForm = vr.form;
  s.predicate.verb.resolution = vr.resolution;
}
