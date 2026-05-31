import type { EnglishToken } from "./tokens";
import { WH_LEMMAS } from "./tokens";
import type { Sentence } from "./syntax";
import type {
  RoleClause,
  Participant,
  ParticipantModifier,
  PredicateFeatures,
  SemanticRole,
} from "./roleFrame";
import { roleClauseToSentence } from "./ast";
import { subjectRoleOf, objectRoleOf, argFrameFor } from "../lexicon/argFrames";

/**
 * parse.ts — Phase 73c Tier C Phase 3.
 *
 * English-token → RoleClause parser. Replaces the legacy
 * Sentence-emitting body. `parseSyntaxToClause` is the canonical
 * entry point; the legacy `parseSyntax(): Sentence` survives as a
 * thin wrapper that pipes through `roleClauseToSentence` for the
 * existing realiser. `parseSyntaxAllAsClauses` handles multi-clause
 * inputs (relative-clause extraction + S-coordination via
 * `RoleClause.coordinatedWith`).
 *
 * The 8 construction sites the plan called out — subject pronoun
 * fallbacks (WH-subject, imperative "you"), predicate framing,
 * relative-clause subject fill-in, RC attachment, NP collection
 * (pronoun + lexical head paths), PP collection, NP-coordination —
 * all now build `Participant`/`PredicateFrame` directly. Modifiers
 * (determiner, adjectives, possessor, numeral, coord, relative,
 * PPs) hang on `Participant.modifiers`.
 *
 * Key exports: parseSyntaxToClause, parseSyntaxAllAsClauses,
 * parseSyntax (wrapper), parseSyntaxAll (wrapper).
 */

// ─────────────────────────────────────────────────────────────────────
// Preposition → role mapping. Mirrors the table in ast.ts; kept
// inline here so the parser is independent of the adapter.
// ─────────────────────────────────────────────────────────────────────

const PREP_ROLE_TABLE: Record<string, SemanticRole> = {
  in: "location",
  on: "location",
  at: "location",
  near: "location",
  under: "location",
  over: "location",
  through: "manner",
  from: "source",
  out: "source",
  to: "goal",
  toward: "goal",
  into: "goal",
  with: "instrument",
  by: "instrument",
  for: "recipient",
  during: "time",
  before: "time",
  after: "time",
  of: "agent",
};

function prepToRole(lemma: string): SemanticRole {
  return PREP_ROLE_TABLE[lemma] ?? "location";
}

// Copular + linking verbs that take a predicate-adjective complement like "be"
// ("the man seems/looks/feels/becomes big"). Cross-linguistically a natural
// class (copula support); the simulator routes them through the copular
// complement path. Transitive uses are excluded by the `!object` guard.
const LINKING_VERBS = new Set([
  "be", "seem", "appear", "become", "remain", "stay", "look", "feel", "sound", "grow",
]);

// ─────────────────────────────────────────────────────────────────────
// Participant collection. Mirrors the legacy collectNP's structural
// decisions (head detection, possessor, determiner, adjectives,
// numeral, NP-coord, of-genitive) but emits Participant directly.
// ─────────────────────────────────────────────────────────────────────

function collectParticipant(
  tokens: EnglishToken[],
  pivot: number,
  direction: "left" | "right",
  consumed: Set<number>,
  role: SemanticRole,
): Participant | null {
  const claim = (i: number) => consumed.add(i);
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
    // Skip heads already claimed by an earlier participant (lets the
    // ditransitive pass collect the theme after the recipient is consumed).
    // No-op for the existing single-object calls — nothing in their scan path
    // is pre-consumed.
    if (consumed.has(i)) continue;
    if (t.tag === "N" || t.tag === "PRON") {
      headIdx = i;
      if (direction === "left") {
        // Bridge over PP-separated heads ("the king of the realm").
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
    // Phase 74: "than" introduces a comparative standard, not an object. Don't
    // grab the NP after it ("the king is bigger than the dog" must not collect
    // "dog" as a patient — that suppressed the copular complement sweep and
    // dropped the comparative adjective, yielding "king is dog").
    if (t.lemma === "than") break;
  }
  if (headIdx < 0) return null;
  claim(headIdx);

  let headTok = tokens[headIdx]!;
  const modifiers: ParticipantModifier[] = [];

  // of-genitive: "the X of Y" — Y becomes the possessor; head is X.
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
        const possessor: Participant = {
          lemma: headTok.lemma,
          pos: headTok.tag === "PRON" ? "PRON" : "N",
          role: "agent",
          features: {
            number: headTok.features.number === "pl" ? "pl" : "sg",
            ...(headTok.features.person ? { person: (headTok.features.person ?? "3") as "1" | "2" | "3" } : { person: "3" }),
            ...(headTok.tag === "PRON" ? { isPronoun: true } : {}),
          },
        };
        modifiers.push({ kind: "possessor", participant: possessor });
        for (let k = scan; k <= headIdx; k++) claim(k);
        headIdx = realHeadIdx;
        claim(headIdx);
        headTok = tokens[headIdx]!;
      }
    }
  }

  // Walk left: determiners, adjectives, numerals, pronominal possessors.
  let leftEdge = headIdx;
  let leftMostAdjective = headIdx;
  const adjectives: { lemma: string; degree?: import("./syntax").Degree }[] = [];
  for (let i = headIdx - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t.tag === "ADJ") {
      const deg = t.features.degree;
      adjectives.unshift({
        lemma: t.lemma,
        ...(deg && deg !== "positive" ? { degree: deg } : {}),
      });
      leftMostAdjective = i;
      leftEdge = i;
      claim(i);
      continue;
    }
    if (t.tag === "DET") {
      modifiers.push({ kind: "determiner", lemma: t.lemma });
      leftEdge = i;
      claim(i);
      continue;
    }
    if (t.tag === "NUM") {
      modifiers.push({ kind: "numeral", lemma: t.lemma, ...(t.features.ordinal ? { ordinal: true } : {}) });
      leftEdge = i;
      claim(i);
      continue;
    }
    if ((t.tag === "N" || t.tag === "PRON") && t.features.possessor) {
      const possessor: Participant = {
        lemma: t.lemma,
        pos: t.tag === "PRON" ? "PRON" : "N",
        role: "agent",
        features: {
          number: t.features.number === "pl" ? "pl" : "sg",
          person: (t.features.person ?? "3") as "1" | "2" | "3",
          ...(t.tag === "PRON" ? { isPronoun: true } : {}),
        },
      };
      const possessorMods: ParticipantModifier[] = [];
      leftEdge = i;
      claim(i);
      for (let j = i - 1; j >= 0; j--) {
        const pt = tokens[j]!;
        if (pt.tag === "DET") {
          possessorMods.push({ kind: "determiner", lemma: pt.lemma });
          leftEdge = j;
          claim(j);
          continue;
        }
        break;
      }
      if (possessorMods.length > 0) possessor.modifiers = possessorMods;
      modifiers.push({ kind: "possessor", participant: possessor });
      break;
    }
    break;
  }
  // Adjectives are layered onto modifiers in legacy order (leftmost first).
  for (const adj of adjectives) {
    modifiers.push({ kind: "adjective", lemma: adj.lemma, ...(adj.degree ? { degree: adj.degree } : {}) });
  }
  // Adjective edge wins for leftEdge if it's leftmost.
  if (leftMostAdjective < leftEdge) leftEdge = leftMostAdjective;

  // Left-coord: "X and Y verb …" — the entire left coordinand is built recursively.
  if (direction === "left" && leftEdge > 0) {
    const conjTok = tokens[leftEdge - 1];
    if (conjTok && conjTok.tag === "CONJ") {
      claim(leftEdge - 1);
      const leftCoord = collectParticipant(tokens, leftEdge - 1, "left", consumed, role);
      if (leftCoord) {
        // The CURRENT participant becomes the right member of the coord.
        const rightMember: Participant = {
          lemma: headTok.lemma,
          pos: headTok.tag === "PRON" ? "PRON" : "N",
          role,
          features: {
            number: headTok.features.number === "pl" ? "pl" : "sg",
            person: (headTok.features.person ?? "3") as "1" | "2" | "3",
            ...(headTok.tag === "PRON" ? { isPronoun: true } : {}),
          },
          ...(modifiers.length > 0 ? { modifiers } : {}),
        };
        const coordMod: ParticipantModifier = {
          kind: "coordination",
          conjunction: conjTok.lemma,
          participant: rightMember,
        };
        const leftMods = leftCoord.modifiers ? [...leftCoord.modifiers, coordMod] : [coordMod];
        return { ...leftCoord, modifiers: leftMods };
      }
    }
  }

  // Right-side: of-PP attachment to head.
  let rightEdge = headIdx;
  if (
    headIdx + 1 < tokens.length &&
    tokens[headIdx + 1]!.tag === "PREP" &&
    tokens[headIdx + 1]!.lemma === "of" &&
    !modifiers.some((m) => m.kind === "possessor")
  ) {
    const ofIdx = headIdx + 1;
    claim(ofIdx);
    const sub = collectParticipant(tokens, ofIdx, "right", consumed, "agent");
    if (sub) {
      modifiers.push({ kind: "possessor", participant: sub });
    }
    let i = ofIdx;
    while (i + 1 < tokens.length && tokens[i + 1]!.tag !== "PREP") {
      i++;
      claim(i);
    }
    rightEdge = i;
  }

  // Right-coord: "verb X and Y" — chain a follow-up object coordinand.
  if (direction === "right" && rightEdge + 1 < tokens.length) {
    const conjTok = tokens[rightEdge + 1];
    if (conjTok && conjTok.tag === "CONJ") {
      claim(rightEdge + 1);
      const next = collectParticipant(tokens, rightEdge + 1, "right", consumed, role);
      if (next) {
        modifiers.push({ kind: "coordination", conjunction: conjTok.lemma, participant: next });
      }
    }
  }

  return {
    lemma: headTok.lemma,
    pos: headTok.tag === "PRON" ? "PRON" : "N",
    role,
    features: {
      number: headTok.features.number === "pl" ? "pl" : "sg",
      person: (headTok.features.person ?? "3") as "1" | "2" | "3",
      ...(headTok.tag === "PRON" ? { isPronoun: true } : {}),
    },
    ...(modifiers.length > 0 ? { modifiers } : {}),
  };
}

function collectAdjunctParticipants(tokens: EnglishToken[], consumed: Set<number>): Participant[] {
  const out: Participant[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    if (tokens[i]!.tag !== "PREP") continue;
    consumed.add(i);
    const prep = tokens[i]!.lemma;
    const np = collectParticipant(tokens, i, "right", consumed, prepToRole(prep));
    if (!np) continue;
    out.push({ ...np, adjunct: true, preposition: prep });
  }
  return out;
}

function collectMannerParticipants(tokens: EnglishToken[], consumed: Set<number>): Participant[] {
  const out: Participant[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    // ADV tokens are manner adverbs. A still-unconsumed ADJ at this point is a
    // FLAT (zero-derived) manner adverb — "the dog runs fast" — because the NP
    // walk and copular-complement sweep have already claimed attributive and
    // predicate adjectives; a leftover adjective is functioning adverbially.
    if (tokens[i]!.tag !== "ADV" && tokens[i]!.tag !== "ADJ") continue;
    out.push({
      lemma: tokens[i]!.lemma,
      pos: "N",
      role: "manner",
      adjunct: true,
    });
    consumed.add(i);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Feature inference: honorific + evidential cues.
// ─────────────────────────────────────────────────────────────────────

const HONORIFIC_TRIGGERS = new Set([
  "please", "kindly", "sir", "madam", "ma'am", "lord", "lady", "honored", "respected",
]);

function inferHonorific(tokens: EnglishToken[]): boolean {
  for (const t of tokens) {
    if (HONORIFIC_TRIGGERS.has(t.lemma.toLowerCase())) return true;
  }
  return false;
}

const REPORTATIVE_LEMMAS = new Set(["say", "tell", "speak"]);
const INFERRED_LEMMAS = new Set(["think", "know", "guess", "suppose", "seem"]);
const DIRECT_LEMMAS = new Set(["see", "hear", "feel", "watch", "listen"]);

function inferEvidential(verbBase: string, _tokens: EnglishToken[]): import("./syntax").Evidential | undefined {
  if (REPORTATIVE_LEMMAS.has(verbBase)) return "reportative";
  if (INFERRED_LEMMAS.has(verbBase)) return "inferred";
  if (DIRECT_LEMMAS.has(verbBase)) return "direct";
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────
// Primary entry point: tokens → RoleClause.
// ─────────────────────────────────────────────────────────────────────

export function parseSyntaxToClause(tokens: EnglishToken[]): RoleClause | null {
  // leadingConj — clause-level coordinator like "and X went home".
  let leadingConj: { lemma: string } | undefined;
  if (tokens.length > 0 && tokens[0]!.tag === "CONJ") {
    leadingConj = { lemma: tokens[0]!.lemma };
  }
  // leadingWh — interrogative or relative head.
  let leadingWh: { lemma: string } | undefined;
  for (const t of tokens) {
    if (t.tag === "PUNCT" && WH_LEMMAS.has(t.lemma)) {
      leadingWh = { lemma: t.lemma };
      break;
    }
    if (t.tag === "V") break;
  }
  // Find verb head, promoting copula / AUX where no V exists.
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

  // Negation: scan around the verb for not / n't / never.
  let negated = false;
  for (let i = Math.max(0, verbIdx - 3); i < Math.min(tokens.length, verbIdx + 4); i++) {
    const t = tokens[i]!;
    if (t.lemma === "not" || t.lemma === "n't" || t.lemma === "never") {
      negated = true;
    }
  }

  // Interrogative: trailing "?" OR initial AUX (yes-no question).
  let interrogative = false;
  if (tokens.length > 0 && tokens[tokens.length - 1]!.lemma === "?") {
    interrogative = true;
  }
  // A sentence-initial AUX signals a polar (yes-no) question via
  // subject-auxiliary inversion ("does the man see…?"). But "do/does/did"
  // immediately followed by "not" is do-support NEGATION, not inversion —
  // "do not see the dog" is a negative imperative, not a question. Excluding
  // it stops a spurious interrogative (e.g. an intonation "?" being appended).
  if (tokens.length > 0 && tokens[0]!.tag === "AUX") {
    const first = tokens[0]!.lemma;
    const isDoSupportNegation =
      (first === "do" || first === "does" || first === "did") &&
      tokens[1]?.lemma === "not";
    if (!isDoSupportNegation) interrogative = true;
  }

  // Aspect / mood / voice cues from preceding AUX.
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
  // A verb is "effectively initial" when everything before it is a skippable
  // opener: PUNCT only (a politeness/interjection opener like "please give me…")
  // → imperative; PUNCT-or-AUX (also do-support/aux questions) → still allows the
  // synthesised "you" subject. Without this, "please give me the stone" left the
  // verb at index 1, failed imperative detection, found no subject, and the whole
  // clause fell back to word-by-word (dropping the recipient's dative handling).
  const beforeVerb = tokens.slice(0, verbIdx);
  const verbInitialModuloPunct = beforeVerb.every((t) => t.tag === "PUNCT");
  const verbInitialModuloAux = beforeVerb.every((t) => t.tag === "PUNCT" || t.tag === "AUX");
  if (verbInitialModuloPunct) {
    mood = "imperative";
  }

  const consumed = new Set<number>();
  consumed.add(verbIdx);

  // Phase 73c Phase 5: dispatch subject + object roles on the
  // predicate's lexical argFrame. `see` → experiencer + stimulus,
  // `fall` → theme (subject), `give` → agent + theme, etc.
  const subjectRole = subjectRoleOf(verbTok.lemma);
  const objectRole = objectRoleOf(verbTok.lemma);

  // Subject collection. Pronoun fallbacks construct synthesised
  // participants directly (no longer goes through NP shape).
  let subject = collectParticipant(tokens, verbIdx, "left", consumed, subjectRole);
  if (!subject) {
    const whSubjectLemmas = new Set(["who", "what", "which", "whoever", "whatever"]);
    const leftIsBareWh =
      leadingWh &&
      whSubjectLemmas.has(leadingWh.lemma) &&
      tokens.slice(0, verbIdx).every((t) => t.tag === "PUNCT" || t.tag === "AUX");
    if (leftIsBareWh) {
      subject = {
        lemma: leadingWh!.lemma,
        pos: "PRON",
        role: subjectRole,
        features: { number: "sg", person: "3", isPronoun: true, synthesized: true },
      };
      leadingWh = undefined;
    } else if (verbInitialModuloAux) {
      subject = {
        lemma: "you",
        pos: "PRON",
        role: subjectRole,
        features: { number: "sg", person: "2", isPronoun: true, synthesized: true },
      };
    } else {
      return null;
    }
  }

  // Equative comparison: "X is as big as Y" — a similative/equative construction
  // (Stassen: typologically distinct from the comparative; equal degree, marked
  // by a 'like/same' marker, not the comparative 'than'). The English bracket is
  // "as ADJ as STANDARD"; both "as" tokenise as CONJ. Capture the ADJ as an
  // equative-degree complement and STANDARD as a standard-of-comparison oblique
  // marked with an equative particle. Run BEFORE object collection so the
  // collector (which doesn't break on CONJ) can't grab STANDARD as a patient.
  let equativeAdjective: { lemma: string; degree: "equative" } | undefined;
  let equativeStandard: Participant | undefined;
  if (LINKING_VERBS.has(verbTok.lemma)) {
    const as1 = tokens.findIndex(
      (t, i) => i > verbIdx && t.tag === "CONJ" && t.lemma === "as" && !consumed.has(i),
    );
    if (as1 >= 0 && tokens[as1 + 1]?.tag === "ADJ") {
      const adjIdx = as1 + 1;
      const as2 = adjIdx + 1;
      if (tokens[as2]?.tag === "CONJ" && tokens[as2]!.lemma === "as") {
        consumed.add(as1);
        consumed.add(adjIdx);
        consumed.add(as2);
        equativeAdjective = { lemma: tokens[adjIdx]!.lemma, degree: "equative" };
        const std = collectParticipant(tokens, as2, "right", consumed, "stimulus") ?? undefined;
        if (std) equativeStandard = { ...std, adjunct: true, preposition: "as" };
      }
    }
  }

  // Object collection (right of verb).
  let object = collectParticipant(tokens, verbIdx, "right", consumed, objectRole) ?? undefined;

  // English double-object ditransitive: "give RECIPIENT THEME" (two bare NPs,
  // e.g. "give you the big stone"). The argframe marks a recipient; the FIRST
  // post-verbal NP is the recipient and the SECOND is the theme. Pre-fix the
  // parser kept only the first NP (mislabelled theme) and silently dropped the
  // real theme. collectParticipant breaks at PREP, so the prepositional dative
  // ("give the stone to you") has no second bare NP and stays mono-transitive
  // (the recipient is picked up as a PP adjunct). The recipient surfaces as a
  // dative "to"-PP, placed per the target language's adposition typology.
  let recipient: Participant | undefined;
  const vframe = argFrameFor(verbTok.lemma);
  if (object && vframe && vframe.includes("recipient")) {
    const theme = collectParticipant(tokens, verbIdx, "right", consumed, "theme") ?? undefined;
    if (theme) {
      recipient = { ...object, role: "recipient", adjunct: true, preposition: "to" };
      object = theme;
    }
  }

  // Copular complement: a copula/LINKING verb with no direct object takes a
  // predicate adjective ("the man is/seems/looks/feels big"). The !object guard
  // keeps the transitive uses ("the man feels the dog") on the normal path.
  const complement: { lemma: string; degree?: import("./syntax").Degree }[] = [];
  if (LINKING_VERBS.has(verbTok.lemma) && !object) {
    for (let i = verbIdx + 1; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (consumed.has(i)) continue;
      if (t.tag === "ADJ") {
        const deg = t.features.degree;
        complement.push({
          lemma: t.lemma,
          ...(deg && deg !== "positive" ? { degree: deg } : {}),
        });
        consumed.add(i);
        continue;
      }
      if (t.tag === "PUNCT" || t.tag === "AUX" || t.tag === "DET") continue;
      break;
    }
  }
  // The equative adjective ("as big as Y") is the predicate property; surface it
  // as an equative-degree complement so the realiser marks equal-degree.
  if (equativeAdjective) complement.push(equativeAdjective);

  // Comparative standard: "X is bigger than Y" — capture "than Y" as a
  // standard-of-comparison oblique (a "than"-PP) so it surfaces rather than
  // being dropped. The comparative adjective is the complement above;
  // collectParticipant breaks at "than", so Y wasn't grabbed as an object.
  let comparativeStandard: Participant | undefined;
  const thanIdx = tokens.findIndex((t, i) => i > verbIdx && t.lemma === "than" && !consumed.has(i));
  if (thanIdx >= 0) {
    consumed.add(thanIdx);
    const std = collectParticipant(tokens, thanIdx, "right", consumed, "stimulus") ?? undefined;
    if (std) comparativeStandard = { ...std, adjunct: true, preposition: "than" };
  }

  // PP adjuncts.
  const ppAdjuncts = collectAdjunctParticipants(tokens, consumed);
  // Adverb manner participants.
  const adverbs = collectMannerParticipants(tokens, consumed);

  // Passive valency (language-agnostic). In an active clause the
  // surface subject is the agent/experiencer and the direct object is
  // the patient/stimulus. The passive REMAPS those grammatical
  // relations: the underlying OBJECT is promoted to surface subject
  // (Relational Grammar 2→1 advancement / patient promotion), and the
  // underlying AGENT is demoted to an oblique chômeur — the English
  // "by"-phrase. Positional slotting already puts the patient in
  // subject position (it's the leftmost NP); here we correct the
  // SEMANTIC role labels so downstream consumers (case/agreement,
  // narrative) see the right argument structure regardless of the
  // target language's voice morphology. Surface order is unchanged.
  if (voice === "passive") {
    // Promote: the passive subject bears the verb's OBJECT role
    // (patient/stimulus), not its active subject role (agent/experiencer).
    subject = { ...subject, role: objectRoleOf(verbTok.lemma) };
    // Demote: the agentive "by"-phrase is the underlying agent, not a
    // plain instrument. True instrumentals ("with"), locatives, etc. are
    // left untouched.
    for (const a of ppAdjuncts) {
      if (a.preposition === "by") a.role = "agent";
    }
  }

  const tense: "past" | "present" | "future" = verbTok.features.tense ?? "present";
  const verbBase = verbTok.lemma;
  const evidential = inferEvidential(verbBase, tokens);
  const honorific = inferHonorific(tokens);

  const predFeatures: PredicateFeatures = {
    tense,
    ...(aspect ? { aspect } : {}),
    ...(mood ? { mood } : {}),
    ...(voice ? { voice } : {}),
    ...(evidential ? { evidential } : {}),
    ...(honorific ? { honorific: true } : {}),
  };

  if (leadingWh) interrogative = true;

  const participants: Participant[] = [subject];
  if (object) participants.push(object);
  if (recipient) participants.push(recipient);
  if (comparativeStandard) participants.push(comparativeStandard);
  if (equativeStandard) participants.push(equativeStandard);
  participants.push(...ppAdjuncts);
  participants.push(...adverbs);

  return {
    kind: "RoleClause",
    predicate: {
      lemma: verbBase,
      features: predFeatures,
      ...(complement.length > 0 ? { complement } : {}),
    },
    participants,
    ...(negated ? { negated: true } : {}),
    ...(interrogative ? { interrogative: true } : {}),
    ...(leadingConj ? { leadingConj } : {}),
    ...(leadingWh ? { leadingWh } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Multi-clause: RC extraction + S-coordination.
// ─────────────────────────────────────────────────────────────────────

function findAntecedentParticipant(
  clauses: RoleClause[],
  lemma: string,
): Participant | null {
  for (const c of clauses) {
    for (const p of c.participants) {
      if (p.lemma === lemma) return p;
      // Search modifiers' nested participants.
      for (const mod of p.modifiers ?? []) {
        if (mod.kind === "oblique" && mod.participant.lemma === lemma) return mod.participant;
        if (mod.kind === "coordination" && mod.participant.lemma === lemma) return mod.participant;
        if (mod.kind === "possessor" && mod.participant.lemma === lemma) return mod.participant;
      }
    }
  }
  return null;
}

interface RelExtraction {
  matrix: EnglishToken[];
  relative: EnglishToken[];
  antecedent: EnglishToken;
  relLemma: string;
}

function extractRelativeClause(tokens: EnglishToken[]): RelExtraction | null {
  for (let i = 1; i < tokens.length - 1; i++) {
    const t = tokens[i]!;
    const isWhRel = t.tag === "PUNCT" && WH_LEMMAS.has(t.lemma);
    // Phase 73c Phase 3: legacy `isThatRel` checked only DET-tagged
    // "that"; the tokenizer actually emits PRON for "that" in
    // post-nominal contexts (relative clauses), so the legacy code
    // silently dropped most "that"-RC inputs. Widened to accept both
    // tags here so PRON-tagged "that" is recognised.
    const isThatRel = (t.tag === "DET" || t.tag === "PRON") && t.lemma === "that";
    if (!isWhRel && !isThatRel) continue;
    const prev = tokens[i - 1]!;
    if (prev.tag !== "N" && prev.tag !== "PRON") continue;
    // A predicate head is a lexical verb OR a copular AUX ("is/are/was…",
    // lemmatised to "be"). Treating the copula as a verb here lets a copular
    // matrix ("the dog that runs IS big") or a copular RC ("the dog that IS
    // big runs") be split correctly — otherwise no matrix verb was found and
    // the whole sentence mis-parsed as a single clause ("that run").
    const isPredHead = (t2: EnglishToken) =>
      t2.tag === "V" || (t2.tag === "AUX" && t2.lemma === "be");
    // Find the relative-clause predicate head (first after the relativiser).
    let relVIdx = -1;
    for (let j = i + 1; j < tokens.length; j++) {
      if (isPredHead(tokens[j]!)) { relVIdx = j; break; }
    }
    if (relVIdx < 0) continue;
    // Matrix predicate head AFTER the RC verb (typical for subject-RC).
    let matrixVAfter = -1;
    for (let j = relVIdx + 1; j < tokens.length; j++) {
      if (isPredHead(tokens[j]!)) { matrixVAfter = j; break; }
    }
    if (matrixVAfter >= 0) {
      return {
        matrix: [...tokens.slice(0, i), ...tokens.slice(matrixVAfter)],
        relative: tokens.slice(i + 1, matrixVAfter),
        antecedent: prev,
        relLemma: t.lemma,
      };
    }
    // Matrix predicate head BEFORE the RC (post-modifier on object).
    let matrixVBefore = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (isPredHead(tokens[j]!)) { matrixVBefore = j; break; }
    }
    if (matrixVBefore >= 0) {
      return {
        matrix: tokens.slice(0, i),
        relative: tokens.slice(i + 1),
        antecedent: prev,
        relLemma: t.lemma,
      };
    }
  }
  return null;
}

export function parseSyntaxAllAsClauses(tokens: EnglishToken[]): RoleClause[] {
  const rel = extractRelativeClause(tokens);
  if (rel) {
    const matrixClauses = parseSyntaxAllAsClauses(rel.matrix);
    const relClause = parseSyntaxToClause(rel.relative);
    if (relClause) {
      relClause.leadingWh = { lemma: rel.relLemma };
      // Detect subject-gap: the relative clause's first participant is
      // synthesised (we'd have failed to find a real subject token).
      const relSubject = relClause.participants[0];
      const subjectGap = !!relSubject?.features?.synthesized;
      if (subjectGap) {
        const a = rel.antecedent;
        relClause.participants[0] = {
          lemma: a.lemma,
          pos: a.tag === "PRON" ? "PRON" : "N",
          role: "agent",
          features: {
            number: a.features.number === "pl" ? "pl" : "sg",
            person: (a.features.person ?? "3") as "1" | "2" | "3",
            ...(a.tag === "PRON" ? { isPronoun: true } : {}),
          },
        };
      }
      // Attach the RC to the matrix participant whose lemma matches.
      const ant = findAntecedentParticipant(matrixClauses, rel.antecedent.lemma);
      if (ant) {
        const relizerLemma =
          rel.relLemma === "who" || rel.relLemma === "which" || rel.relLemma === "that"
            ? rel.relLemma
            : "that";
        const mod: ParticipantModifier = {
          kind: "relative",
          clause: relClause,
          relativiser: relizerLemma,
          subjectGap,
        };
        ant.modifiers = ant.modifiers ? [...ant.modifiers, mod] : [mod];
        return matrixClauses;
      }
      return [...matrixClauses, relClause];
    }
  }
  // Multi-verb S-coordination: split on CONJ/PUNCT boundaries that
  // separate verb-bearing segments.
  const verbCount = tokens.filter((t) => t.tag === "V").length;
  if (verbCount <= 1) {
    const single = parseSyntaxToClause(tokens);
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
    const single = parseSyntaxToClause(tokens);
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
  const out: RoleClause[] = [];
  for (let k = 0; k < merged.length; k++) {
    const seg = merged[k]!;
    const c = parseSyntaxToClause(seg.tokens);
    if (!c) continue;
    if (seg.leadingConj && !c.leadingConj) c.leadingConj = seg.leadingConj;
    // S-coordination subject inheritance: when a follow-up clause's
    // subject is synthesised (no real token), inherit from the prior
    // clause IFF the segment has no SUBJECT of its own. Only a nominal in
    // subject position (before the verb) counts — an OBJECT nominal after
    // the verb must not block inheritance ("the man walks and sees the dog"
    // → the 2nd clause has a gapped subject + object 'dog'; it should inherit
    // 'man', not default to 'you').
    if (k > 0 && out.length > 0 && c.participants[0]?.features?.synthesized) {
      const segVerbIdx = seg.tokens.findIndex((t) => t.tag === "V");
      const segHasSubjectNominal = seg.tokens.some(
        (t, ti) => (t.tag === "N" || t.tag === "PRON") && (segVerbIdx < 0 || ti < segVerbIdx),
      );
      if (!segHasSubjectNominal) {
        const prevSubject = out[out.length - 1]!.participants[0];
        if (prevSubject) c.participants[0] = prevSubject;
      }
    }
    out.push(c);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Back-compat wrappers. The existing realiser consumes `Sentence`;
// these wrappers pipe through `roleClauseToSentence` so callers see
// no signature change. Phase 4 will narrow the realiser to consume
// `RoleClause` directly and these wrappers become deprecation shims.
// ─────────────────────────────────────────────────────────────────────

export function parseSyntax(tokens: EnglishToken[]): Sentence | null {
  const rc = parseSyntaxToClause(tokens);
  return rc ? roleClauseToSentence(rc) : null;
}

export function parseSyntaxAll(tokens: EnglishToken[]): Sentence[] {
  const clauses = parseSyntaxAllAsClauses(tokens);
  const out: Sentence[] = [];
  for (const c of clauses) {
    const s = roleClauseToSentence(c);
    if (s) out.push(s);
  }
  return out;
}
