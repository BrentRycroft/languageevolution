import type { Language, Meaning } from "../types";
import type { MorphCategory } from "../morphology/types";
import { closedClassTable } from "./closedClass";

/**
 * Best-effort reverse translation: target-language surface → English.
 *
 * Used as a sanity check / round-trip diagnostic. Given a string of
 * target-language tokens (separated by whitespace), look each up
 * against:
 *   1. The language's open-class lexicon (direct surface match).
 *   2. Inflected stems — strip a known paradigm affix then re-test.
 *   3. The language's closed-class table (articles, prepositions,
 *      negators, wh-words, demonstratives, …).
 *
 * Surface order is preserved — no syntactic re-parse, so an SOV
 * target reverses to "subject object verb" English (not "subject
 * verb object"). Callers needing canonical English order should
 * either supply the parsed Sentence (forward path) or post-process.
 *
 * Lossy by design — collisions are common in evolved lexicons (two
 * meanings → same form via colex / sound change). When a target
 * token resolves to multiple meanings, the alphabetically-earliest
 * meaning wins to keep round-tripping deterministic.
 */

export interface ReverseToken {
  /** Target-language surface form (input slice). */
  target: string;
  /** Recovered English lemma; null when no match. */
  lemma: string | null;
  /** When set, the paradigm whose affix was stripped to recover the
   *  stem. Lets the caller surface tense / number / case info. */
  paradigm?: MorphCategory;
  /** "open" = lexicon hit; "closed" = closed-class table hit;
   *  "missing" = no match. */
  kind: "open" | "closed" | "missing";
}

export interface ReverseTranslation {
  target: string;
  tokens: ReverseToken[];
  /** Joined English lemmas in surface order, "?" for unresolved. */
  english: string;
  /** Target tokens that didn't resolve. */
  missing: string[];
}

interface ReverseLexEntry {
  lemma: Meaning;
  source: "open" | "closed";
}

/**
 * Build inverse lexicon: target surface → English lemma. Memoised
 * via WeakMap keyed by Language so round-tripping a sentence many
 * times across the same language doesn't rebuild the table.
 */
const cache = new WeakMap<Language, Map<string, ReverseLexEntry>>();

function buildReverseLex(lang: Language): Map<string, ReverseLexEntry> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const map = new Map<string, ReverseLexEntry>();
  // Open-class first; alphabetical lemma order so collisions resolve
  // deterministically (the earliest meaning wins).
  const openLemmas = Object.keys(lang.lexicon).sort();
  for (const lemma of openLemmas) {
    const surface = lang.lexicon[lemma]!.join("");
    if (!surface) continue;
    if (!map.has(surface)) {
      map.set(surface, { lemma, source: "open" });
    }
  }
  // Closed class registers under separate lemma keys but never
  // overwrites an open-class hit. The open-class lexicon's `it` /
  // `he` / `she` etc. take precedence — they're the user-facing
  // gloss.
  const cct = closedClassTable(lang);
  const closedLemmas = Object.keys(cct).sort();
  for (const lemma of closedLemmas) {
    const surface = cct[lemma]!.join("");
    if (!surface) continue;
    if (!map.has(surface)) {
      map.set(surface, { lemma, source: "closed" });
    }
  }
  cache.set(lang, map);
  return map;
}

/**
 * Try to recover a single target-language form. Falls back to
 * stripping prefix / suffix paradigm affixes and re-querying the
 * lexicon for the bare stem.
 */
export function reverseLookupForm(
  lang: Language,
  surface: string,
): ReverseToken {
  if (!surface) return { target: surface, lemma: null, kind: "missing" };
  // Quoted fallback markers — the forward translator wraps unresolved
  // English lemmas in typographic quotation marks (`"wise"`) so the
  // reader knows it's a passthrough. Recover the bare lemma directly.
  const quoted = surface.match(/^[“"]([^"”]+)[”"]$/u);
  if (quoted) {
    return { target: surface, lemma: quoted[1]!, kind: "open" };
  }
  const lex = buildReverseLex(lang);
  const direct = lex.get(surface);
  if (direct) {
    return { target: surface, lemma: direct.lemma, kind: direct.source };
  }
  // Strip known affixes and try again. We try suffixes first
  // (more common across the simulator's typology), longest first
  // so a 3-phoneme suffix wins over a 1-phoneme suffix when both
  // would yield a valid stem.
  const paradigms = Object.entries(lang.morphology.paradigms).filter(
    ([, p]) => !!p,
  ) as [MorphCategory, NonNullable<typeof lang.morphology.paradigms[MorphCategory]>][];
  paradigms.sort((a, b) => (b[1].affix.length - a[1].affix.length));
  for (const [cat, p] of paradigms) {
    const affix = p.affix.join("");
    if (!affix) continue;
    if (p.position === "suffix" && surface.endsWith(affix) && surface.length > affix.length) {
      const stem = surface.slice(0, surface.length - affix.length);
      const hit = lex.get(stem);
      if (hit) return { target: surface, lemma: hit.lemma, paradigm: cat, kind: hit.source };
    }
    if (p.position === "prefix" && surface.startsWith(affix) && surface.length > affix.length) {
      const stem = surface.slice(affix.length);
      const hit = lex.get(stem);
      if (hit) return { target: surface, lemma: hit.lemma, paradigm: cat, kind: hit.source };
    }
  }
  // Try stripping two stacked suffixes (case + number, tense + person, …).
  for (const [cat1, p1] of paradigms) {
    if (p1.position !== "suffix") continue;
    const a1 = p1.affix.join("");
    if (!a1 || !surface.endsWith(a1) || surface.length <= a1.length) continue;
    const inner = surface.slice(0, surface.length - a1.length);
    for (const [, p2] of paradigms) {
      if (p2.position !== "suffix") continue;
      const a2 = p2.affix.join("");
      if (!a2 || !inner.endsWith(a2) || inner.length <= a2.length) continue;
      const stem = inner.slice(0, inner.length - a2.length);
      const hit = lex.get(stem);
      if (hit) return { target: surface, lemma: hit.lemma, paradigm: cat1, kind: hit.source };
    }
  }
  // Try prefix + suffix combos (PIE-style augment + person ending:
  // `e-` prefix + verb stem + `-ti` 3sg suffix). Covers `edʰeh₁ti`
  // → stem `dʰeh₁` → lemma `do`.
  for (const [, pPre] of paradigms) {
    if (pPre.position !== "prefix") continue;
    const aPre = pPre.affix.join("");
    if (!aPre || !surface.startsWith(aPre)) continue;
    const afterPre = surface.slice(aPre.length);
    if (!afterPre) continue;
    for (const [catSuf, pSuf] of paradigms) {
      if (pSuf.position !== "suffix") continue;
      const aSuf = pSuf.affix.join("");
      if (!aSuf || !afterPre.endsWith(aSuf) || afterPre.length <= aSuf.length) continue;
      const stem = afterPre.slice(0, afterPre.length - aSuf.length);
      const hit = lex.get(stem);
      if (hit) return { target: surface, lemma: hit.lemma, paradigm: catSuf, kind: hit.source };
    }
  }
  return { target: surface, lemma: null, kind: "missing" };
}

export function reverseTranslate(
  lang: Language,
  target: string,
): ReverseTranslation {
  const targetTokens = target.split(/\s+/).filter((t) => t.length > 0);
  const tokens: ReverseToken[] = targetTokens.map((t) => reverseLookupForm(lang, t));
  const english = tokens
    .map((t) => t.lemma ?? `?${t.target}`)
    .join(" ");
  const missing = tokens.filter((t) => t.kind === "missing").map((t) => t.target);
  return { target, tokens, english, missing };
}
