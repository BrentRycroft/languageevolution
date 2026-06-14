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
 *   1. CONCEPTS dictionary (the geometry-derived meaning registry).
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

/**
 * Phase 53.5: try to split `lemma` into two consecutive
 * CONCEPTS-or-closed-class stems with no separator. Catches real
 * English compounds like `firewood` (fire+wood), `houseboat`,
 * `keyboard` while rejecting random alphabetic strings (`engin`
 * has no clean fire+anything decomposition). Greedy left-to-right;
 * splits on stems with length ≥ 3 to avoid spurious matches.
 */
function isCompoundOfStems(lemma: string): boolean {
  if (lemma.length < 6) return false;
  for (let cut = 3; cut <= lemma.length - 3; cut++) {
    const left = lemma.slice(0, cut);
    const right = lemma.slice(cut);
    if (isAcceptedStem(left) && isAcceptedStem(right)) return true;
  }
  return false;
}

/**
 * Phase 53.5 (replaces Phase 51 T1's permissive heuristic): returns
 * true when `lemma` is recognisable as English the translator should
 * attempt to render. The pre-Phase-53.5 fallback ("looks alphabetic,
 * has a vowel, no 4-consec consonants") was too permissive — it
 * accepted typos and partial words like `engin`, polluting the
 * lexicon when the user typed a misspelling.
 *
 * Acceptance is now strictly compositional, no "looks-like-English"
 * heuristic:
 *   1. CONCEPTS hit.
 *   2. Closed-class function word.
 *   3. Recognised affix decomposition (Phase 49) into a CONCEPTS or
 *      closed-class stem.
 *   4. Heuristic inflection (-s, -es, -ed, -ing, doubled-consonant)
 *      onto a CONCEPTS or closed-class stem.
 *   5. Compound: two consecutive CONCEPTS/closed-class stems with no
 *      separator (`firewood` = `fire` + `wood`).
 *   6. Otherwise REJECT.
 *
 * Result: `engin`, `asdf`, `qwerty`, `xyzzy`, `wibblefex` all reject
 * and route to the literal-quote fallback. The lexicon stops growing
 * non-words from typos.
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
  if (isCompoundOfStems(lower)) return true;
  return false;
}
