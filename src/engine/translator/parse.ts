import type { EnglishToken } from "./sentence";
import type {
  NP,
  PP,
  Sentence,
  VP,
  Person,
  Number_,
} from "./syntax";

/**
 * Parse a list of POS-tagged English tokens into a single-clause
 * Sentence. Uses a small set of greedy heuristics — sufficient for the
 * short sentences the simulator handles, deliberately not a full
 * dependency parser. Returns null when no clause structure can be
 * recovered.
 *
 * Algorithm:
 *   1. Locate the verb — the first V token. If none, abort.
 *   2. Walk left from the verb gathering subject NP material; walk
 *      right gathering object NP material.
 *   3. NP gathering: an NP starts at a DET / N / PRON / NUM / ADJ
 *      and runs forward as long as we keep seeing modifiers.
 *   4. Negation tokens (`not`, `n't`, `never`) on the verb's left flag
 *      the sentence as `negated: true` and are not emitted as tokens.
 *   5. Prepositional phrases (PREP + NP) hang off whichever side of
 *      the verb they sit (left → subject's pps, right → predicate's pps).
 *
 * Parser is lossy: closed-class tokens that aren't articles or
 * prepositions (auxiliaries, conjunctions) are dropped at this stage —
 * the existing translator already drops them or routes through closed
 * class lookup, so we don't lose information.
 */
export function parseSyntax(tokens: EnglishToken[]): Sentence | null {
  let verbIdx = tokens.findIndex((t) => t.tag === "V");
  // Copula promotion: when no main verb is found, look for an AUX
  // copula (is / are / was / were / be / been) and promote it to a
  // verb with lemma "be". This lets the parser handle equational
  // sentences ("the king is here", "he is not", "the man is a king")
  // and still produce a Sentence.
  if (verbIdx < 0) {
    const copIdx = tokens.findIndex(
      (t) => t.tag === "AUX" && (t.lemma === "be" || t.lemma === "is" || t.lemma === "are" || t.lemma === "was" || t.lemma === "were" || t.lemma === "been"),
    );
    if (copIdx < 0) return null;
    // Mutate in place: rewrite the AUX as a V with lemma "be" and
    // its existing tense feature.
    const cop = tokens[copIdx]!;
    tokens[copIdx] = {
      ...cop,
      tag: "V",
      lemma: "be",
      features: { ...cop.features, tense: cop.features.tense ?? "present" },
    };
    verbIdx = copIdx;
  }
  const verbTok = tokens[verbIdx]!;

  // ---- Negation detection ----
  let negated = false;
  for (let i = Math.max(0, verbIdx - 3); i < Math.min(tokens.length, verbIdx + 4); i++) {
    const t = tokens[i]!;
    if (t.lemma === "not" || t.lemma === "n't" || t.lemma === "never") {
      negated = true;
    }
  }

  // ---- Interrogative detection ----
  // Yes/no question if the input ends with "?" OR begins with an
  // auxiliary (English "is the king ...", "do you ...", "will it ...").
  let interrogative = false;
  if (tokens.length > 0 && tokens[tokens.length - 1]!.lemma === "?") {
    interrogative = true;
  }
  if (tokens.length > 0 && tokens[0]!.tag === "AUX") {
    interrogative = true;
  }

  // ---- Aspect / mood / voice from auxiliary cues ----
  // Walk the tokens left of the verb collecting auxiliary signatures.
  let aspect: import("./syntax").Aspect | undefined;
  let mood: import("./syntax").Mood | undefined;
  let voice: import("./syntax").Voice | undefined;
  for (let i = 0; i < verbIdx; i++) {
    const t = tokens[i]!;
    if (t.tag !== "AUX") continue;
    const lem = t.lemma;
    // Progressive: "is/are/was/were" + V-ing.
    if (verbTok.surface.endsWith("ing") && (lem === "is" || lem === "are" || lem === "was" || lem === "were" || lem === "be")) {
      aspect = "progressive";
    }
    // Perfective: "have/has/had" + V-ed (or irregular past participle).
    if (lem === "have" || lem === "has" || lem === "had") {
      aspect = "perfective";
    }
    // Subjunctive / dubitative cues.
    if (lem === "should" || lem === "would" || lem === "might" || lem === "may") {
      mood = "subjunctive";
    }
    // Passive: "is/are/was/were/be" + past-participle (V ends -ed or
    // is in the past-participle form). This overlaps with progressive
    // — we let `voice` win when the verb is past-tense in form.
    if (
      (lem === "is" || lem === "are" || lem === "was" || lem === "were" || lem === "be" || lem === "been") &&
      (verbTok.surface.endsWith("ed") || verbTok.features.tense === "past")
    ) {
      voice = "passive";
    }
  }
  // Imperative cues: input that has no overt subject AND starts with
  // a bare verb signal an imperative ("go!", "see the king!"). We
  // detect this lightly by checking the position of the verb at
  // index 0.
  if (verbIdx === 0) {
    mood = "imperative";
  }

  // ---- Subject NP: closest noun-phrase head to the LEFT of the verb ----
  // For imperatives (verb at idx 0) and yes/no questions starting with
  // an auxiliary, the explicit subject may be missing on the left.
  // Synthesize a 2sg "you" subject for imperatives so the realiser
  // still has a Sentence to walk; for AUX-initial questions the real
  // subject sits between AUX and V.
  let subject = collectNP(tokens, verbIdx, "left");
  if (!subject) {
    if (verbIdx === 0 || (verbIdx > 0 && tokens[0]!.tag === "AUX")) {
      subject = {
        kind: "NP",
        head: {
          lemma: "you",
          baseForm: [],
          number: "sg",
          case: "nom",
          person: "2",
          isPronoun: true,
        },
        adjectives: [],
        pps: [],
      };
    } else {
      return null;
    }
  }

  // ---- Object NP: closest noun-phrase head to the RIGHT of the verb ----
  const object = collectNP(tokens, verbIdx, "right") ?? undefined;

  // ---- PPs: walk all PREPs not already consumed ----
  // Object collection now stops at PREP boundaries, so the PPs we
  // collect here can't double-count the object's tokens.
  const consumed = new Set<number>();
  consumed.add(verbIdx);
  const pps = collectPPs(tokens, consumed);

  const tense: "past" | "present" | "future" =
    verbTok.features.tense ?? "present";
  const subjectPerson = subject.head.person;
  const subjectNumber = subject.head.number;

  const verbBase = verbTok.lemma;
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
    },
    object,
    pps,
    adverbs: collectAdverbs(tokens, consumed),
  };

  return { kind: "S", subject, predicate, negated, interrogative };
}

function collectNP(
  tokens: EnglishToken[],
  pivot: number,
  direction: "left" | "right",
): NP | null {
  // Find the head noun (or pronoun) on the requested side closest to
  // the pivot. `pre` modifiers (DET, ADJ, NUM) extend backwards from
  // the head; `post` modifiers (PP) extend forwards.
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
      break;
    }
    if (t.tag === "V") break; // don't cross another verb
    // Don't cross a PREP either: a noun on the far side belongs to a
    // PP, not to the verb's direct object. Without this guard
    // "the brother take at the mountain" pulls "mountain" into both
    // the object slot AND the PP, double-emitting it at realisation.
    if (t.tag === "PREP") break;
  }
  if (headIdx < 0) return null;

  let headTokRef = tokens[headIdx]!;
  let number_: Number_ = headTokRef.features.number === "pl" ? "pl" : "sg";
  let person = (headTokRef.features.person ?? "3") as Person;

  // Walk back from the head collecting determiners, adjectives, numerals.
  // Rewind for possessive "X of Y" — when the head we just located
  // sits directly inside an "of"-PP (i.e. an "of" lies just before
  // the head, optionally separated by a DET), then the *real* head
  // is the noun before that "of", and our current head becomes the
  // possessor. Without this, "the dog of the king sees" gets king as
  // subject and dog drops out — unwanted.
  let possessor: NP | undefined;
  if (direction === "left") {
    let scan = headIdx - 1;
    while (scan >= 0 && tokens[scan]!.tag === "DET") scan--;
    if (scan >= 0 && tokens[scan]!.tag === "PREP" && tokens[scan]!.lemma === "of") {
      // Treat current head as the possessor; locate a new head before
      // the "of".
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
        // Save the old head as the possessor.
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
        // Swap to the real head.
        headIdx = realHeadIdx;
        headTokRef = tokens[headIdx]!;
        number_ = headTokRef.features.number === "pl" ? "pl" : "sg";
        person = (headTokRef.features.person ?? "3") as Person;
      }
    }
  }
  const adjectives: { lemma: string; baseForm: never[]; degree?: import("./syntax").Degree }[] = [];
  let determiner: { lemma: string } | undefined;
  let numeral: { lemma: string } | undefined;
  for (let i = headIdx - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t.tag === "ADJ") {
      const deg = t.features.degree;
      adjectives.unshift({
        lemma: t.lemma,
        baseForm: [],
        ...(deg && deg !== "positive" ? { degree: deg } : {}),
      });
      continue;
    }
    if (t.tag === "DET") {
      determiner = { lemma: t.lemma };
      continue;
    }
    if (t.tag === "NUM") {
      numeral = { lemma: t.lemma };
      continue;
    }
    break;
  }

  // Walk forward collecting trailing PPs that modify this noun. The
  // first "of X" PP becomes the possessor (so "the dog of the king"
  // surfaces with the king as a genitive-marked possessor); the rest
  // become ordinary PPs.
  const pps: PP[] = [];
  for (let i = headIdx + 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.tag !== "PREP") break;
    const sub = collectNP(tokens, i, "right");
    if (!sub) break;
    if (t.lemma === "of" && !possessor) {
      possessor = { ...sub, head: { ...sub.head, case: "gen" } };
    } else {
      pps.push({ kind: "PP", prep: { lemma: t.lemma }, np: sub });
    }
    // Skip past the PP's NP.
    while (i + 1 < tokens.length && tokens[i + 1]!.tag !== "PREP") i++;
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
  };
}

function collectPPs(tokens: EnglishToken[], consumed: Set<number>): PP[] {
  const out: PP[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    if (tokens[i]!.tag !== "PREP") continue;
    const np = collectNP(tokens, i, "right");
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
