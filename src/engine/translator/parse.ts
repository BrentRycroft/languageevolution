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
  // Leading discourse coordinator: "And he saw...", "But the king...",
  // "Or maybe...". Surface so the user sees the connective; the rest
  // of the parse pretends the conjunction wasn't there.
  let leadingConj: { lemma: string } | undefined;
  if (tokens.length > 0 && tokens[0]!.tag === "CONJ") {
    leadingConj = { lemma: tokens[0]!.lemma };
  }
  // Leading wh-word: tagged PUNCT during tokenisation so it doesn't
  // pollute NP detection in relative clauses. Captured here so the
  // realiser can surface a closed-class translation at sentence
  // start (mimics English-style wh-fronting). Covers who / whom /
  // whose / what / which / where / when / why / how.
  let leadingWh: { lemma: string } | undefined;
  for (const t of tokens) {
    if (t.tag === "PUNCT" && WH_LEMMAS.has(t.lemma)) {
      leadingWh = { lemma: t.lemma };
      break;
    }
    if (t.tag === "V") break;
  }
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
    if (copIdx < 0) {
      // Possession promotion: "X has / had / have Y" with no main
      // verb means HAVE-as-possession. The tokeniser tags these as
      // AUX so they pass tense through to a following V; without a
      // V, they'd otherwise drop silently and the sentence would
      // surface as "X Y". Promote to a V with lemma "have" so the
      // realiser can resolve it via the lexicon.
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
        // Do-promotion: "X did Y" / "X does Y" with no main verb means
        // DO-as-action ("the king DID it", "she does the work").
        // Mirrors the have-promotion path. Pick the LAST do-AUX so
        // "does she do it" picks `do` as the main verb and `does`
        // stays as a fronted yes/no auxiliary.
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
  // Shared consumed-set: collectNP claims every index it folds into a
  // sub-NP, so the top-level collectPPs walk doesn't re-emit PPs that
  // are already attributed to subject / object NPs. Without this,
  // long PP chains ("from the village to the river by the road on
  // the horse") get exponential PP duplication.
  const consumed = new Set<number>();
  consumed.add(verbIdx);

  let subject = collectNP(tokens, verbIdx, "left", consumed);
  if (!subject) {
    // Wh-subject: when a wh-word is the only material left of the verb
    // ("who sees the king", "what eats the meat"), let the wh-word
    // itself stand in as a 3sg pronoun subject. Without this, the
    // parse fails and we fall through to the legacy linear path,
    // losing tree-driven realisation for wh-questions.
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

  // ---- Object NP: closest noun-phrase head to the RIGHT of the verb ----
  const object = collectNP(tokens, verbIdx, "right", consumed) ?? undefined;

  // ---- Predicate complement (copula): when the verb is "be" and there's
  // no object NP, look right of the verb for an ADJ chain — these are
  // predicate adjectives that complete the copula clause ("X is happy",
  // "today was good"). Without this they get dropped.
  const complement: { lemma: string; baseForm: never[] }[] = [];
  if (verbTok.lemma === "be" && !object) {
    for (let i = verbIdx + 1; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.tag === "ADJ") {
        complement.push({ lemma: t.lemma, baseForm: [] });
        continue;
      }
      // Skip past negators / punctuation while scanning for the
      // complement; stop at a PREP, V, or any other content token.
      if (t.tag === "PUNCT" || t.tag === "AUX" || t.tag === "DET") continue;
      break;
    }
  }

  // ---- PPs: walk all PREPs not already consumed ----
  // Object collection now stops at PREP boundaries, AND we now thread
  // `consumed` through collectNP so PPs already absorbed by subject /
  // object don't get re-emitted by the top-level walk.
  const pps = collectPPs(tokens, consumed);

  // Passive `by`-PP routing: under passive voice, the `by N` NP is
  // the AGENT, not a regular oblique. Mark its head case=inst (the
  // instrumental, used in PIE / Slavic / Sanskrit for the passive
  // agent). Languages without a verb.case.inst paradigm just render
  // it like nominative, but at least we don't emit it as accusative
  // (which would gloss as a direct object).
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
    complement: complement.length > 0 ? complement : undefined,
  };

  // Wh-words always make the sentence interrogative even if there's
  // no question mark.
  if (leadingWh) interrogative = true;
  return { kind: "S", subject, predicate, negated, interrogative, leadingConj, leadingWh };
}

/**
 * Multi-clause variant of `parseSyntax`. Splits the tagged token stream
 * at CONJ / comma boundaries that sit between two V tokens, parses
 * each segment independently, and stamps the joining conjunction as
 * the next segment's `leadingConj`. Handles the common case where the
 * user types compound or subordinate clauses ("the king sees the wolf
 * AND the wolf runs", "the king runs BECAUSE the wolf chases him",
 * "the king sees the wolf, the wolf runs").
 *
 * Subject inheritance: when a clause-2+ segment has no overt nominal
 * (e.g. "the king eats and drinks"), the synthetic-`you` subject from
 * single-clause parsing is replaced by the previous clause's subject
 * so the coordinated VP reads as a shared subject ("king eats … king
 * drinks").
 *
 * Falls back to a single-element array containing the original parse
 * (or an empty array on total parse failure) so callers can treat the
 * single- and multi-clause paths uniformly.
 */
export function parseSyntaxAll(tokens: EnglishToken[]): Sentence[] {
  // Relative-clause extraction. Detects "the king WHO sees the wolf
  // attacks" / "the king sees the wolf WHICH runs" — a wh-relativiser
  // (PUNCT-tagged WH_LEMMA preceded by N/PRON) introducing an
  // embedded clause inside an NP. We splice out the relative clause,
  // parse the matrix without it, then parse the rel-clause separately
  // with leadingWh set + subject inherited from the antecedent. The
  // result is rendered linearly (matrix … rel-clause) since our
  // realiser doesn't nest clauses inside NPs.
  const rel = extractRelativeClause(tokens);
  if (rel) {
    const matrixSentences = parseSyntaxAll(rel.matrix);
    const relSentence = parseSyntax(rel.relative);
    if (relSentence) {
      relSentence.leadingWh = { lemma: rel.relLemma };
      // When the rel-clause has no overt subject ("the wolf which
      // runs" — `which` is the subject), inherit a subject NP built
      // from the antecedent (the noun immediately preceding the
      // relativiser). This is the correct linguistic behaviour: the
      // relativiser's reference is the adjacent NP, not the matrix
      // clause's subject.
      if (relSentence.subject.head.synthesized) {
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
      return [...matrixSentences, relSentence];
    }
  }
  const verbCount = tokens.filter((t) => t.tag === "V").length;
  if (verbCount <= 1) {
    const single = parseSyntax(tokens);
    return single ? [single] : [];
  }
  // Locate CONJ / comma boundaries that have at least one V on each
  // side. Boundaries at index 0 are skipped — those are leading
  // discourse coordinators and are already handled by single-clause
  // parseSyntax via leadingConj.
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
  // Build segments. The boundary token itself is excluded from each
  // segment's token slice but, when it's a CONJ, recorded as the next
  // segment's leadingConj.
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
  // Collapse [empty + leadingConj][next-tokens] pairs into a single
  // segment so each entry has both fields populated.
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
    // Subject inheritance — when a non-first clause has no overt
    // nominal of its own, reuse the previous clause's subject so
    // coordinated VPs read with a shared subject. Without this,
    // single-clause parseSyntax injects a synthetic "you" subject
    // (its imperative fallback), which surfaces as a phantom 2sg
    // pronoun in clauses that should inherit the prior subject. The
    // `synthesized` flag distinguishes a real "you" subject (genuine
    // imperative) from the fabricated fallback.
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

/**
 * Detect and slice out a single English relative clause introduced
 * by a wh-relativiser (who / whom / whose / which / that). Returns
 * null when no relative clause is found.
 *
 * Heuristic: the relativiser must (a) be tagged PUNCT (the tokeniser
 * tags wh-words this way), (b) be preceded by an N/PRON antecedent,
 * (c) be followed by a V (the rel-clause verb), and (d) have a
 * second V somewhere after the rel-clause's content (the matrix
 * verb). The rel-clause is the token span between the relativiser
 * and the matrix V; the matrix is everything else.
 */
function extractRelativeClause(tokens: EnglishToken[]): {
  matrix: EnglishToken[];
  relative: EnglishToken[];
  relLemma: string;
  antecedent: EnglishToken;
} | null {
  for (let i = 1; i < tokens.length - 1; i++) {
    const t = tokens[i]!;
    // Wh-relativisers (who / which / whose / whom) tagged PUNCT, plus
    // the bare relativiser `that` tagged DET. Both surface in English
    // as "[antecedent] REL [verb] …".
    const isWhRel = t.tag === "PUNCT" && WH_LEMMAS.has(t.lemma);
    const isThatRel = t.tag === "DET" && t.lemma === "that";
    if (!isWhRel && !isThatRel) continue;
    const prev = tokens[i - 1]!;
    if (prev.tag !== "N" && prev.tag !== "PRON") continue;
    // Find the rel-clause V (next V after the wh).
    let relVIdx = -1;
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j]!.tag === "V") { relVIdx = j; break; }
    }
    if (relVIdx < 0) continue;
    // Find the matrix V. Two configurations:
    //   - center-embedded: rel-clause is between antecedent and the
    //     matrix V → matrix V comes AFTER the rel-V.
    //   - sentence-final: rel-clause sits at the end → matrix V comes
    //     BEFORE the wh.
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
  // `consumed` tracks every token index this NP (and its sub-NPs / PPs)
  // claims, so the top-level `collectPPs` walk doesn't re-emit
  // PPs that are already attributed to subject / object NPs.
  // Without it, "the king goes from the village to the river" stacks
  // the same PP up to 6× because every recursive collectNP("right")
  // re-walks subsequent PPs and `collectPPs` then re-walks them
  // again.
  const claim = (i: number) => consumed?.add(i);
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
      // Subject (left-direction) walk: don't stop here — keep
      // walking left to see if there's an EARLIER head reachable
      // by bridging back through a PP. "The wise king of the
      // wolves near the river sees" picks `river` first; we want
      // `king`. The PP-bridge is conservative: only span tokens
      // tagged PREP/DET/ADJ/NUM/N/PRON/CONJ in the bridge zone, no
      // V crossings.
      if (direction === "left") {
        let j = i - 1;
        let lastBridgedHead = i;
        // Walk back over what looks like a continuation of the same
        // NP. When we find another N with a PREP between it and the
        // last bridged head, adopt it as the new head and KEEP
        // walking — multi-PP subjects ("the king of the wolves near
        // the river") need to skip past every PP before settling on
        // the leftmost head.
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
              // No PREP between previous head and this earlier N —
              // they'd be apposition or a different clause. Stop.
              break;
            }
          }
          j--;
        }
      }
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
  claim(headIdx);

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
        // Mark the "of" PREP and any DETs between the original head
        // and "of" as consumed too, so the top-level collectPPs walk
        // doesn't re-emit them.
        for (let k = scan; k <= headIdx; k++) claim(k);
        // Swap to the real head.
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
  // Track the leftmost token index this NP claimed; used for the
  // coordination check below.
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
    // Possessive `'s` — the previous noun owns this one. Build a
    // possessor sub-NP from it, including any DETs that lead it.
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
      // Walk further back from the possessor to pick up its own
      // determiner ("the king's wolf" → possessor = NP{king, det=the}).
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

  // Coordinated NP detection — when this NP's left edge sits directly
  // after a CONJ ("the king and the wolf" → wolf's leftEdge=3, CONJ
  // at 2), recursively collect the NP to the left of the CONJ. The
  // result is the LEFTMOST member ("king") with `coord: {and, NP{wolf, …}}`
  // so the realiser emits "king AND wolf" in the right surface order.
  if (direction === "left" && leftEdge > 0) {
    const conjTok = tokens[leftEdge - 1];
    if (conjTok && conjTok.tag === "CONJ") {
      claim(leftEdge - 1);
      const leftCoord = collectNP(tokens, leftEdge - 1, "left", consumed);
      if (leftCoord) {
        // Build the rightmost member's NP first, then attach it as
        // the coord of the leftmost member.
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
          // pps fill in below for the OUTER NP; right member gets
          // empty pps to keep the recursive structure clean. PPs that
          // belong to the rightmost member of a coordination would
          // be attributed to the whole coord — close enough for now.
        };
        return {
          ...leftCoord,
          coord: { lemma: conjTok.lemma, np: rightMember },
        };
      }
    }
  }

  // Walk forward collecting trailing PPs that modify this noun.
  // ONLY the first "of X" PP attaches as a possessor — every other
  // trailing PP belongs to a higher slot (the verb, or another
  // sibling NP) and is collected by the top-level `collectPPs` sweep
  // in parseSyntax. Without this restriction, a PP chain like
  // "from the village to the river by the road" cascades:
  // village's NP greedily nests `to+river+by+road`, river greedily
  // nests `by+road`, etc. — and the realiser then emits each
  // nested PP at every depth, producing exponential duplication.
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

  // Right-side coordination — when an object NP is followed by a
  // CONJ ("the king sees the wolf and the dog"), recursively collect
  // the next NP and attach it as `coord`. Mirrors the left-side
  // coord detection above.
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
    // Pass `consumed` through so the recursive NP walk claims its
    // own indices — without this, `collectPPs` would re-enter on
    // PREPs that the just-collected NP folded in as nested PPs and
    // emit them again, producing exponential PP duplication on
    // chains like "from the village to the river by the road".
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
