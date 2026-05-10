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
