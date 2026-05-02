import type { Language, Meaning } from "../types";
import { posOf } from "../lexicon/pos";
import type { Rng } from "../rng";

/**
 * POS-filtered, frequency-weighted pools drawn from `lang.lexicon`.
 *
 * The narrative composer used to draw from 6 small hand-curated pools
 * (~50 lemmas total) regardless of the language's actual vocabulary,
 * so a language with 600 entries saw <10% of them in narratives.
 *
 * These helpers walk `lang.lexicon`, filter by POS, and bias picks by
 * `wordFrequencyHints` so frequent words appear more often without
 * making rare ones impossible. Returns the full filtered list per call;
 * the caller uses pickWeighted() to select.
 */

const ANIMATE_HINTS = new Set([
  // Kinship
  "mother", "father", "child", "son", "daughter", "brother", "sister",
  "uncle", "aunt", "parent", "husband", "wife", "friend",
  "stranger", "warrior", "king", "queen", "doctor", "teacher", "student",
  "neighbor", "guest", "enemy", "hero", "lord", "servant",
  // Common animate animals
  "dog", "wolf", "horse", "cow", "bull", "sheep", "goat", "pig",
  "bear", "deer", "fox", "rabbit", "cat", "mouse",
  "bird", "eagle", "hawk", "fish", "snake",
  // Person words
  "man", "woman", "person", "people", "boy", "girl", "baby",
]);

export function isAnimate(meaning: Meaning): boolean {
  return ANIMATE_HINTS.has(meaning);
}

/**
 * Return all meanings in lang.lexicon with the given POS, ordered by
 * descending frequency so the caller can take the head if they want
 * deterministic top-N or sample weighted.
 */
export function poolByPOS(lang: Language, pos: ReturnType<typeof posOf>): Meaning[] {
  const out: Meaning[] = [];
  for (const m of Object.keys(lang.lexicon)) {
    if (posOf(m) === pos) out.push(m);
  }
  out.sort((a, b) => {
    const fa = lang.wordFrequencyHints[a] ?? 0.4;
    const fb = lang.wordFrequencyHints[b] ?? 0.4;
    return fb - fa;
  });
  return out;
}

/**
 * Whether `posOf(m)` excludes the meaning from being a noun-like content
 * word (so it can't be a subject or object). The simulator's POS table is
 * sparse — many concrete nouns return "other" — so we use this exclusion
 * filter rather than strict `posOf === "noun"` matching.
 */
const NON_NOUN_POS = new Set([
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "determiner",
  "article",
  "preposition",
  "coord_conj",
  "subord_conj",
  "auxiliary",
  "particle",
  "complementiser",
  "negator",
  "interjection",
  "numeral",
]);

export function nounLikePool(lang: Language): Meaning[] {
  const out: Meaning[] = [];
  for (const m of Object.keys(lang.lexicon)) {
    const pos = posOf(m);
    if (pos === "noun") {
      out.push(m);
      continue;
    }
    if (pos === "other" && !NON_NOUN_POS.has(pos)) {
      out.push(m);
    }
  }
  return out.sort((a, b) => {
    const fa = lang.wordFrequencyHints[a] ?? 0.4;
    const fb = lang.wordFrequencyHints[b] ?? 0.4;
    return fb - fa;
  });
}

export function subjectPool(lang: Language): Meaning[] {
  const all = nounLikePool(lang);
  const animate = all.filter(isAnimate);
  // Prefer animate subjects, but fall back to all nouns if too few exist.
  if (animate.length >= 6) return animate;
  return all;
}

export function objectPool(lang: Language): Meaning[] {
  return nounLikePool(lang);
}

export function adjectivePool(lang: Language): Meaning[] {
  return poolByPOS(lang, "adjective");
}

export function verbPool(lang: Language): Meaning[] {
  return poolByPOS(lang, "verb");
}

const TIME_HINTS = new Set([
  "morning", "evening", "night", "winter", "summer", "spring", "autumn",
  "fall", "day", "year", "month", "week", "hour", "today", "yesterday",
  "tomorrow",
]);

const PLACE_HINTS = new Set([
  "river", "forest", "mountain", "valley", "village", "town", "city",
  "house", "home", "field", "lake", "sea", "ocean", "garden", "yard",
  "street", "road", "path", "bridge", "park", "beach", "cave", "harbor",
]);

/**
 * Time and place pools intentionally don't gate on `posOf === "noun"`:
 * the simulator's POS table is sparse (village, river etc. aren't all
 * registered), so we filter directly from `lang.lexicon` against the
 * hint sets. Frequency-sorted for caller convenience.
 */
function sortByFrequencyDesc(lang: Language, list: Meaning[]): Meaning[] {
  return list.slice().sort((a, b) => {
    const fa = lang.wordFrequencyHints[a] ?? 0.4;
    const fb = lang.wordFrequencyHints[b] ?? 0.4;
    return fb - fa;
  });
}

export function timePool(lang: Language): Meaning[] {
  return sortByFrequencyDesc(
    lang,
    Object.keys(lang.lexicon).filter((m) => TIME_HINTS.has(m)),
  );
}

export function placePool(lang: Language): Meaning[] {
  return sortByFrequencyDesc(
    lang,
    Object.keys(lang.lexicon).filter((m) => PLACE_HINTS.has(m)),
  );
}

/**
 * Frequency-weighted random pick. Returns the meaning whose
 * wordFrequencyHints[m] (defaulting to 0.4) determines its slice of
 * a virtual roulette wheel.
 */
export function pickWeighted(lang: Language, pool: Meaning[], rng: Rng): Meaning | null {
  if (pool.length === 0) return null;
  let total = 0;
  for (const m of pool) {
    total += lang.wordFrequencyHints[m] ?? 0.4;
  }
  if (total <= 0) return pool[rng.int(pool.length)] ?? null;
  let r = rng.next() * total;
  for (const m of pool) {
    r -= lang.wordFrequencyHints[m] ?? 0.4;
    if (r <= 0) return m;
  }
  return pool[pool.length - 1] ?? null;
}
