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
  // Noun incorporation (polysynthetic): when `incorporates` is on AND
  // the object NP is a bare noun (no determiner, adjectives, possessor,
  // PPs), the object's head root fuses into the verb stem and the
  // object NP emits no surface tokens. This mirrors Mohawk-style
  // object-noun incorporation. Modified objects (with adjectives,
  // possessors, etc.) stay separate — realistic, since real
  // polysynthetic languages don't usually incorporate modified NPs.
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
      english: a.lemma,
      role: "ADV" as const,
      resolution: a.resolution,
    }];
  });
  // Predicate complement: adjective(s) following a copula. Render
  // with adj.num.pl agreement when the subject is plural (ADJ-noun
  // agreement bleeds onto predicate adjectives in many languages).
  const complementTokens: RealisedToken[] = (s.predicate.complement ?? []).map((a) => {
    let af = a.baseForm;
    if (af.length > 0 && s.subject.head.number === "pl") {
      const p = lang.morphology.paradigms["adj.num.pl"];
      if (p) af = inflect(af, p, lang, a.lemma);
    }
    return {
      surface: af.length > 0 ? af.join("") : `“${a.lemma}”`,
      english: a.lemma,
      role: "ADJ" as const,
      resolution: a.resolution,
    };
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
  // Leading discourse coordinator ("and", "but", "or") surfaces
  // first so the connective isn't silently lost.
  if (s.leadingConj) {
    const cf = closedClassForm(lang, s.leadingConj.lemma) ?? [];
    if (cf.length > 0) {
      out.push({
        surface: cf.join(""),
        english: s.leadingConj.lemma,
        role: "DET",
        resolution: "concept",
      });
    }
  }
  // Yes/no question: emit per the language's interrogative strategy.
  // - "particle"   prepend or append the synthesised Q particle
  // - "inversion"  put V before S regardless of word order
  // - "intonation" append a "?" marker token
  const isQuestion = !!s.interrogative;
  const interStrategy = lang.grammar.interrogativeStrategy ?? "intonation";
  if (isQuestion && interStrategy === "inversion") {
    // Force V→first, S follows, O last (mirrors English yes/no).
    out.push(...verbTokens);
    out.push(...subjectFinal);
    out.push(...objectTokens);
  } else {
    for (const k of order) out.push(...slot[k]);
  }
  // Predicate complement (copula): emit after the verb so output
  // reads "X is happy" / "X is here" naturally. In zero-copula
  // languages where verbTokens is empty, this still surfaces and
  // gives the equational reading "X happy".
  out.push(...complementTokens);
  out.push(...predPpTokens);
  out.push(...advTokens);

  if (isQuestion && interStrategy === "particle") {
    const qf = closedClassForm(lang, "Q") ?? [];
    if (qf.length > 0) {
      const qTok: RealisedToken = {
        surface: qf.join(""),
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
    out.push({ surface: "?", english: "?", role: "DET", resolution: "concept" });
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
  // Inflect the head form for case + number.
  let headForm = np.head.baseForm;
  const meaning = np.head.lemma;
  if (np.head.number === "pl" && lang.grammar.pluralMarking === "affix") {
    const p = lang.morphology.paradigms["noun.num.pl"];
    if (p) headForm = inflect(headForm, p, lang, meaning);
  }
  // Case morphology — the parser tags possessor NPs with role POSS so
  // the realiser can route through verb.case.gen instead of nom/acc.
  // hasCase still gates emission; if a language has no case, the
  // possessorPosition + caseStrategy alone signal genitive relations.
  const caseSlot: import("../morphology/types").MorphCategory | null =
    role === "POSS" ? "noun.case.gen"
    : np.head.case === "acc" ? "noun.case.acc"
    : null;
  if (caseSlot && lang.grammar.hasCase) {
    const p = lang.morphology.paradigms[caseSlot];
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
    // Unresolved heads (lexicon miss) surface in typographic
    // quotation marks so they stay visible in surface order rather
    // than collapsing to "" and disappearing from the sentence.
    surface: np.head.baseForm.length === 0
      ? `“${np.head.lemma}”`
      : headForm.join(""),
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

  const adjTokens: RealisedToken[] = np.adjectives.map((a) => {
    let af = a.baseForm;
    // Adj-noun number agreement: when the head is plural and the
    // language has an `adj.num.pl` paradigm, the adjective takes it
    // (Spanish-style "los perros grandes"). Without an explicit
    // adjective-plural paradigm we leave the adjective bare.
    if (np.head.number === "pl") {
      const p = lang.morphology.paradigms["adj.num.pl"];
      if (p) af = inflect(af, p, lang, a.lemma);
    }
    // Comparative / superlative degree morphology — applied AFTER
    // number agreement so a plural-comparative reads natural.
    if (a.degree === "comparative") {
      const p = lang.morphology.paradigms["adj.degree.cmp"];
      if (p) af = inflect(af, p, lang, a.lemma);
    } else if (a.degree === "superlative") {
      const p = lang.morphology.paradigms["adj.degree.sup"];
      if (p) af = inflect(af, p, lang, a.lemma);
    }
    return {
      // Unresolved adjective in an NP — surface in quotation marks so
      // "the [missing] dog" reads as "the “shiny” dog" rather than
      // "the dog" (silent loss).
      surface: a.baseForm.length === 0 ? `“${a.lemma}”` : af.join(""),
      english: a.lemma,
      role: "ADJ" as const,
      resolution: a.resolution,
    };
  });
  const numTokens: RealisedToken[] = np.numeral
    ? (() => {
        // Numerals come from the open-class lexicon (each language
        // names its own one/two/three/...), not the closed-class
        // table. Fall through to the closed-class table only when the
        // lexicon doesn't have the numeral.
        const lex = lang.lexicon[np.numeral!.lemma];
        const nf = lex ?? closedClassForm(lang, np.numeral!.lemma) ?? [];
        const out: RealisedToken[] = [];
        if (nf.length > 0) {
          out.push({
            surface: nf.join(""),
            english: np.numeral!.lemma,
            role: "NUM" as const,
            resolution: lex ? "direct" : "concept",
          });
          // Mandarin-style numeral classifier: when classifierSystem
          // is on, every counted noun requires a classifier between
          // the numeral and the noun head.
          if (lang.grammar.classifierSystem) {
            const cf = closedClassForm(lang, "CLF") ?? [];
            if (cf.length > 0) {
              out.push({
                surface: cf.join(""),
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
  // Coordination — emit `... CONJ <coord-NP>` so "the king and the
  // wolf" surfaces both members joined by the language's "and".
  if (np.coord) {
    const cf = closedClassForm(lang, np.coord.lemma) ?? [];
    if (cf.length > 0) {
      out.push({
        surface: cf.join(""),
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
  incorporatedRoot: WordForm | null,
): RealisedToken[] {
  let form = vp.verb.baseForm;
  const meaning = vp.verb.lemma;
  // Zero-copula detection: when the verb is the copula "be" and the
  // language doesn't carry a `be` lexeme (Russian, Mandarin, Toki
  // Pona, Hebrew-present, …), drop the verb token entirely and rely
  // on subject + complement to carry the meaning. We capture the
  // signal here, BEFORE any inflection paradigm gets a chance to
  // turn the empty stem into a phantom affix-only token like "ti".
  const isZeroCopula = vp.verb.lemma === "be" && form.length === 0;

  // Noun incorporation: prepend the incorporated object root to the
  // verb stem, then run all other affix derivations on the fused
  // stem. Polysynthetic languages do this: the incorporated noun
  // doesn't surface separately.
  if (incorporatedRoot && incorporatedRoot.length > 0) {
    form = [...incorporatedRoot, ...form];
  }

  // Pre-collect every paradigm we'll apply, in canonical order:
  // tense → aspect → mood → voice → person/number. The order matters
  // for fusional languages where the affixes pile up; agglutinative
  // languages keep them distinct.
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

  // Subject-verb agreement: pick the most-specific person+number paradigm.
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

  // SynthesisIndex gate: low-synthesis languages drop everything
  // beyond the first inflection (analytical-style — they'd express
  // the rest periphrastically with auxiliaries we don't emit yet).
  // High-synthesis languages keep the whole stack.
  const synth = lang.grammar.synthesisIndex ?? 2.0;
  const cap = Math.max(1, Math.round(synth));
  const applied = stack.slice(0, cap);

  // Apply each paradigm in order. Agglutinative (low fusionIndex)
  // keeps each affix distinct — the natural concatenation of `inflect`
  // already does this. Fusional (high fusionIndex) merges adjacent
  // affixes by collapsing duplicated phonemes at the seam — a coarse
  // approximation but enough to make fusional output visibly tighter.
  const fusion = lang.grammar.fusionIndex ?? 0.5;
  for (const cat of applied) {
    const p = lang.morphology.paradigms[cat];
    if (!p) continue;
    const before = form;
    form = inflect(before, p, lang, meaning);
    if (fusion >= 0.7 && p.position === "suffix") {
      // Cheap fusion: if the new affix begins with the same phoneme
      // the previous form ended with, drop the duplicate. This is a
      // very rough proxy for fusion (a real model would use OT
      // constraints), but it produces a visible difference between
      // agglutinative and fusional output.
      while (
        form.length >= 2 &&
        form[form.length - p.affix.length - 1] === p.affix[0]
      ) {
        form.splice(form.length - p.affix.length, 0); // no-op safe
        break;
      }
      // Compress doubled adjacent phonemes at the new seam.
      const seam = before.length;
      if (seam > 0 && seam < form.length && form[seam - 1] === form[seam]) {
        form.splice(seam, 1);
      }
    }
  }

  // Negation (applied AFTER the inflection stack so morphological
  // negation sits on the inflected form).
  if (negated) {
    if (isZeroCopula) {
      // Zero-copula + negated → just emit the standalone NEG token.
      const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
      return [{ surface: negForm.join(""), english: "not", role: "NEG", resolution: "concept" }];
    }
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
  if (isZeroCopula) return [];
  // Unresolved verb (lexicon miss, but not the copula) — surface in
  // quotation marks so the slot stays visible. Skip when an
  // inflection paradigm has padded the empty stem with affixes
  // alone (form non-empty but baseForm empty) — for those, render
  // the affix-only stem so the structural marker is at least visible.
  const verbSurface = vp.verb.baseForm.length === 0 && form.length === 0
    ? `“${vp.verb.lemma}”`
    : form.join("");
  return [{ surface: verbSurface, english: vp.verb.lemma, role: "V", resolution: vp.verb.resolution }];
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
