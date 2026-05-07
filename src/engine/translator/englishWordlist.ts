import { isRegisteredConcept } from "../lexicon/concepts";
import { parseEnglishAffix } from "./englishAffixes";

/**
 * Phase 51 T1: English-input validation gate.
 *
 * Phase 50's graceful-fallback rung treated any unresolvable lemma as
 * worthy of coinage — including single letters (`w`), keyboard mash
 * (`asdfgh`), and English typos. Result: garbage forms got phonemes,
 * coinage events, and lexicon entries. The fallback was meant for
 * *legitimate* English words the simulator hadn't seen, not a
 * universal "anything goes" rung.
 *
 * `isValidEnglishLemma` is the gate. Returns true when the lemma is
 * recognisable as English by composing the data we already have:
 *
 *   1. CONCEPTS dictionary (~1000 entries from BASIC_240 +
 *      EXPANDED_CONCEPTS).
 *   2. Closed-class function words (articles, copulas, auxiliaries,
 *      prepositions, conjunctions, pronouns) — same sets used by
 *      `tokeniseEnglish`.
 *   3. Recognised affix decomposition via Phase 49's `parseEnglishAffix`
 *      (so `kindness`, `unhappy`, `lighter` pass without explicit
 *      registration).
 *   4. Heuristic inflection (`-s`, `-es`, `-ed`, `-ing` plus doubled-
 *      consonant) on a CONCEPTS stem.
 *
 * Length floor: 2 chars. `a` and `i` get through because they're in
 * the closed-class set.
 */

const VALIDATION_CLOSED_CLASS = new Set<string>([
  // Pronouns
  "i", "me", "my", "mine", "myself",
  "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself",
  "she", "her", "hers", "herself",
  "it", "its", "itself",
  "we", "us", "our", "ours", "ourselves",
  "they", "them", "their", "theirs", "themselves",
  // Determiners
  "the", "a", "an",
  "this", "that", "these", "those",
  "some", "any", "all", "no", "every", "each", "both", "many", "few",
  // Prepositions
  "in", "on", "at", "to", "from", "by", "with", "for", "of",
  "under", "over", "through", "near", "after", "before", "across",
  "into", "onto", "beside", "between", "without", "within",
  "above", "below", "during", "since", "until", "about",
  // Conjunctions
  "and", "or", "but", "nor", "yet",
  "because", "so", "if", "when", "while", "though", "although",
  "than", "as", "unless", "lest",
  // Auxiliaries / copulas
  "am", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "doing", "done",
  "have", "has", "had", "having",
  "will", "would", "shall", "should",
  "can", "could", "may", "might", "must",
  // Negation + question words
  "not", "no",
  "what", "who", "whom", "whose", "where", "when", "why", "how", "which",
  // Discourse / interjections
  "yes", "okay", "ok", "well", "oh", "ah",
]);

const PLURAL_SUFFIXES: ReadonlyArray<string> = ["s", "es", "ies"];
const PAST_SUFFIXES: ReadonlyArray<string> = ["ed", "d"];
const ING_SUFFIX = "ing";

function stripInflection(lemma: string): string[] {
  const candidates: string[] = [];
  for (const suf of PLURAL_SUFFIXES) {
    if (lemma.endsWith(suf) && lemma.length > suf.length + 1) {
      let stem = lemma.slice(0, -suf.length);
      if (suf === "ies") stem = stem + "y";
      candidates.push(stem);
    }
  }
  for (const suf of PAST_SUFFIXES) {
    if (lemma.endsWith(suf) && lemma.length > suf.length + 1) {
      const stem = lemma.slice(0, -suf.length);
      candidates.push(stem);
      // Doubled-consonant: stop+ed → stop (drop one trailing consonant)
      if (
        stem.length >= 3 &&
        stem[stem.length - 1] === stem[stem.length - 2]
      ) {
        candidates.push(stem.slice(0, -1));
      }
    }
  }
  if (lemma.endsWith(ING_SUFFIX) && lemma.length > ING_SUFFIX.length + 1) {
    const stem = lemma.slice(0, -ING_SUFFIX.length);
    candidates.push(stem);
    if (
      stem.length >= 3 &&
      stem[stem.length - 1] === stem[stem.length - 2]
    ) {
      candidates.push(stem.slice(0, -1));
    }
    candidates.push(stem + "e");
  }
  return candidates;
}

function isAcceptedStem(stem: string): boolean {
  return isRegisteredConcept(stem) || VALIDATION_CLOSED_CLASS.has(stem);
}

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

/**
 * Phase 51 T1 heuristic: a word "looks like English" when it has at
 * least one vowel, no run of 4+ consecutive non-vowels, and is purely
 * alphabetic. Lets common English words that aren't in CONCEPTS
 * (dragon, house, wise, etc.) through; rejects obvious keyboard mash
 * (`asdfgh` has the 5-consonant run `sdfgh`, `qrtxz` has no vowel).
 */
function looksLikeEnglish(lemma: string): boolean {
  if (!/^[a-z]+$/.test(lemma)) return false;
  let hasVowel = false;
  let consonantRun = 0;
  for (const ch of lemma) {
    if (VOWELS.has(ch)) {
      hasVowel = true;
      consonantRun = 0;
    } else {
      consonantRun++;
      if (consonantRun >= 4) return false;
    }
  }
  return hasVowel;
}

/**
 * Phase 51 T1: returns true when `lemma` is recognisable as English
 * the translator should attempt to render. Returns false for keyboard
 * mash, single letters, and non-alphabetic input — those go straight
 * to the literal-quote fallback instead of coining a fresh form.
 *
 * Two layers:
 *   1. Definitive: CONCEPTS hit, closed-class hit, or affix /
 *      inflection decomposition reaches a CONCEPTS stem.
 *   2. Heuristic: at least one vowel, all-alphabetic, length ≥ 2, and
 *      no 4+ consecutive consonants. Lets dragon/house/wise/angry
 *      through (they're real English even though CONCEPTS lacks them)
 *      while rejecting asdfgh.
 */
export function isValidEnglishLemma(lemma: string): boolean {
  if (!lemma) return false;
  const lower = lemma.toLowerCase();
  if (lower.length < 2) {
    return VALIDATION_CLOSED_CLASS.has(lower);
  }
  if (isAcceptedStem(lower)) return true;
  const affix = parseEnglishAffix(lower);
  if (affix) {
    if (isAcceptedStem(affix.stem)) return true;
    for (const cand of affix.candidateStems) {
      if (isAcceptedStem(cand)) return true;
    }
  }
  for (const stem of stripInflection(lower)) {
    if (isAcceptedStem(stem)) return true;
  }
  return looksLikeEnglish(lower);
}
