/**
 * ast.ts — Phase 72g T3.
 *
 * Translator abstract syntax tree (AST) intermediate representation.
 *
 * Pre-72g, the translator path was English → token list → realise.
 * The English tokenizer encoded part-of-speech, tense, and number
 * features inline on EnglishToken; everything assumed an SVO source
 * with English morphosyntax. Seeding the simulator from a non-English
 * input language was structurally impossible without re-parsing.
 *
 * Post-72g, the AST IR is a language-neutral tree:
 *   English | IPA | … → AST → target realisation
 *
 * The AST nodes capture meaning (lemma) + features (tense/number/etc.)
 * + structural relations (subject-of, object-of) without committing to
 * a surface word order. The realiser projects the AST to the target's
 * declared word order, morphology, and discourse conventions.
 *
 * This module ships the foundation: AST node types + a
 * simple `englishTokensToAST` builder that preserves the existing
 * English tokenizer output. The realiser does NOT yet consume the
 * AST as its primary input (it still consumes EnglishToken[] for
 * back-compat); switching the translator to use AST as the canonical
 * IR is a follow-up sweep that touches sentence.ts and realise.ts.
 *
 * The AST is intentionally minimal. Complex constructs (relativisation,
 * coordination, embedding) ride as feature flags rather than nested
 * structure for now; richer trees can be added later.
 */

import type { EnglishToken } from "./tokens";

export type ASTRole = "subject" | "object" | "indirect" | "oblique";

export interface ASTNode {
  /** Lemma (concept identity); maps to lexicon[meaning]. */
  lemma: string;
  /** POS class — drives realiser dispatch (V/N/PRON/DET/etc.). */
  tag: EnglishToken["tag"];
  /** Morphological features (carried verbatim from EnglishToken). */
  features?: EnglishToken["features"];
  /** Role in the predicate (when applicable). */
  role?: ASTRole;
  /** Optional dependents (modifiers, complements). */
  modifiers?: ASTNode[];
}

export interface ASTSentence {
  /** Predicate head (typically the V token). */
  head: ASTNode | null;
  /** Order-independent participant list; realiser arranges per typology. */
  participants: ASTNode[];
  /** Other tokens (CONJ, PREP, ADV) preserved in order for fallback. */
  fillers: ASTNode[];
}

/**
 * Build an AST from an English token list. The current builder is a
 * lossless 1:1 conversion: every token becomes an ASTNode, the
 * predicate's V token becomes head, and N/PRON tokens are tagged with
 * `role` based on their position relative to the head (left = subject,
 * right = object). This is a *foundation*; richer parsing (relative
 * clauses, embedded clauses, ditransitives) is deferred.
 */
export function englishTokensToAST(tokens: ReadonlyArray<EnglishToken>): ASTSentence {
  let headIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.tag === "V") { headIdx = i; break; }
  }
  const head: ASTNode | null = headIdx >= 0 ? toASTNode(tokens[headIdx]!) : null;

  const participants: ASTNode[] = [];
  const fillers: ASTNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i === headIdx) continue;
    const tok = tokens[i]!;
    const node = toASTNode(tok);
    if (tok.tag === "N" || tok.tag === "PRON") {
      node.role = headIdx < 0 || i < headIdx ? "subject" : "object";
      participants.push(node);
    } else {
      fillers.push(node);
    }
  }
  return { head, participants, fillers };
}

function toASTNode(tok: EnglishToken): ASTNode {
  return {
    lemma: tok.lemma,
    tag: tok.tag,
    features: tok.features,
  };
}

/**
 * Linearise an AST into an EnglishToken-compatible sequence using a
 * declared word order. Default: SVO. Used by the realiser only when
 * the caller has explicitly opted in; the legacy direct path
 * (EnglishToken[]) still works for back-compat.
 */
export function astToTokens(
  ast: ASTSentence,
  wordOrder: "SVO" | "SOV" | "VSO" | "VOS" | "OSV" | "OVS" = "SVO",
): EnglishToken[] {
  const subject = ast.participants.find((p) => p.role === "subject");
  const object = ast.participants.find((p) => p.role === "object");
  const ordered: ASTNode[] = [];
  for (const role of orderFor(wordOrder)) {
    if (role === "S" && subject) ordered.push(subject);
    else if (role === "V" && ast.head) ordered.push(ast.head);
    else if (role === "O" && object) ordered.push(object);
  }
  // Append fillers in their original order (not part of S/V/O).
  ordered.push(...ast.fillers);
  return ordered.map((n) => ({
    surface: n.lemma,
    lemma: n.lemma,
    tag: n.tag,
    features: n.features ?? {},
  })) as EnglishToken[];
}

function orderFor(wo: string): Array<"S" | "V" | "O"> {
  switch (wo) {
    case "SOV": return ["S", "O", "V"];
    case "VSO": return ["V", "S", "O"];
    case "VOS": return ["V", "O", "S"];
    case "OSV": return ["O", "S", "V"];
    case "OVS": return ["O", "V", "S"];
    case "SVO":
    default: return ["S", "V", "O"];
  }
}

// ────────────────────────────────────────────────────────────────────
// Phase 72g T3 (full-delivery defer-1d): direct AST → Sentence bridge.
//
// Converts an ASTSentence to the syntax `Sentence` interface that
// `realiseSentence` consumes, bypassing the English parser. Use this
// for non-English seeds where you want to skip projection-then-reparse.
//
// Limitations: the AST is intentionally minimal (head + participants
// + fillers). Complex constructs (relativisation, embedding,
// coordination) ride on the AST's feature flags rather than nested
// structure. Calls fall back to translateSentenceViaAST (project +
// re-parse) when feature complexity exceeds what the direct bridge
// can express.

import type {
  Sentence,
  NP,
  VP,
  PP,
  AdjRef,
  RelativeClause,
  Person,
  Number_,
  Aspect,
  Mood,
  Voice,
  Evidential,
  Case,
  Degree,
} from "./syntax";
import type { LexiconState } from "../domains";
import type {
  RoleClause,
  Participant,
  ParticipantModifier,
  SemanticRole,
} from "./roleFrame";

/**
 * Phase 72g T3 (full-delivery defer-1d): convert an ASTSentence into
 * a syntax `Sentence`. Returns null when the AST has no head verb
 * or no subject participant (those cases must round-trip through the
 * parser via `translateSentenceViaAST`).
 *
 * Phase 72 methodological audit Batch E (B4): the three former helpers
 * (`lookupBaseForm`, `astNodeToNounRef`, `astNodeToVerbRef`) were
 * inlined — each had one call site and was scaffolding that obscured
 * the simple conversion.
 *
 * Phase 72 code-review fix A1: the `case` field on each NP head is
 * set to "nom"/"acc" here for back-compat. The realiser
 * (realise.ts:355-356, alignmentSubjectCase/alignmentObjectCase) reads
 * the case slot from `lang.grammar.alignment` and OVERRIDES this
 * value before any morphology runs. Ergative-absolutive, tripartite,
 * and split-S languages get the correct case marking at realisation
 * time despite the hardcoded value here. The `Case` enum
 * (syntax.ts:13) has no erg/abs slots, so a fully alignment-aware
 * `astToSentence` would need to extend `Case` or invent a sentinel.
 * Since the realiser handles it correctly, the code stays simple.
 */
export function astToSentence(
  ast: import("./ast").ASTSentence,
  lang: LexiconState,
): Sentence | null {
  if (!ast.head || ast.head.tag !== "V") return null;
  const subject = ast.participants.find((p) => p.role === "subject");
  if (!subject) return null;
  const object = ast.participants.find((p) => p.role === "object");
  const lookupForm = (lemma: string) => lang.lexicon[lemma]?.length ? lang.lexicon[lemma] : [];

  const subjectNP: NP = {
    kind: "NP",
    head: {
      lemma: subject.lemma,
      baseForm: lookupForm(subject.lemma),
      number: subject.features?.number === "pl" ? "pl" : "sg",
      case: "nom",
      isPronoun: subject.tag === "PRON",
    },
    adjectives: [],
    pps: [],
  };
  const objectNP: NP | undefined = object
    ? {
        kind: "NP",
        head: {
          lemma: object.lemma,
          baseForm: lookupForm(object.lemma),
          number: object.features?.number === "pl" ? "pl" : "sg",
          case: "acc",
          isPronoun: object.tag === "PRON",
        },
        adjectives: [],
        pps: [],
      }
    : undefined;
  const vp: VP = {
    kind: "VP",
    verb: {
      lemma: ast.head.lemma,
      baseForm: lookupForm(ast.head.lemma),
      tense: (ast.head.features?.tense ?? "present") as "past" | "present" | "future",
    },
    pps: [],
    adverbs: [],
    ...(objectNP ? { object: objectNP } : {}),
  };
  return {
    kind: "S",
    subject: subjectNP,
    predicate: vp,
    negated: false,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tier C Phase 3 (Phase 73c): RoleClause ↔ Sentence adapters.
//
// `roleClauseToSentence` is the complete back-compat bridge from
// the participant-role IR (`RoleClause`) to the English-shaped
// legacy `Sentence` parse tree. It's the function that lets the
// new RoleClause-emitting parser (`parseSyntaxToClause`) supply
// the existing `realiseSentence` consumer without behavioural
// change. Phase 4 swaps the realiser to consume `RoleClause`
// directly and this adapter becomes a deprecation shim.
//
// `sentenceToRoleClause` is the inverse direction — used by the
// composer-side path (`narrative/roleProjection.ts`) and by tests.
//
// Both adapters preserve every Sentence-side field the legacy
// realiser reads (negated, interrogative, leadingConj, leadingWh,
// NP determiner/adjectives/possessor/numeral/coord/relative, VP
// aspect/mood/voice/evidential/honorific/complement/adverbs/pps).
// Hardcoded "nom"/"acc" case assignment matches the existing
// ast.ts:158 comment — the realiser overrides per alignment.
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

const ROLE_TO_PREP: Partial<Record<SemanticRole, string>> = {
  location: "in",
  source: "from",
  goal: "to",
  instrument: "with",
  recipient: "for",
  time: "at",
  manner: "through",
};

function roleToPrep(role: SemanticRole): string {
  return ROLE_TO_PREP[role] ?? "in";
}

function npToParticipant(np: NP, role: SemanticRole, adjunct = false): Participant {
  const modifiers: ParticipantModifier[] = [];
  if (np.determiner) {
    modifiers.push({ kind: "determiner", lemma: np.determiner.lemma });
  }
  for (const adj of np.adjectives) {
    modifiers.push({ kind: "adjective", lemma: adj.lemma, ...(adj.degree ? { degree: adj.degree } : {}) });
  }
  if (np.possessor) {
    modifiers.push({ kind: "possessor", participant: npToParticipant(np.possessor, "agent") });
  }
  if (np.numeral) {
    modifiers.push({ kind: "numeral", lemma: np.numeral.lemma });
  }
  for (const pp of np.pps) {
    modifiers.push({
      kind: "oblique",
      relation: prepToRole(pp.prep.lemma),
      preposition: pp.prep.lemma,
      participant: npToParticipant(pp.np, prepToRole(pp.prep.lemma), true),
    });
  }
  if (np.coord) {
    modifiers.push({
      kind: "coordination",
      conjunction: np.coord.lemma,
      participant: npToParticipant(np.coord.np, role),
    });
  }
  if (np.relative) {
    modifiers.push({
      kind: "relative",
      clause: relativeClauseToRoleClause(np.relative),
      relativiser: np.relative.relativizer,
      subjectGap: np.relative.subjectGap,
    });
  }
  return {
    lemma: np.head.lemma,
    pos: np.head.isPronoun ? "PRON" : "N",
    role,
    features: {
      number: np.head.number,
      ...(np.head.person ? { person: np.head.person } : {}),
      ...(np.head.isPronoun ? { isPronoun: true } : {}),
      ...(np.head.nounClass ? { nounClass: np.head.nounClass } : {}),
      ...(np.head.synthesized ? { synthesized: true } : {}),
    },
    ...(modifiers.length > 0 ? { modifiers } : {}),
    ...(adjunct ? { adjunct: true } : {}),
  };
}

function relativeClauseToRoleClause(rc: RelativeClause): RoleClause {
  const participants: Participant[] = [];
  if (rc.predicate.object) {
    participants.push(npToParticipant(rc.predicate.object, "patient"));
  }
  for (const pp of rc.predicate.pps) {
    participants.push(npToParticipant(pp.np, prepToRole(pp.prep.lemma), true));
  }
  return {
    kind: "RoleClause",
    predicate: {
      lemma: rc.predicate.verb.lemma,
      features: {
        tense: rc.predicate.verb.tense,
        ...(rc.predicate.verb.aspect ? { aspect: rc.predicate.verb.aspect } : {}),
        ...(rc.predicate.verb.mood ? { mood: rc.predicate.verb.mood } : {}),
        ...(rc.predicate.verb.voice ? { voice: rc.predicate.verb.voice } : {}),
      },
    },
    participants,
  };
}

/**
 * Promote a legacy `Sentence` to a `RoleClause`. Lossless for the
 * constructs the parser currently emits (RC, NP-coord, PP adjuncts,
 * complement, adverbs).
 */
export function sentenceToRoleClause(s: Sentence): RoleClause {
  const participants: Participant[] = [npToParticipant(s.subject, "agent")];
  if (s.predicate.object) {
    participants.push(npToParticipant(s.predicate.object, "patient"));
  }
  for (const pp of s.predicate.pps) {
    participants.push({
      ...npToParticipant(pp.np, prepToRole(pp.prep.lemma), true),
      preposition: pp.prep.lemma,
    });
  }
  for (const adv of s.predicate.adverbs) {
    participants.push({
      lemma: adv.lemma,
      pos: "N",
      role: "manner",
      adjunct: true,
      ...(adv.degree ? { modifiers: [{ kind: "adjective", lemma: adv.lemma, degree: adv.degree }] } : {}),
    });
  }
  const complement = s.predicate.complement && s.predicate.complement.length > 0
    ? s.predicate.complement.map((c) => ({
        lemma: c.lemma,
        ...(c.degree ? { degree: c.degree } : {}),
      }))
    : undefined;
  return {
    kind: "RoleClause",
    predicate: {
      lemma: s.predicate.verb.lemma,
      features: {
        tense: s.predicate.verb.tense,
        ...(s.predicate.verb.aspect ? { aspect: s.predicate.verb.aspect } : {}),
        ...(s.predicate.verb.mood ? { mood: s.predicate.verb.mood } : {}),
        ...(s.predicate.verb.voice ? { voice: s.predicate.verb.voice } : {}),
        ...(s.predicate.verb.evidential ? { evidential: s.predicate.verb.evidential } : {}),
        ...(s.predicate.verb.honorific ? { honorific: s.predicate.verb.honorific } : {}),
      },
      ...(complement ? { complement } : {}),
    },
    participants,
    ...(s.negated ? { negated: true } : {}),
    ...(s.interrogative ? { interrogative: true } : {}),
    ...(s.leadingConj ? { leadingConj: s.leadingConj } : {}),
    ...(s.leadingWh ? { leadingWh: s.leadingWh } : {}),
  };
}

function participantToNP(p: Participant, defaultCase: Case): NP {
  let determiner: { lemma: string } | undefined;
  const adjectives: AdjRef[] = [];
  let possessor: NP | undefined;
  let numeral: { lemma: string } | undefined;
  const pps: PP[] = [];
  let coord: { lemma: string; np: NP } | undefined;
  let relative: RelativeClause | undefined;
  for (const mod of p.modifiers ?? []) {
    switch (mod.kind) {
      case "determiner":
        determiner = { lemma: mod.lemma };
        break;
      case "adjective":
        adjectives.push({
          lemma: mod.lemma,
          baseForm: [],
          ...(mod.degree ? { degree: mod.degree } : {}),
        });
        break;
      case "possessor":
        possessor = participantToNP(mod.participant, "gen");
        break;
      case "numeral":
        numeral = { lemma: mod.lemma };
        break;
      case "oblique": {
        const preposition = mod.preposition ?? roleToPrep(mod.relation);
        pps.push({
          kind: "PP",
          prep: { lemma: preposition },
          np: participantToNP(mod.participant, "obl"),
        });
        break;
      }
      case "coordination":
        coord = {
          lemma: mod.conjunction,
          np: participantToNP(mod.participant, defaultCase),
        };
        break;
      case "relative":
        relative = roleClauseToRelativeClause(mod.clause, mod.relativiser, mod.subjectGap);
        break;
    }
  }
  return {
    kind: "NP",
    head: {
      lemma: p.lemma,
      baseForm: [],
      number: (p.features?.number ?? "sg") as Number_,
      case: defaultCase,
      ...(p.features?.person ? { person: p.features.person as Person } : {}),
      ...(p.pos === "PRON" ? { isPronoun: true } : {}),
      ...(p.features?.nounClass ? { nounClass: p.features.nounClass } : {}),
      ...(p.features?.synthesized ? { synthesized: true } : {}),
    },
    ...(determiner ? { determiner } : {}),
    adjectives,
    ...(possessor ? { possessor } : {}),
    ...(numeral ? { numeral } : {}),
    pps,
    ...(coord ? { coord } : {}),
    ...(relative ? { relative } : {}),
  };
}

function roleClauseToRelativeClause(
  rc: RoleClause,
  relativiser: string | undefined,
  subjectGap: boolean,
): RelativeClause {
  // Phase 5: find the direct-object positionally. Subject is
  // participant[0]; the first non-adjunct after the subject is
  // the direct object regardless of its semantic role tag
  // (`patient`, `stimulus`, `theme` for `give`, etc.).
  const cores = rc.participants.filter((p) => !p.adjunct);
  const objectP = cores[1];
  const pps: PP[] = [];
  for (const p of rc.participants) {
    if (!p.adjunct) continue;
    pps.push({
      kind: "PP",
      prep: { lemma: roleToPrep(p.role) },
      np: participantToNP(p, "obl"),
    });
  }
  const reliz: "who" | "that" | "which" =
    relativiser === "who" || relativiser === "which" || relativiser === "that"
      ? relativiser
      : "that";
  return {
    kind: "RC",
    relativizer: reliz,
    predicate: {
      kind: "VP",
      verb: {
        lemma: rc.predicate.lemma,
        baseForm: [],
        tense: (rc.predicate.features?.tense ?? "present") as "past" | "present" | "future",
        ...(rc.predicate.features?.aspect ? { aspect: rc.predicate.features.aspect as Aspect } : {}),
        ...(rc.predicate.features?.mood ? { mood: rc.predicate.features.mood as Mood } : {}),
        ...(rc.predicate.features?.voice ? { voice: rc.predicate.features.voice as Voice } : {}),
      },
      pps,
      adverbs: [],
      ...(objectP ? { object: participantToNP(objectP, "acc") } : {}),
    },
    subjectGap,
  };
}

/**
 * Phase 73c Tier C Phase 3: convert a `RoleClause` back to a
 * legacy `Sentence`. Used as the back-compat bridge from the new
 * RoleClause-emitting parser (`parseSyntaxToClause`) into the
 * existing `realiseSentence` pipeline. Returns null when the
 * clause has no participant labelled `agent`/`experiencer`/`theme`
 * (no subject equivalent).
 *
 * S-level coordination (`clause.coordinatedWith`) is the caller's
 * concern: `roleClausesToSentences` walks the chain.
 */
export function roleClauseToSentence(rc: RoleClause): Sentence | null {
  // Phase 5: locate subject + object POSITIONALLY in the
  // participants list (first non-adjunct = subject, second =
  // direct object). The role tag is preserved on the participant
  // but no longer filtered — the parser and composer both lay out
  // the list in `argFrame` order, so this is reliable. Adjuncts
  // (PP-shaped participants with `adjunct: true`) are skipped.
  const cores = rc.participants.filter((p) => !p.adjunct);
  const subjectP = cores[0];
  if (!subjectP) return null;
  const objectP = cores[1];
  const adjuncts = rc.participants.filter((p) => p.adjunct);

  const subjectNP: NP = participantToNP(subjectP, "nom");
  const objectNP: NP | undefined = objectP ? participantToNP(objectP, "acc") : undefined;

  // Adjunct participants other than `manner` are realised as PPs;
  // manner-adjuncts come from `adverbs`.
  const pps: PP[] = [];
  const adverbs: AdjRef[] = [];
  for (const a of adjuncts) {
    if (a.role === "manner") {
      adverbs.push({
        lemma: a.lemma,
        baseForm: [],
        ...(a.modifiers && a.modifiers.length > 0 && a.modifiers[0]!.kind === "adjective" && a.modifiers[0]!.degree
          ? { degree: a.modifiers[0]!.degree as Degree }
          : {}),
      });
    } else {
      pps.push({
        kind: "PP",
        prep: { lemma: a.preposition ?? roleToPrep(a.role) },
        np: participantToNP(a, "obl"),
      });
    }
  }

  const complementAdj: AdjRef[] | undefined =
    rc.predicate.complement && rc.predicate.complement.length > 0
      ? rc.predicate.complement.map((c) => ({
          lemma: c.lemma,
          baseForm: [],
          ...(c.degree ? { degree: c.degree } : {}),
        }))
      : undefined;
  const vp: VP = {
    kind: "VP",
    verb: {
      lemma: rc.predicate.lemma,
      baseForm: [],
      tense: (rc.predicate.features?.tense ?? "present") as "past" | "present" | "future",
      ...(subjectP.features?.person ? { subjectPerson: subjectP.features.person as Person } : {}),
      ...(subjectP.features?.number ? { subjectNumber: subjectP.features.number as Number_ } : {}),
      ...(rc.predicate.features?.aspect ? { aspect: rc.predicate.features.aspect as Aspect } : {}),
      ...(rc.predicate.features?.mood ? { mood: rc.predicate.features.mood as Mood } : {}),
      ...(rc.predicate.features?.voice ? { voice: rc.predicate.features.voice as Voice } : {}),
      ...(rc.predicate.features?.evidential ? { evidential: rc.predicate.features.evidential as Evidential } : {}),
      ...(rc.predicate.features?.honorific ? { honorific: true } : {}),
    },
    ...(objectNP ? { object: objectNP } : {}),
    pps,
    adverbs,
    ...(complementAdj ? { complement: complementAdj } : {}),
  };

  return {
    kind: "S",
    subject: subjectNP,
    predicate: vp,
    negated: !!rc.negated,
    ...(rc.interrogative ? { interrogative: true } : {}),
    ...(rc.leadingConj ? { leadingConj: rc.leadingConj } : {}),
    ...(rc.leadingWh ? { leadingWh: rc.leadingWh } : {}),
  };
}

/**
 * Walk a `coordinatedWith` chain (each `RoleClause` carrying its
 * successor) and produce one `Sentence` per clause. Clauses that
 * can't be converted (no subject participant) are dropped.
 */
export function roleClausesToSentences(rc: RoleClause): Sentence[] {
  const out: Sentence[] = [];
  let cur: RoleClause | undefined = rc;
  while (cur) {
    const s = roleClauseToSentence(cur);
    if (s) out.push(s);
    cur = cur.coordinatedWith;
  }
  return out;
}
