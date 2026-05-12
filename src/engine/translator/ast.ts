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

import type { Sentence, NP, VP } from "./syntax";
import type { LexiconState } from "../domains";

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
