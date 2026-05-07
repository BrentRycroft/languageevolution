import type { DerivationCategory } from "../lexicon/derivation";

/**
 * Phase 49: language-agnostic affix selection sits behind a small
 * input-side parser that maps English-orthographic affixes onto the
 * abstract `DerivationCategory` enum.
 *
 * The parser is hardcoded English because the translator UI only
 * accepts English input — it's the keyboard, not the simulated
 * language. Switching the input language to (say) German would mean
 * swapping this table; the downstream selector
 * (`selectAffixForCategory`) is fully language-agnostic.
 *
 * Greedy longest-match: the parser sorts entries by surface length
 * descending so e.g. "-ness" wins over "-s" and "over-" wins over
 * "or-". Stems shorter than 2 chars are rejected — "ed" → e + -d is
 * never useful.
 *
 * Doubled-consonant heuristic: for "-ed" / "-er" / "-est" / "-ing" /
 * "-y", the parser tries the simple stem AND the doubled-consonant
 * variant ("runner" → both "runn-" and "run-"); the first variant
 * with a lexicon hit wins. Avoids the user immediately bumping into
 * "runner doesn't resolve" once they look past the canonical examples.
 */

export interface EnglishAffixEntry {
  /** Surface form of the affix as the user would type it ("dom", "ness", "un"). */
  surface: string;
  /** Tag preserved on the parsed result for UI display + glossNote. */
  tag: string;
  /** Abstract semantic category — the dispatch key for output-side selection. */
  category: DerivationCategory;
  position: "prefix" | "suffix";
}

/**
 * Master English affix table. Order within the array doesn't matter —
 * the parser sorts by surface length to enforce longest-match. Where
 * the same surface string is plausibly two different categories
 * (English `-er` is BOTH agentive AND comparative), we list ONE entry
 * and pick the more productive interpretation.
 *
 * Trade-off documented at the entry: agentive `-er` wins because the
 * comparative path is handled upstream by the tokenizer's
 * COMPARATIVE_BASES detection.
 */
export const ENGLISH_AFFIX_TABLE: readonly EnglishAffixEntry[] = [
  // Suffixes — abstract noun
  { surface: "ness", tag: "-ness", category: "abstractNoun", position: "suffix" },
  { surface: "ity", tag: "-ity", category: "abstractNoun", position: "suffix" },
  { surface: "hood", tag: "-hood", category: "abstractNoun", position: "suffix" },
  { surface: "ship", tag: "-ship", category: "abstractNoun", position: "suffix" },
  // Suffixes — dominion / abstract realm
  { surface: "dom", tag: "-dom", category: "dominionAbstract", position: "suffix" },
  { surface: "ric", tag: "-ric", category: "dominionAbstract", position: "suffix" },
  // Suffixes — agentive
  { surface: "er", tag: "-er.agt", category: "agentive", position: "suffix" },
  { surface: "or", tag: "-or", category: "agentive", position: "suffix" },
  { surface: "ist", tag: "-ist", category: "agentive", position: "suffix" },
  // Suffixes — nominalisation
  { surface: "tion", tag: "-tion", category: "nominalisation", position: "suffix" },
  { surface: "ment", tag: "-ment", category: "nominalisation", position: "suffix" },
  { surface: "age", tag: "-age", category: "nominalisation", position: "suffix" },
  // Suffixes — diminutive
  { surface: "let", tag: "-let", category: "diminutive", position: "suffix" },
  { surface: "kin", tag: "-kin", category: "diminutive", position: "suffix" },
  // Suffixes — adjectival
  { surface: "ish", tag: "-ish", category: "adjectival", position: "suffix" },
  { surface: "ous", tag: "-ous", category: "adjectival", position: "suffix" },
  { surface: "ic", tag: "-ic", category: "adjectival", position: "suffix" },
  { surface: "al", tag: "-al", category: "adjectival", position: "suffix" },
  // Suffixes — denominal
  { surface: "ify", tag: "-ify", category: "denominal", position: "suffix" },
  { surface: "ise", tag: "-ise", category: "denominal", position: "suffix" },
  { surface: "ize", tag: "-ize", category: "denominal", position: "suffix" },
  // Suffixes — adverbial / privative
  { surface: "ly", tag: "-ly", category: "adverbial", position: "suffix" },
  { surface: "less", tag: "-less", category: "privative", position: "suffix" },
  { surface: "ful", tag: "-ful", category: "adjectival", position: "suffix" },
  // Prefixes — negative
  { surface: "un", tag: "un-", category: "negative", position: "prefix" },
  { surface: "dis", tag: "dis-", category: "negative", position: "prefix" },
  { surface: "non", tag: "non-", category: "negative", position: "prefix" },
  { surface: "anti", tag: "anti-", category: "negative", position: "prefix" },
  { surface: "in", tag: "in-", category: "negative", position: "prefix" },
  // Prefixes — repetitive / temporal
  { surface: "re", tag: "re-", category: "repetitive", position: "prefix" },
  { surface: "pre", tag: "pre-", category: "temporalBefore", position: "prefix" },
  { surface: "post", tag: "post-", category: "temporalAfter", position: "prefix" },
  { surface: "fore", tag: "fore-", category: "temporalBefore", position: "prefix" },
  // Prefixes — intensifier / mistaken
  { surface: "over", tag: "over-", category: "intensifierExcess", position: "prefix" },
  { surface: "under", tag: "under-", category: "intensifierInsufficient", position: "prefix" },
  { surface: "mis", tag: "mis-", category: "mistaken", position: "prefix" },
];

const SUFFIX_TABLE = ENGLISH_AFFIX_TABLE
  .filter((e) => e.position === "suffix")
  .slice()
  .sort((a, b) => b.surface.length - a.surface.length);

const PREFIX_TABLE = ENGLISH_AFFIX_TABLE
  .filter((e) => e.position === "prefix")
  .slice()
  .sort((a, b) => b.surface.length - a.surface.length);

export interface ParsedEnglishAffix {
  stem: string;
  /** Alternate stems to try (e.g. "runn" before "run" for "runner"). */
  candidateStems: string[];
  category: DerivationCategory;
  position: "prefix" | "suffix";
  affixTag: string;
  surface: string;
}

const DOUBLED_CONSONANT_TRIGGERS: ReadonlySet<string> = new Set([
  "er", "ed", "est", "ing", "y",
]);

/**
 * Walk the suffix table greedy-longest-first; for each match where the
 * leftover stem is at least 2 chars, return immediately. The caller
 * tries each candidate stem in order against its lexicon — so we don't
 * commit to a specific spelling here, only to a category + position.
 *
 * For doubled-consonant suffixes (-er, -ed, -est, -ing, -y) we also
 * emit the un-doubled stem candidate (`runner` → `runn`, `run`). The
 * caller resolves whichever candidate hits the lexicon.
 */
export function parseEnglishAffix(lemma: string): ParsedEnglishAffix | null {
  const lower = lemma.toLowerCase();
  for (const entry of SUFFIX_TABLE) {
    if (!lower.endsWith(entry.surface)) continue;
    const stem = lower.slice(0, lower.length - entry.surface.length);
    if (stem.length < 2) continue;
    const candidateStems = [stem];
    if (
      DOUBLED_CONSONANT_TRIGGERS.has(entry.surface) &&
      stem.length >= 2 &&
      stem[stem.length - 1] === stem[stem.length - 2]
    ) {
      candidateStems.push(stem.slice(0, -1));
    }
    return {
      stem,
      candidateStems,
      category: entry.category,
      position: entry.position,
      affixTag: entry.tag,
      surface: entry.surface,
    };
  }
  for (const entry of PREFIX_TABLE) {
    if (!lower.startsWith(entry.surface)) continue;
    const stem = lower.slice(entry.surface.length);
    if (stem.length < 2) continue;
    return {
      stem,
      candidateStems: [stem],
      category: entry.category,
      position: entry.position,
      affixTag: entry.tag,
      surface: entry.surface,
    };
  }
  return null;
}

/**
 * Reverse lookup: given a tag (as stored on a `DerivationalSuffix`),
 * recover its `{ category, position }` so init-time seeding can label
 * the entry. Returns null when the tag is not in our English table —
 * e.g. genesis-coined tags or non-English presets.
 */
export function lookupAffixMetaByTag(
  tag: string,
): { category: DerivationCategory; position: "prefix" | "suffix" } | null {
  for (const entry of ENGLISH_AFFIX_TABLE) {
    if (entry.tag === tag) {
      return { category: entry.category, position: entry.position };
    }
  }
  return null;
}
