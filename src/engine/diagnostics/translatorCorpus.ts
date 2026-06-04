import type { Language } from "../types";
import { translateSentence, type SentenceTranslation } from "../translator/sentence";
import type { DiagnosticRow } from "./scorecard";
import { scalarRow } from "./scorecard";

/**
 * translatorCorpus.ts — the user-supplied TRANSLATOR TEST CORPUS folded into
 * the Simulation Scorecard (Lane 0 / Lane F).
 *
 * The 5 phrases (docs/planning/ROADMAP.md backlog "TRANSLATOR TEST CORPUS",
 * 2026-06-03) plus the legacy placeholder example. Each phrase is a
 * DIAGNOSTIC, not a hard lock: the legacy English-IR realiser still drops
 * objects / mis-orders control verbs (the Lane F rewrite targets exactly
 * these), so today's actual values are recorded as the WARN/INFO baseline and
 * the preferred values describe the post-Lane-F target.
 *
 * Per phrase we measure two robust, realiser-agnostic signals:
 *   - content retention : share of the phrase's CONTENT words that surface in
 *     the output (objects/subjects not silently dropped — the "I want to buy
 *     the egg" → drops "egg" bug).
 *   - closed-class no-coin : the translator must NOT fabricate a fresh form
 *     for a closed-class item it has no lexeme for (the `no`→`ngich` bug). We
 *     count `synth-fallback` resolutions landing on a closed-class lemma.
 */

export interface CorpusPhrase {
  id: string;
  english: string;
  /** Content lemmas that MUST survive translation (objects/subjects/verbs). */
  content: string[];
  /** Closed-class lemmas present that must never be coined from scratch. */
  closedClass: string[];
  note: string;
}

// The 5 user phrases + the placeholder. Content/closed-class lists are the
// lemmas as the English tokenizer canonicalises them (lower-case, base form).
export const TRANSLATOR_CORPUS: readonly CorpusPhrase[] = [
  {
    id: "where-is-king",
    english: "Where is your king?",
    content: ["king"],
    closedClass: ["where", "is", "your"],
    note: "interrogative + 2nd-person possessive + locative",
  },
  {
    id: "this-land",
    english: "This land is my land, this land is your land.",
    content: ["land"],
    closedClass: ["this", "is", "my", "your"],
    note: "demonstrative, copula, possessive, clause coordination/repetition",
  },
  {
    id: "want-to-buy-egg",
    english: "I want to buy the egg",
    content: ["want", "buy", "egg"],
    closedClass: ["i", "to", "the"],
    note: "control verb 'want' + infinitival 'to buy' + definite object",
  },
  {
    id: "if-i-dont-see-you",
    english: "and if I don't see you again",
    content: ["see"],
    closedClass: ["and", "if", "i", "not", "you", "again"],
    note: "leading coord, conditional, negation, adverb",
  },
  {
    id: "american-ears",
    english: "American, do your ears work?",
    content: ["ear", "work"],
    closedClass: ["do", "your"],
    note: "demonym proper noun, vocative, do-support question, plural subject",
  },
  // Legacy placeholder example (kept so the corpus row count is stable).
  {
    id: "placeholder-egg",
    english: "the king sees the egg",
    content: ["king", "see", "egg"],
    closedClass: ["the"],
    note: "placeholder: simple SVO, definite object retention",
  },
];

const CLOSED_CLASS_RESOLUTIONS = new Set(["synth-fallback"]);

/**
 * Measure one phrase against one evolved language. Returns the raw signals;
 * `toRows` turns them into diagnostic rows.
 */
export interface PhraseResult {
  id: string;
  english: string;
  surface: string;
  contentRetained: number;
  contentTotal: number;
  contentRate: number;
  spuriousCoinages: number;
  note: string;
}

function lemmaSurfaced(out: SentenceTranslation, lemma: string): boolean {
  return out.targetTokens.some((t) => t.englishLemma === lemma);
}

export function runPhrase(lang: Language, phrase: CorpusPhrase): PhraseResult {
  const out = translateSentence(lang, phrase.english);
  let retained = 0;
  for (const c of phrase.content) {
    if (lemmaSurfaced(out, c)) retained++;
  }
  // Spurious coinage: a closed-class lemma that surfaced via the
  // coin-on-miss fallback rung instead of an existing lexeme / clean marker.
  let spurious = 0;
  const closed = new Set(phrase.closedClass);
  for (const t of out.targetTokens) {
    if (closed.has(t.englishLemma) && CLOSED_CLASS_RESOLUTIONS.has(t.resolution)) spurious++;
  }
  return {
    id: phrase.id,
    english: phrase.english,
    surface: out.targetTokens.map((t) => t.englishLemma).join(" "),
    contentRetained: retained,
    contentTotal: phrase.content.length,
    contentRate: phrase.content.length === 0 ? NaN : retained / phrase.content.length,
    spuriousCoinages: spurious,
    note: phrase.note,
  };
}

/** Convert per-phrase results into scorecard rows. */
export function phraseRows(results: readonly PhraseResult[]): DiagnosticRow[] {
  const rows: DiagnosticRow[] = [];
  for (const r of results) {
    rows.push(
      scalarRow(
        "translator",
        `corpus:${r.id} content-retained`,
        r.contentRate,
        "100%",
        { pass: [1, 1], warn: [0.66, 1] },
        (n) => `${(n * 100).toFixed(0)}%`,
      ),
    );
    rows.push(
      scalarRow(
        "translator",
        `corpus:${r.id} closed-class no-coin`,
        r.spuriousCoinages,
        "0",
        { pass: [0, 0], warn: [0, 1] },
        (n) => `${n}`,
      ),
    );
  }
  return rows;
}

/** Run the full corpus against a language. */
export function runCorpus(lang: Language): PhraseResult[] {
  return TRANSLATOR_CORPUS.map((p) => runPhrase(lang, p));
}
