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
  const verbIdx = tokens.findIndex((t) => t.tag === "V");
  if (verbIdx < 0) return null;
  const verbTok = tokens[verbIdx]!;

  // ---- Negation detection ----
  let negated = false;
  for (let i = Math.max(0, verbIdx - 3); i < Math.min(tokens.length, verbIdx + 3); i++) {
    const t = tokens[i]!;
    if (t.lemma === "not" || t.lemma === "n't" || t.lemma === "never") {
      negated = true;
    }
  }

  // ---- Subject NP: closest noun-phrase head to the LEFT of the verb ----
  const subject = collectNP(tokens, verbIdx, "left");
  if (!subject) return null;

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
    },
    object,
    pps,
    adverbs: collectAdverbs(tokens, consumed),
  };

  return { kind: "S", subject, predicate, negated };
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

  const headTok = tokens[headIdx]!;
  const number_: Number_ = headTok.features.number === "pl" ? "pl" : "sg";
  const person = (headTok.features.person ?? "3") as Person;

  // Walk back from the head collecting determiners, adjectives, numerals.
  const adjectives: { lemma: string; baseForm: never[] }[] = [];
  let determiner: { lemma: string } | undefined;
  let numeral: { lemma: string } | undefined;
  for (let i = headIdx - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t.tag === "ADJ") {
      adjectives.unshift({ lemma: t.lemma, baseForm: [] });
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

  // Walk forward collecting trailing PPs that modify this noun.
  const pps: PP[] = [];
  for (let i = headIdx + 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.tag !== "PREP") break;
    const sub = collectNP(tokens, i, "right");
    if (!sub) break;
    pps.push({ kind: "PP", prep: { lemma: t.lemma }, np: sub });
    // Skip past the PP's NP.
    while (i + 1 < tokens.length && tokens[i + 1]!.tag !== "PREP") i++;
  }

  return {
    kind: "NP",
    head: {
      lemma: headTok.lemma,
      baseForm: [],
      number: number_,
      case: direction === "left" ? "nom" : "acc",
      person,
      isPronoun: headTok.tag === "PRON",
    },
    determiner,
    adjectives,
    numeral,
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
