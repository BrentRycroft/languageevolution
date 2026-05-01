import type { EnglishToken } from "./tokens";
import { WH_LEMMAS } from "./tokens";
import type {
  NP,
  PP,
  Sentence,
  VP,
  Person,
  Number_,
} from "./syntax";

export function parseSyntax(tokens: EnglishToken[]): Sentence | null {
  let leadingConj: { lemma: string } | undefined;
  if (tokens.length > 0 && tokens[0]!.tag === "CONJ") {
    leadingConj = { lemma: tokens[0]!.lemma };
  }
  let leadingWh: { lemma: string } | undefined;
  for (const t of tokens) {
    if (t.tag === "PUNCT" && WH_LEMMAS.has(t.lemma)) {
      leadingWh = { lemma: t.lemma };
      break;
    }
    if (t.tag === "V") break;
  }
  let verbIdx = tokens.findIndex((t) => t.tag === "V");
  if (verbIdx < 0) {
    const copIdx = tokens.findIndex(
      (t) => t.tag === "AUX" && (t.lemma === "be" || t.lemma === "is" || t.lemma === "are" || t.lemma === "was" || t.lemma === "were" || t.lemma === "been"),
    );
    if (copIdx < 0) {
      const haveIdx = tokens.findIndex(
        (t) => t.tag === "AUX" && (t.lemma === "have" || t.lemma === "has" || t.lemma === "had"),
      );
      if (haveIdx >= 0) {
        const ht = tokens[haveIdx]!;
        tokens[haveIdx] = {
          ...ht,
          tag: "V",
          lemma: "have",
          features: { ...ht.features, tense: ht.features.tense ?? (ht.surface === "had" ? "past" : "present") },
        };
        verbIdx = haveIdx;
      } else {
        let doIdx = -1;
        for (let i = tokens.length - 1; i >= 0; i--) {
          const t = tokens[i]!;
          if (t.tag === "AUX" && (t.lemma === "do" || t.lemma === "does" || t.lemma === "did")) {
            doIdx = i;
            break;
          }
        }
        if (doIdx < 0) return null;
        const dt = tokens[doIdx]!;
        tokens[doIdx] = {
          ...dt,
          tag: "V",
          lemma: "do",
          features: { ...dt.features, tense: dt.features.tense ?? (dt.surface === "did" ? "past" : "present") },
        };
        verbIdx = doIdx;
      }
    } else {
      const cop = tokens[copIdx]!;
      tokens[copIdx] = {
        ...cop,
        tag: "V",
        lemma: "be",
        features: { ...cop.features, tense: cop.features.tense ?? "present" },
      };
      verbIdx = copIdx;
    }
  }
  const verbTok = tokens[verbIdx]!;

  let negated = false;
  for (let i = Math.max(0, verbIdx - 3); i < Math.min(tokens.length, verbIdx + 4); i++) {
    const t = tokens[i]!;
    if (t.lemma === "not" || t.lemma === "n't" || t.lemma === "never") {
      negated = true;
    }
  }

  let interrogative = false;
  if (tokens.length > 0 && tokens[tokens.length - 1]!.lemma === "?") {
    interrogative = true;
  }
  if (tokens.length > 0 && tokens[0]!.tag === "AUX") {
    interrogative = true;
  }

  let aspect: import("./syntax").Aspect | undefined;
  let mood: import("./syntax").Mood | undefined;
  let voice: import("./syntax").Voice | undefined;
  for (let i = 0; i < verbIdx; i++) {
    const t = tokens[i]!;
    if (t.tag !== "AUX") continue;
    const lem = t.lemma;
    if (verbTok.surface.endsWith("ing") && (lem === "is" || lem === "are" || lem === "was" || lem === "were" || lem === "be")) {
      aspect = "progressive";
    }
    if (lem === "have" || lem === "has" || lem === "had") {
      aspect = "perfective";
    }
    if (lem === "should" || lem === "would" || lem === "might" || lem === "may") {
      mood = "subjunctive";
    }
    if (
      (lem === "is" || lem === "are" || lem === "was" || lem === "were" || lem === "be" || lem === "been") &&
      (verbTok.surface.endsWith("ed") || verbTok.features.tense === "past")
    ) {
      voice = "passive";
    }
  }
  if (verbIdx === 0) {
    mood = "imperative";
  }

  const consumed = new Set<number>();
  consumed.add(verbIdx);

  let subject = collectNP(tokens, verbIdx, "left", consumed);
  if (!subject) {
    const whSubjectLemmas = new Set(["who", "what", "which", "whoever", "whatever"]);
    const leftIsBareWh =
      leadingWh &&
      whSubjectLemmas.has(leadingWh.lemma) &&
      tokens.slice(0, verbIdx).every(
        (t) => t.tag === "PUNCT" || t.tag === "AUX",
      );
    if (leftIsBareWh) {
      subject = {
        kind: "NP",
        head: {
          lemma: leadingWh!.lemma,
          baseForm: [],
          number: "sg",
          case: "nom",
          person: "3",
          isPronoun: true,
          synthesized: true,
        },
        adjectives: [],
        pps: [],
      };
      leadingWh = undefined;
    } else if (verbIdx === 0 || (verbIdx > 0 && tokens[0]!.tag === "AUX")) {
      subject = {
        kind: "NP",
        head: {
          lemma: "you",
          baseForm: [],
          number: "sg",
          case: "nom",
          person: "2",
          isPronoun: true,
          synthesized: true,
        },
        adjectives: [],
        pps: [],
      };
    } else {
      return null;
    }
  }

  const object = collectNP(tokens, verbIdx, "right", consumed) ?? undefined;

  const complement: { lemma: string; baseForm: never[] }[] = [];
  if (verbTok.lemma === "be" && !object) {
    for (let i = verbIdx + 1; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.tag === "ADJ") {
        complement.push({ lemma: t.lemma, baseForm: [] });
        continue;
      }
      if (t.tag === "PUNCT" || t.tag === "AUX" || t.tag === "DET") continue;
      break;
    }
  }

  const pps = collectPPs(tokens, consumed);

  if (voice === "passive") {
    for (const pp of pps) {
      if (pp.prep.lemma === "by") {
        pp.np.head.case = "inst";
      }
    }
  }

  const tense: "past" | "present" | "future" =
    verbTok.features.tense ?? "present";
  const subjectPerson = subject.head.person;
  const subjectNumber = subject.head.number;

  const verbBase = verbTok.lemma;
  const evidential = inferEvidential(verbBase, tokens);
  const predicate: VP = {
    kind: "VP",
    verb: {
      lemma: verbBase,
      baseForm: [],
      tense,
      subjectPerson,
      subjectNumber,
      aspect,
      mood,
      voice,
      evidential,
    },
    object,
    pps,
    adverbs: collectAdverbs(tokens, consumed),
    complement: complement.length > 0 ? complement : undefined,
  };

  if (leadingWh) interrogative = true;
  return { kind: "S", subject, predicate, negated, interrogative, leadingConj, leadingWh };
}

export function parseSyntaxAll(tokens: EnglishToken[]): Sentence[] {
  const rel = extractRelativeClause(tokens);
  if (rel) {
    const matrixSentences = parseSyntaxAll(rel.matrix);
    const relSentence = parseSyntax(rel.relative);
    if (relSentence) {
      relSentence.leadingWh = { lemma: rel.relLemma };
      const subjectGap = relSentence.subject.head.synthesized === true;
      if (subjectGap) {
        const a = rel.antecedent;
        relSentence.subject = {
          kind: "NP",
          head: {
            lemma: a.lemma,
            baseForm: [],
            number: a.features.number === "pl" ? "pl" : "sg",
            case: "nom",
            person: (a.features.person ?? "3") as Person,
            isPronoun: a.tag === "PRON",
          },
          adjectives: [],
          pps: [],
        };
      }
      const antecedentNP = findAntecedentNP(matrixSentences, rel.antecedent.lemma);
      if (antecedentNP) {
        const relizerLemma = rel.relLemma === "who" || rel.relLemma === "which" || rel.relLemma === "that"
          ? rel.relLemma as "who" | "that" | "which"
          : "that";
        antecedentNP.relative = {
          kind: "RC",
          relativizer: relizerLemma,
          predicate: relSentence.predicate,
          subjectGap,
        };
        return matrixSentences;
      }
      return [...matrixSentences, relSentence];
    }
  }
  const verbCount = tokens.filter((t) => t.tag === "V").length;
  if (verbCount <= 1) {
    const single = parseSyntax(tokens);
    return single ? [single] : [];
  }
  const boundaries: number[] = [];
  for (let i = 1; i < tokens.length - 1; i++) {
    const t = tokens[i]!;
    const isConj = t.tag === "CONJ";
    const isComma = t.tag === "PUNCT" && (t.lemma === "," || t.lemma === ";");
    if (!isConj && !isComma) continue;
    let vBefore = 0;
    let vAfter = 0;
    for (let j = 0; j < i; j++) if (tokens[j]!.tag === "V") vBefore++;
    for (let j = i + 1; j < tokens.length; j++) if (tokens[j]!.tag === "V") vAfter++;
    if (vBefore >= 1 && vAfter >= 1) boundaries.push(i);
  }
  if (boundaries.length === 0) {
    const single = parseSyntax(tokens);
    return single ? [single] : [];
  }
  const segments: { tokens: EnglishToken[]; leadingConj?: { lemma: string } }[] = [];
  let prev = 0;
  for (const b of boundaries) {
    if (b > prev) segments.push({ tokens: tokens.slice(prev, b) });
    const bt = tokens[b]!;
    const lc = bt.tag === "CONJ" ? { lemma: bt.lemma } : undefined;
    segments.push({ tokens: [], leadingConj: lc });
    prev = b + 1;
  }
  if (prev < tokens.length) segments.push({ tokens: tokens.slice(prev) });
  const merged: { tokens: EnglishToken[]; leadingConj?: { lemma: string } }[] = [];
  for (let i = 0; i < segments.length; i++) {
    const cur = segments[i]!;
    if (cur.tokens.length === 0 && i + 1 < segments.length) {
      const nxt = segments[i + 1]!;
      merged.push({ tokens: nxt.tokens, leadingConj: cur.leadingConj });
      i++;
    } else if (cur.tokens.length > 0) {
      merged.push(cur);
    }
  }
  const out: Sentence[] = [];
  for (let k = 0; k < merged.length; k++) {
    const seg = merged[k]!;
    const s = parseSyntax(seg.tokens);
    if (!s) continue;
    if (seg.leadingConj && !s.leadingConj) s.leadingConj = seg.leadingConj;
    if (k > 0 && out.length > 0 && s.subject.head.synthesized) {
      const segHasNominal = seg.tokens.some(
        (t) => t.tag === "N" || t.tag === "PRON",
      );
      if (!segHasNominal) {
        s.subject = out[out.length - 1]!.subject;
      }
    }
    out.push(s);
  }
  return out;
}

function findAntecedentNP(sentences: Sentence[], lemma: string): NP | null {
  for (const s of sentences) {
    if (s.subject.head.lemma === lemma) return s.subject;
    if (s.predicate.object?.head.lemma === lemma) return s.predicate.object;
    for (const pp of s.predicate.pps) {
      if (pp.np.head.lemma === lemma) return pp.np;
    }
    for (const pp of s.subject.pps) {
      if (pp.np.head.lemma === lemma) return pp.np;
    }
  }
  return null;
}

function extractRelativeClause(tokens: EnglishToken[]): {
  matrix: EnglishToken[];
  relative: EnglishToken[];
  relLemma: string;
  antecedent: EnglishToken;
} | null {
  for (let i = 1; i < tokens.length - 1; i++) {
    const t = tokens[i]!;
    const isWhRel = t.tag === "PUNCT" && WH_LEMMAS.has(t.lemma);
    const isThatRel = t.tag === "DET" && t.lemma === "that";
    if (!isWhRel && !isThatRel) continue;
    const prev = tokens[i - 1]!;
    if (prev.tag !== "N" && prev.tag !== "PRON") continue;
    let relVIdx = -1;
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j]!.tag === "V") { relVIdx = j; break; }
    }
    if (relVIdx < 0) continue;
    let matrixVAfter = -1;
    for (let j = relVIdx + 1; j < tokens.length; j++) {
      if (tokens[j]!.tag === "V") { matrixVAfter = j; break; }
    }
    let matrixVBefore = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (tokens[j]!.tag === "V") { matrixVBefore = j; break; }
    }
    if (matrixVAfter >= 0) {
      return {
        matrix: [...tokens.slice(0, i), ...tokens.slice(matrixVAfter)],
        relative: tokens.slice(i + 1, matrixVAfter),
        relLemma: t.lemma,
        antecedent: prev,
      };
    }
    if (matrixVBefore >= 0) {
      return {
        matrix: tokens.slice(0, i),
        relative: tokens.slice(i + 1),
        relLemma: t.lemma,
        antecedent: prev,
      };
    }
  }
  return null;
}

function collectNP(
  tokens: EnglishToken[],
  pivot: number,
  direction: "left" | "right",
  consumed?: Set<number>,
): NP | null {
  const claim = (i: number) => consumed?.add(i);
  const range = direction === "left"
    ? { start: pivot - 1, end: -1, step: -1 }
    : { start: pivot + 1, end: tokens.length, step: 1 };

  let headIdx = -1;
  for (
    let i = range.start;
    direction === "left" ? i > range.end : i < range.end;
    i += range.step
  ) {
    const t = tokens[i]!;
    if (t.tag === "N" || t.tag === "PRON") {
      headIdx = i;
      if (direction === "left") {
        let j = i - 1;
        let lastBridgedHead = i;
        while (j >= 0) {
          const u = tokens[j]!;
          if (u.tag === "V") break;
          if (u.tag === "N" || u.tag === "PRON") {
            let bridge = false;
            for (let k = j + 1; k < lastBridgedHead; k++) {
              if (tokens[k]!.tag === "PREP") { bridge = true; break; }
            }
            if (bridge) {
              headIdx = j;
              lastBridgedHead = j;
            } else {
              break;
            }
          }
          j--;
        }
      }
      break;
    }
    if (t.tag === "V") break;
    if (t.tag === "PREP") break;
  }
  if (headIdx < 0) return null;
  claim(headIdx);

  let headTokRef = tokens[headIdx]!;
  let number_: Number_ = headTokRef.features.number === "pl" ? "pl" : "sg";
  let person = (headTokRef.features.person ?? "3") as Person;

  let possessor: NP | undefined;
  if (direction === "left") {
    let scan = headIdx - 1;
    while (scan >= 0 && tokens[scan]!.tag === "DET") scan--;
    if (scan >= 0 && tokens[scan]!.tag === "PREP" && tokens[scan]!.lemma === "of") {
      let realHeadIdx = -1;
      for (let i = scan - 1; i >= 0; i--) {
        const t = tokens[i]!;
        if (t.tag === "N" || t.tag === "PRON") {
          realHeadIdx = i;
          break;
        }
        if (t.tag === "V") break;
      }
      if (realHeadIdx >= 0) {
        possessor = {
          kind: "NP",
          head: {
            lemma: headTokRef.lemma,
            baseForm: [],
            number: number_,
            case: "gen",
            person,
            isPronoun: headTokRef.tag === "PRON",
          },
          adjectives: [],
          pps: [],
        };
        for (let k = scan; k <= headIdx; k++) claim(k);
        headIdx = realHeadIdx;
        claim(headIdx);
        headTokRef = tokens[headIdx]!;
        number_ = headTokRef.features.number === "pl" ? "pl" : "sg";
        person = (headTokRef.features.person ?? "3") as Person;
      }
    }
  }
  const adjectives: { lemma: string; baseForm: never[]; degree?: import("./syntax").Degree }[] = [];
  let determiner: { lemma: string } | undefined;
  let numeral: { lemma: string } | undefined;
  let leftEdge = headIdx;
  for (let i = headIdx - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t.tag === "ADJ") {
      const deg = t.features.degree;
      adjectives.unshift({
        lemma: t.lemma,
        baseForm: [],
        ...(deg && deg !== "positive" ? { degree: deg } : {}),
      });
      leftEdge = i;
      claim(i);
      continue;
    }
    if (t.tag === "DET") {
      determiner = { lemma: t.lemma };
      leftEdge = i;
      claim(i);
      continue;
    }
    if (t.tag === "NUM") {
      numeral = { lemma: t.lemma };
      leftEdge = i;
      claim(i);
      continue;
    }
    if ((t.tag === "N" || t.tag === "PRON") && t.features.possessor) {
      possessor = {
        kind: "NP",
        head: {
          lemma: t.lemma,
          baseForm: [],
          number: t.features.number === "pl" ? "pl" : "sg",
          case: "gen",
          person: (t.features.person ?? "3") as Person,
          isPronoun: t.tag === "PRON",
        },
        adjectives: [],
        pps: [],
      };
      leftEdge = i;
      claim(i);
      for (let j = i - 1; j >= 0; j--) {
        const pt = tokens[j]!;
        if (pt.tag === "DET") {
          possessor.determiner = { lemma: pt.lemma };
          leftEdge = j;
          claim(j);
          continue;
        }
        break;
      }
      break;
    }
    break;
  }

  if (direction === "left" && leftEdge > 0) {
    const conjTok = tokens[leftEdge - 1];
    if (conjTok && conjTok.tag === "CONJ") {
      claim(leftEdge - 1);
      const leftCoord = collectNP(tokens, leftEdge - 1, "left", consumed);
      if (leftCoord) {
        const rightMember: NP = {
          kind: "NP",
          head: {
            lemma: headTokRef.lemma,
            baseForm: [],
            number: number_,
            case: direction === "left" ? "nom" : "acc",
            person,
            isPronoun: headTokRef.tag === "PRON",
          },
          determiner,
          adjectives,
          numeral,
          possessor,
          pps: [],
        };
        return {
          ...leftCoord,
          coord: { lemma: conjTok.lemma, np: rightMember },
        };
      }
    }
  }

  const pps: PP[] = [];
  let rightEdge = headIdx;
  if (
    headIdx + 1 < tokens.length &&
    tokens[headIdx + 1]!.tag === "PREP" &&
    tokens[headIdx + 1]!.lemma === "of" &&
    !possessor
  ) {
    const ofIdx = headIdx + 1;
    claim(ofIdx);
    const sub = collectNP(tokens, ofIdx, "right", consumed);
    if (sub) {
      possessor = { ...sub, head: { ...sub.head, case: "gen" } };
    }
    let i = ofIdx;
    while (i + 1 < tokens.length && tokens[i + 1]!.tag !== "PREP") {
      i++;
      claim(i);
    }
    rightEdge = i;
  }

  let rightCoord: { lemma: string; np: NP } | undefined;
  if (direction === "right" && rightEdge + 1 < tokens.length) {
    const conjTok = tokens[rightEdge + 1];
    if (conjTok && conjTok.tag === "CONJ") {
      claim(rightEdge + 1);
      const next = collectNP(tokens, rightEdge + 1, "right", consumed);
      if (next) {
        rightCoord = { lemma: conjTok.lemma, np: next };
      }
    }
  }

  return {
    kind: "NP",
    head: {
      lemma: headTokRef.lemma,
      baseForm: [],
      number: number_,
      case: direction === "left" ? "nom" : "acc",
      person,
      isPronoun: headTokRef.tag === "PRON",
    },
    determiner,
    adjectives,
    numeral,
    possessor,
    pps,
    coord: rightCoord,
  };
}

function collectPPs(tokens: EnglishToken[], consumed: Set<number>): PP[] {
  const out: PP[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    if (tokens[i]!.tag !== "PREP") continue;
    consumed.add(i);
    const np = collectNP(tokens, i, "right", consumed);
    if (!np) continue;
    out.push({ kind: "PP", prep: { lemma: tokens[i]!.lemma }, np });
  }
  return out;
}

function collectAdverbs(
  tokens: EnglishToken[],
  consumed: Set<number>,
): { lemma: string; baseForm: never[] }[] {
  const out: { lemma: string; baseForm: never[] }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    if (tokens[i]!.tag !== "ADV") continue;
    out.push({ lemma: tokens[i]!.lemma, baseForm: [] });
  }
  return out;
}

const REPORTATIVE_LEMMAS = new Set(["say", "tell", "speak"]);
const INFERRED_LEMMAS = new Set(["think", "know", "guess", "suppose", "seem"]);
const DIRECT_LEMMAS = new Set(["see", "hear", "feel", "watch", "listen"]);

function inferEvidential(
  verbLemma: string,
  tokens: EnglishToken[],
): "direct" | "reportative" | "inferred" | undefined {
  if (DIRECT_LEMMAS.has(verbLemma)) return "direct";
  if (REPORTATIVE_LEMMAS.has(verbLemma)) return "reportative";
  if (INFERRED_LEMMAS.has(verbLemma)) return "inferred";
  for (const t of tokens) {
    if (t.tag === "ADV") {
      if (t.lemma === "apparently" || t.lemma === "evidently") return "inferred";
      if (t.lemma === "reportedly" || t.lemma === "allegedly") return "reportative";
    }
  }
  return undefined;
}
