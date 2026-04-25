import type { Language, Meaning, WordForm } from "../types";
import { isRegisteredConcept, CONCEPTS, colexWith } from "../lexicon/concepts";
import { posOf } from "../lexicon/pos";
import { inflect } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";
import { closedClassForm } from "./closedClass";
import { parseSyntax } from "./parse";
import { realiseSentence } from "./realise";
import { sliceOrder } from "./wordOrder";

/**
 * Rule-based English-to-target-language sentence translator.
 *
 * Pipeline:
 *   1. Tokenise + POS-tag the English input via a small rule-based
 *      tagger.
 *   2. Resolve each tag-bearing token to a target-language form via
 *      a 5-step lookup chain (direct → stem → colex → reverse-colex →
 *      [no equivalent]).
 *   3. Inflect verbs / nouns based on the inferred features (tense,
 *      plurality, accusative case).
 *   4. Reorder by `lang.grammar.wordOrder` — at the granularity of
 *      one S-V-O cluster per clause.
 *
 * Designed to be deterministic (no RNG) and cheap (~tens of µs per
 * sentence). Replaces the deleted WebLLM-driven translator.
 */

export type { EnglishTag, EnglishToken } from "./tokens";
import type { EnglishTag, EnglishToken } from "./tokens";

export interface TranslatedToken {
  englishLemma: string;
  englishTag: EnglishTag;
  targetForm: WordForm;
  targetSurface: string; // joined string of phonemes
  glossNote: string;     // "concept", "*compound", "?missing", "↔ colex"
  resolution:
    | "direct"
    | "concept"
    | "colex"
    | "reverse-colex"
    | "fallback";
  /** Stays null for closed-class tokens that don't belong in target output. */
  inflectedAs?: MorphCategory;
}

export interface SentenceTranslation {
  english: string;
  englishTokens: EnglishToken[];
  targetTokens: TranslatedToken[];
  /** The reordered surface-form sequence for display. */
  arranged: string[];
  /** English lemmas the dictionary couldn't resolve at all. */
  missing: string[];
  notes: string;
}

// ---------------------------------------------------------------------------
// 1. Tokenise + tag
// ---------------------------------------------------------------------------

const PUNCT = /^[.,!?;:'"()]+$/;

const PRONOUNS_OBJ = new Set(["me", "him", "her", "us", "them"]);
const PRONOUNS_SUBJ = new Set(["i", "he", "she", "we", "they"]);
const PRONOUNS_BOTH = new Set(["you", "it"]);
const DETERMINERS = new Set([
  "the", "a", "an",
  "this", "that", "these", "those",
  "some", "any", "all", "no", "every", "each",
  // Possessive determiners — close to articles in distribution.
  "my", "your", "his", "her", "its", "our", "their",
]);
const PREPOSITIONS = new Set([
  "in", "on", "at", "to", "from", "by", "with", "for", "of",
  "under", "over", "through", "near", "after", "before", "across",
  "into", "onto", "beside", "between", "without",
]);
const CONJUNCTIONS = new Set([
  "and", "or", "but",
  "because", "so", "if", "when", "while", "though", "although",
  // Comparative + similative connectives — without these, "than" /
  // "as" fall through to the noun fallback and get sucked into the
  // wrong NP slot ("the king is bigger than the wolf" puts "than"
  // in as a noun).
  "than", "as",
]);
// Wh-words. Tagged DET when in determiner position (which-X, what-X),
// and as discourse particles otherwise. Without these, the noun
// fallback claims them and they steal subject / object slots in
// relative clauses + wh-questions.
const WH_WORDS = new Set([
  "who", "whom", "whose",
  "what", "which",
  "where", "when", "why", "how",
]);
const AUX_VERBS = new Set([
  "am", "is", "are", "was", "were", "be", "been",
  "do", "does", "did",
  "will", "would", "shall", "should",
  "can", "could", "may", "might", "must",
  "have", "has", "had",
]);
const COPULAS = new Set(["am", "is", "are", "was", "were", "be"]);
const NEGATORS = new Set(["not", "n't", "never"]);
// Bare cardinal numerals.
const BARE_NUMERALS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
  "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "million",
]);
// Bare nouns whose surface form would otherwise trigger the -ing /
// -ed verb heuristic (king, morning, evening, …) or the noun-fallback
// stripping logic (loss → "los"). Checked BEFORE the verb heuristics
// so the parser sees them as N.
const BARE_NOUNS = new Set([
  "king", "ring", "string", "wing", "thing", "spring",
  "morning", "evening", "ceiling", "ending", "beginning",
  "meaning", "feeling", "building", "warning", "writing",
  "mountain", "fountain", "bread", "head", "stone",
  "child", "wolf", "horse", "river", "mother", "father",
  "brother", "sister", "warrior", "stranger", "friend",
  "house", "village", "forest", "winter", "summer",
  "water", "fire", "moon", "sun", "tree",
]);
// Bare verbs the tokeniser can recognise without -ed / -ing / `to` cue.
const BARE_VERBS = new Set([
  // motion / state
  "go", "come", "walk", "run", "stand", "sit", "lie", "fall", "fly", "swim",
  // perception / cognition
  "see", "hear", "know", "think", "speak", "say", "call", "ask",
  // action
  "do", "make", "take", "give", "hold", "carry", "throw", "pull",
  "push", "cut", "break", "bend", "build", "burn", "wash", "weave",
  "plant", "sow", "freeze", "melt", "hunt", "fight", "scratch",
  "dig", "split", "sew", "rub", "wipe", "pour", "flow", "suck",
  "blow", "spit", "bite", "kill", "breathe",
  // life
  "eat", "drink", "sleep", "live", "die", "grow",
  "love", "fear", "laugh", "cry", "play",
  // common short
  "want", "need", "like", "find", "lose", "win", "open", "close",
  "start", "stop", "wait", "help",
]);
// Bare adjectives the tokeniser can recognise without -er/-est suffix.
const BARE_ADJECTIVES = new Set([
  "big", "small", "tall", "short", "fast", "slow", "new", "old",
  "good", "bad", "long", "wide", "narrow", "deep", "shallow",
  "hot", "cold", "high", "low", "near", "far", "young", "rich",
  "poor", "strong", "weak", "happy", "sad", "easy", "hard",
  "red", "blue", "green", "yellow", "black", "white",
  "wet", "dry", "full", "empty", "round", "straight", "sharp",
  "wise", "foolish", "brave", "kind", "cruel", "true", "false",
]);

const PRONOUN_FEATURES: Record<string, EnglishToken["features"]> = {
  i:    { person: "1", number: "sg" },
  me:   { person: "1", number: "sg", role: "object" },
  you:  { person: "2" },
  he:   { person: "3", number: "sg" },
  him:  { person: "3", number: "sg", role: "object" },
  she:  { person: "3", number: "sg" },
  her:  { person: "3", number: "sg", role: "object" },
  it:   { person: "3", number: "sg" },
  we:   { person: "1", number: "pl" },
  us:   { person: "1", number: "pl", role: "object" },
  they: { person: "3", number: "pl" },
  them: { person: "3", number: "pl", role: "object" },
};

/** A handful of irregular English verbs whose -ed-stripping wouldn't recover the lemma. */
const IRREGULAR_VERBS: Record<string, string> = {
  went: "go", goes: "go", gone: "go", going: "go",
  came: "come", comes: "come", coming: "come",
  saw: "see", seen: "see", seeing: "see", sees: "see",
  said: "say", says: "say", saying: "say",
  knew: "know", known: "know", knowing: "know", knows: "know",
  ate: "eat", eaten: "eat", eating: "eat", eats: "eat",
  drank: "drink", drunk: "drink", drinks: "drink", drinking: "drink",
  slept: "sleep", sleeping: "sleep", sleeps: "sleep",
  died: "die", dying: "die", dies: "die",
  had: "have", has: "have", having: "have",
  took: "take", taken: "take", taking: "take", takes: "take",
  gave: "give", given: "give", giving: "give", gives: "give",
  made: "make", makes: "make", making: "make",
  fell: "fall", fallen: "fall", falls: "fall", falling: "fall",
  ran: "run", running: "run", runs: "run",
  flew: "fly", flown: "fly", flying: "fly", flies: "fly",
  swam: "swim", swum: "swim", swimming: "swim", swims: "swim",
  fought: "fight", fights: "fight", fighting: "fight",
  brought: "bring", bring: "bring", brings: "bring", bringing: "bring",
  bought: "buy", buys: "buy", buying: "buy",
  sold: "sell", sells: "sell", selling: "sell",
  thought: "think", thinks: "think", thinking: "think",
  built: "build", builds: "build", building: "build",
  broke: "break", broken: "break", breaks: "break", breaking: "break",
  wrote: "write", written: "write", writes: "write", writing: "write",
  read: "read", reads: "read", reading: "read",
  spoke: "speak", spoken: "speak", speaks: "speak", speaking: "speak",
  heard: "hear", hears: "hear", hearing: "hear",
  felt: "feel", feels: "feel", feeling: "feel",
};

/** Irregular plural nouns whose -s isn't a real plural marker. */
const IRREGULAR_PLURALS: Record<string, string> = {
  men: "man", women: "woman", children: "child",
  feet: "foot", teeth: "tooth", mice: "mouse",
  geese: "goose", oxen: "ox", people: "person",
};

function stripVerbSuffix(s: string): string {
  if (IRREGULAR_VERBS[s]) return IRREGULAR_VERBS[s]!;
  // -ies → -y
  if (s.length >= 4 && s.endsWith("ies")) return s.slice(0, -3) + "y";
  // -ied → -y
  if (s.length >= 4 && s.endsWith("ied")) return s.slice(0, -3) + "y";
  // -ing → bare (drop the 'e'-plus-ing case lazily)
  if (s.length >= 5 && s.endsWith("ing")) {
    const stem = s.slice(0, -3);
    return stem;
  }
  // -ed
  if (s.length >= 3 && s.endsWith("ed")) {
    const stem = s.slice(0, -2);
    return stem;
  }
  // -es → drop
  if (s.length >= 4 && s.endsWith("es")) {
    return s.slice(0, -2);
  }
  // -s
  if (s.length >= 2 && s.endsWith("s") && !s.endsWith("ss")) {
    return s.slice(0, -1);
  }
  return s;
}

function stripNounSuffix(s: string): string {
  if (IRREGULAR_PLURALS[s]) return IRREGULAR_PLURALS[s]!;
  if (s.length >= 4 && s.endsWith("ies")) return s.slice(0, -3) + "y";
  if (s.length >= 4 && s.endsWith("ses")) return s.slice(0, -2);
  // -ves → -f / -fe (wolves → wolf, knives → knife). Pure heuristic;
  // words like "saves" (verb) shouldn't reach here because the verb
  // detector fires first on -es endings via IRREGULAR_VERBS.
  if (s.length >= 5 && s.endsWith("ves")) {
    const stem = s.slice(0, -3);
    return stem + "f";
  }
  if (s.length >= 3 && s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
  return s;
}

/**
 * Tokenise + POS-tag an English sentence. Rule-based, ~80 % accuracy
 * — good enough for the simulator's purposes.
 */
export function tokeniseEnglish(text: string): EnglishToken[] {
  const tokens: EnglishToken[] = [];
  // Split on whitespace + punctuation, keeping punctuation as separate tokens.
  const rawSplit = text
    .toLowerCase()
    .split(/(\s+|[.,!?;:()'"])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Map common contraction hosts to their full auxiliary form so
  // "doesn't" round-trips through the tokeniser as `does` + NEG and
  // gets the right tense / mood signal.
  const CONTRACTION_HOST: Record<string, string> = {
    doesn: "does", don: "do", didn: "did",
    won: "will", wouldn: "would",
    isn: "is", aren: "are", wasn: "was", weren: "were",
    hasn: "has", haven: "have", hadn: "had",
    couldn: "could", shouldn: "should", mustn: "must",
    shan: "shall", mightn: "might",
    "can": "can", // bare "can't" leaves the host as "can"
  };

  // Re-glue possessive `'s` ("king's wolf") and contractions `n't`
  // ("doesn't"). Without this the apostrophe split scatters them
  // into 3 tokens — the parser then sees a phantom "s" or "t" noun.
  const raw: string[] = [];
  const possessorIndices = new Set<number>();
  const negatorIndices = new Set<number>();
  for (let i = 0; i < rawSplit.length; i++) {
    const w = rawSplit[i]!;
    const next = rawSplit[i + 1];
    const after = rawSplit[i + 2];
    if (next === "'" && after === "s") {
      raw.push(w);
      possessorIndices.add(raw.length - 1);
      i += 2;
      continue;
    }
    if (next === "'" && after === "t") {
      // contractions like don't / doesn't / won't / can't / isn't
      raw.push(CONTRACTION_HOST[w] ?? w);
      negatorIndices.add(raw.length - 1);
      i += 2;
      continue;
    }
    raw.push(w);
  }

  let pendingTense: "past" | "present" | "future" | undefined;
  let lastWasVerb = false;

  for (let i = 0; i < raw.length; i++) {
    const w = raw[i]!;
    if (PUNCT.test(w)) {
      tokens.push({ surface: w, lemma: w, tag: "PUNCT", features: {} });
      continue;
    }
    // Closed-class checks (most specific first).
    if (PRONOUNS_OBJ.has(w) || PRONOUNS_SUBJ.has(w) || PRONOUNS_BOTH.has(w)) {
      // Object-form pronouns alias to the subject lemma so the
      // dictionary resolution chain finds them under "i" / "he" /
      // "she" / "we" / "they". The role/case from PRONOUN_FEATURES
      // still carries through so case-marking morphology still
      // fires on the right form.
      const PRONOUN_LEMMA: Record<string, string> = {
        me: "i", him: "he", her: "she", us: "we", them: "they",
      };
      tokens.push({
        surface: w,
        lemma: PRONOUN_LEMMA[w] ?? w,
        tag: "PRON",
        features: { ...(PRONOUN_FEATURES[w] ?? {}) },
      });
      continue;
    }
    if (DETERMINERS.has(w)) {
      tokens.push({ surface: w, lemma: w, tag: "DET", features: {} });
      continue;
    }
    if (PREPOSITIONS.has(w)) {
      tokens.push({ surface: w, lemma: w, tag: "PREP", features: {} });
      continue;
    }
    if (CONJUNCTIONS.has(w)) {
      tokens.push({ surface: w, lemma: w, tag: "CONJ", features: {} });
      continue;
    }
    if (WH_WORDS.has(w)) {
      // Tag as PUNCT so the parser doesn't pull these into NP slots.
      // The lemma stays so realisation can surface a closed-class
      // form via closedClassForm if the language has one. Without
      // this guard "the king who sees the wolf" turns "who" into
      // the subject head and silently drops "king".
      tokens.push({ surface: w, lemma: w, tag: "PUNCT", features: {} });
      continue;
    }
    if (NEGATORS.has(w)) {
      // Tag negators as PUNCT-like — they don't carry inflection but
      // we want a stable lemma for the parser's negation detection.
      // The realiser handles them via the sentence-level `negated`
      // flag; this token is dropped during reordering.
      tokens.push({ surface: w, lemma: w, tag: "PUNCT", features: {} });
      continue;
    }
    if (BARE_NOUNS.has(w)) {
      tokens.push({
        surface: w,
        lemma: w,
        tag: "N",
        features: { number: "sg" },
      });
      lastWasVerb = false;
      continue;
    }
    if (BARE_ADJECTIVES.has(w)) {
      tokens.push({ surface: w, lemma: w, tag: "ADJ", features: {} });
      continue;
    }
    if (BARE_VERBS.has(w)) {
      const tense: "past" | "present" | "future" | undefined =
        pendingTense ?? "present";
      tokens.push({ surface: w, lemma: w, tag: "V", features: { tense } });
      pendingTense = undefined;
      lastWasVerb = true;
      continue;
    }
    if (AUX_VERBS.has(w)) {
      // Auxiliaries carry tense info that the next verb inherits.
      const past = ["was", "were", "did", "had"].includes(w);
      const future = w === "will" || w === "would";
      pendingTense = past ? "past" : future ? "future" : "present";
      tokens.push({
        surface: w,
        lemma: COPULAS.has(w) ? "be" : w,
        tag: "AUX",
        features: { tense: pendingTense },
      });
      lastWasVerb = false;
      continue;
    }
    if (/^[0-9]+$/.test(w)) {
      tokens.push({ surface: w, lemma: w, tag: "NUM", features: {} });
      continue;
    }
    // Bare cardinal numerals — needed so the tokenizer doesn't misread
    // "three dogs" as N + N.
    if (BARE_NUMERALS.has(w)) {
      tokens.push({ surface: w, lemma: w, tag: "NUM", features: {} });
      continue;
    }
    // Suffix-based heuristics.
    if (w.length >= 3 && w.endsWith("ly")) {
      tokens.push({
        surface: w,
        lemma: w.slice(0, -2),
        tag: "ADV",
        features: {},
      });
      continue;
    }
    // Comparative / superlative adjective detection. Only fires for
    // a small allowlist of confident comparatives — "mother" /
    // "teacher" / "father" / "writer" are all -er but they're agent
    // nouns, not adjectives. Mis-tagging them ADJ here breaks the
    // subject/object detection downstream.
    const COMPARATIVE_BASES = new Set([
      "big", "small", "tall", "short", "fast", "slow", "new", "old",
      "good", "bad", "long", "wide", "narrow", "deep", "shallow",
      "hot", "cold", "high", "low", "near", "far", "young", "rich",
      "poor", "strong", "weak", "happy", "sad", "easy", "hard",
    ]);
    if (w.length >= 5 && (w.endsWith("er") || w.endsWith("est"))) {
      const stem = w.endsWith("est") ? w.slice(0, -3) : w.slice(0, -2);
      const stemY = stem.endsWith("i") ? stem.slice(0, -1) + "y" : stem;
      // Doubled-final-consonant variant (`bigg(er)` → `big`,
      // `runn(er)` → `run`). When the last two chars match, drop one.
      const stemD =
        stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2]
          ? stem.slice(0, -1)
          : stem;
      const candidates = [stem, stemY, stemD];
      const found = candidates.find((c) => COMPARATIVE_BASES.has(c));
      if (found) {
        tokens.push({
          surface: w,
          lemma: found,
          tag: "ADJ",
          features: { degree: w.endsWith("est") ? "superlative" : "comparative" },
        });
        continue;
      }
      // Otherwise fall through to noun/verb detection below.
    }
    // Verb detection: ends in -ed, -ing, or matches an irregular form.
    const looksVerb =
      IRREGULAR_VERBS[w] !== undefined ||
      (w.length >= 4 && (w.endsWith("ed") || w.endsWith("ing"))) ||
      (lastWasVerb === false && i > 0 && raw[i - 1] === "to");
    if (looksVerb) {
      const lemma = stripVerbSuffix(w);
      const tense: "past" | "present" | "future" | undefined =
        pendingTense ??
        (w.endsWith("ed") || (IRREGULAR_VERBS[w] && /^(went|came|saw|said|knew|ate|drank|slept|died|had|took|gave|made|fell|ran|flew|swam|fought|brought|bought|sold|thought|built|broke|wrote|read|spoke|heard|felt)$/.test(w))
          ? "past"
          : w.endsWith("ing")
            ? "present"
            : "present");
      tokens.push({
        surface: w,
        lemma,
        tag: "V",
        features: { tense },
      });
      pendingTense = undefined;
      lastWasVerb = true;
      continue;
    }
    // Noun fallback: -s might mark plural.
    const isPlural = w.length >= 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us");
    const lemma = isPlural ? stripNounSuffix(w) : (IRREGULAR_PLURALS[w] ?? w);
    tokens.push({
      surface: w,
      lemma,
      tag: "N",
      features: { number: isPlural || IRREGULAR_PLURALS[w] !== undefined ? "pl" : "sg" },
    });
    lastWasVerb = false;
  }

  // Mark possessor nouns ("king's wolf" → king is possessor) and
  // contracted negators ("can't" → can is negator).
  for (const idx of possessorIndices) {
    const t = tokens[idx];
    if (t) t.features.possessor = true;
  }
  for (const idx of negatorIndices) {
    // Inject a synthetic NEG token after the contraction host so the
    // parser's negation detector (which scans by lemma) picks it up.
    tokens.splice(idx + 1, 0, {
      surface: "n't",
      lemma: "not",
      tag: "PUNCT",
      features: {},
    });
  }

  // Second pass: tag the first noun as subject and the second noun as
  // object (very crude; works for simple SVO English).
  let nounsSeen = 0;
  for (const t of tokens) {
    if (t.tag !== "N" && t.tag !== "PRON") continue;
    if (t.features.possessor) continue; // possessor never plays subj/obj role
    if (t.features.role) continue; // pronoun already marked
    if (nounsSeen === 0) t.features.role = "subject";
    else if (nounsSeen === 1) t.features.role = "object";
    nounsSeen++;
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// 2. Resolver chain
// ---------------------------------------------------------------------------

/**
 * Resolve a single English lemma to a target-language form via the
 * 5-step chain. Returns the form + glossNote + resolution kind.
 */
function resolveLemma(
  lang: Language,
  lemma: string,
): {
  form: WordForm | null;
  resolution: TranslatedToken["resolution"];
  glossNote: string;
} {
  // 1. Direct hit.
  if (lang.lexicon[lemma]) {
    return {
      form: lang.lexicon[lemma]!.slice(),
      resolution: "direct",
      glossNote: "",
    };
  }
  // (Stem→direct hit was step 1 — `lemma` is the stripped form.)
  // 2. Colex resolution: walk colexification synonyms. arm → look up
  //    "hand" (and vice versa) when the language merged the two.
  if (isRegisteredConcept(lemma)) {
    for (const partner of colexWith(lemma)) {
      if (lang.lexicon[partner]) {
        return {
          form: lang.lexicon[partner]!.slice(),
          resolution: "colex",
          glossNote: `↔ ${partner}`,
        };
      }
    }
  }
  // 4. Reverse colex: maybe this language merged `lemma`'s sister
  //    INTO `lemma`. Walk the language's colexifiedAs map.
  if (lang.colexifiedAs) {
    for (const [winner, losers] of Object.entries(lang.colexifiedAs)) {
      if (losers.includes(lemma) && lang.lexicon[winner]) {
        return {
          form: lang.lexicon[winner]!.slice(),
          resolution: "reverse-colex",
          glossNote: `↔ ${winner}`,
        };
      }
    }
  }
  // 5. POS-aware nearest-neighbor in the same cluster. If the lemma
  //    is a registered concept, find a same-cluster + same-POS
  //    concept the language does have.
  const concept = CONCEPTS[lemma];
  if (concept) {
    let bestMatch: Meaning | null = null;
    for (const otherId of Object.keys(lang.lexicon)) {
      const otherConcept = CONCEPTS[otherId];
      if (!otherConcept) continue;
      if (otherConcept.cluster !== concept.cluster) continue;
      if (otherConcept.pos !== concept.pos) continue;
      bestMatch = otherId;
      break;
    }
    if (bestMatch) {
      return {
        form: lang.lexicon[bestMatch]!.slice(),
        resolution: "fallback",
        glossNote: `* ${bestMatch}`,
      };
    }
  }
  // 6. Total miss.
  void posOf;
  return { form: null, resolution: "fallback", glossNote: "?" };
}

// ---------------------------------------------------------------------------
// 3. Inflection
// ---------------------------------------------------------------------------

function inflectForToken(
  baseForm: WordForm,
  token: EnglishToken,
  lang: Language,
  meaning: string,
): { form: WordForm; cat?: MorphCategory } {
  const paradigms = lang.morphology.paradigms;
  // Verbs: tense.
  if (token.tag === "V") {
    if (token.features.tense === "past" && paradigms["verb.tense.past"]) {
      return { form: inflect(baseForm, paradigms["verb.tense.past"], lang, meaning), cat: "verb.tense.past" };
    }
    if (token.features.tense === "future" && paradigms["verb.tense.fut"]) {
      return { form: inflect(baseForm, paradigms["verb.tense.fut"], lang, meaning), cat: "verb.tense.fut" };
    }
    // Person / 3sg present.
    if (token.features.person === "3" && token.features.number === "sg" && paradigms["verb.person.3sg"]) {
      return { form: inflect(baseForm, paradigms["verb.person.3sg"], lang, meaning), cat: "verb.person.3sg" };
    }
  }
  // Nouns: plural + accusative case.
  if (token.tag === "N" || token.tag === "PRON") {
    if (token.features.role === "object" && lang.grammar.hasCase && paradigms["noun.case.acc"]) {
      const inflected = inflect(baseForm, paradigms["noun.case.acc"], lang, meaning);
      if (token.features.number === "pl" && paradigms["noun.num.pl"]) {
        // Stack plural on top of accusative.
        return {
          form: inflect(inflected, paradigms["noun.num.pl"], lang, meaning),
          cat: "noun.case.acc",
        };
      }
      return { form: inflected, cat: "noun.case.acc" };
    }
    if (token.features.number === "pl" && lang.grammar.pluralMarking === "affix" && paradigms["noun.num.pl"]) {
      return { form: inflect(baseForm, paradigms["noun.num.pl"], lang, meaning), cat: "noun.num.pl" };
    }
  }
  return { form: baseForm };
}

// ---------------------------------------------------------------------------
// 4. Reorder
// ---------------------------------------------------------------------------

function rearrangeClause(
  tokens: TranslatedToken[],
  englishTokens: EnglishToken[],
  wordOrder: Language["grammar"]["wordOrder"],
): TranslatedToken[] {
  // Find S, V, O indices by feature.
  let sIdx = -1, vIdx = -1, oIdx = -1;
  for (let i = 0; i < englishTokens.length; i++) {
    const t = englishTokens[i]!;
    if (t.tag === "V" && vIdx === -1) vIdx = i;
    else if ((t.tag === "N" || t.tag === "PRON") && t.features.role === "subject" && sIdx === -1) sIdx = i;
    else if ((t.tag === "N" || t.tag === "PRON") && t.features.role === "object" && oIdx === -1) oIdx = i;
  }
  if (sIdx < 0 || vIdx < 0) return tokens; // no clear clause structure
  const order = sliceOrder(wordOrder);
  const sToken = tokens[sIdx]!;
  const vToken = tokens[vIdx]!;
  const oToken = oIdx >= 0 ? tokens[oIdx]! : null;
  const reordered: TranslatedToken[] = [];
  // Keep punctuation, conjunctions, prepositions, determiners in
  // original order (for now); only pivot the S/V/O.
  const used = new Set([sIdx, vIdx]);
  if (oIdx >= 0) used.add(oIdx);
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    reordered.push(tokens[i]!);
  }
  for (const slot of order) {
    if (slot === "S") reordered.push(sToken);
    else if (slot === "V") reordered.push(vToken);
    else if (slot === "O" && oToken) reordered.push(oToken);
  }
  return reordered;
}


// ---------------------------------------------------------------------------
// Top-level translate
// ---------------------------------------------------------------------------

export function translateSentence(lang: Language, english: string): SentenceTranslation {
  const englishTokens = tokeniseEnglish(english);

  // §2.1 path: try to parse a single clause into a syntax tree and run
  // the tree-driven realiser. Handles agreement, adjective placement,
  // possessor placement, negation, prodrop, and PP order. Falls
  // through to the legacy linear path when parsing fails (no verb
  // found, multi-clause input, etc.).
  const parsed = parseSyntax(englishTokens);
  if (parsed) {
    return translateViaTree(lang, english, englishTokens, parsed);
  }

  const targetTokens: TranslatedToken[] = [];
  const missing: string[] = [];

  // Typology decisions resolved once per call.
  const articlePresence = lang.grammar.articlePresence ?? "none";
  const caseStrategy = lang.grammar.caseStrategy ?? (lang.grammar.hasCase ? "case" : "preposition");

  // Negation surfaces in the legacy fallback even when no clause
  // structure was recoverable. Without this, "the man not" → just
  // "wihro" — silently dropping the user's intended negation.

  for (let i = 0; i < englishTokens.length; i++) {
    const tok = englishTokens[i]!;
    if (tok.tag === "PUNCT") {
      // PUNCT in our tokeniser is overloaded: real punctuation AND
      // negators (not/never/n't, tagged PUNCT to keep the parser
      // from pulling them into NPs). Surface the negator inline so
      // the legacy path still shows "not".
      if (tok.lemma === "not" || tok.lemma === "n't" || tok.lemma === "never") {
        const negForm = closedClassForm(lang, "not") ?? ["n", "ə"];
        targetTokens.push({
          englishLemma: "not",
          englishTag: "PUNCT",
          targetForm: negForm,
          targetSurface: negForm.join(""),
          glossNote: "neg",
          resolution: "concept",
        });
      }
      continue;
    }

    // ------ closed-class branches ------
    if (tok.tag === "AUX") {
      // Auxiliaries pass tense info to the verb (already handled in
      // tokeniser features) and are generally inflected onto the verb
      // in agglutinative / fusional languages, so we drop them.
      continue;
    }
    if (tok.tag === "DET" && (tok.lemma === "the" || tok.lemma === "a" || tok.lemma === "an")) {
      // Articles. Behaviour depends on articlePresence:
      //   - none      → drop (no article system).
      //   - free      → emit as a separate token (English-style).
      //   - enclitic  → attach to the next noun's form (Romanian-style).
      //   - proclitic → attach to the front of the next noun's form.
      if (articlePresence === "none") continue;
      const articleLemma = tok.lemma === "an" ? "a" : tok.lemma;
      const form = closedClassForm(lang, articleLemma) ?? [];
      if (articlePresence === "free") {
        targetTokens.push({
          englishLemma: tok.lemma,
          englishTag: tok.tag,
          targetForm: form,
          targetSurface: form.join(""),
          glossNote: "art",
          resolution: "concept",
        });
      }
      // For enclitic / proclitic, attach to the next noun in a second pass.
      if (articlePresence === "enclitic" || articlePresence === "proclitic") {
        // Find the next N or PRON token in englishTokens and remember
        // we owe an article attachment.
        for (let j = i + 1; j < englishTokens.length; j++) {
          const nx = englishTokens[j]!;
          if (nx.tag === "N" || nx.tag === "PRON") {
            (nx as EnglishToken & { _pendingArticle?: WordForm })._pendingArticle = form;
            break;
          }
          if (nx.tag === "V") break; // bail before crossing a verb
        }
      }
      continue;
    }
    if (tok.tag === "DET") {
      // Other determiners (this, that, my, ...): emit as a free token.
      const form = closedClassForm(lang, tok.lemma) ?? [];
      if (form.length > 0) {
        targetTokens.push({
          englishLemma: tok.lemma,
          englishTag: tok.tag,
          targetForm: form,
          targetSurface: form.join(""),
          glossNote: "det",
          resolution: "concept",
        });
      }
      continue;
    }
    if (tok.tag === "PREP") {
      // Prepositions only emit in languages whose oblique-marking
      // strategy is preposition or mixed. case-only languages express
      // these via case morphology on the noun (handled in inflectForToken).
      if (caseStrategy === "case") continue;
      const form = closedClassForm(lang, tok.lemma) ?? [];
      if (form.length > 0) {
        targetTokens.push({
          englishLemma: tok.lemma,
          englishTag: tok.tag,
          targetForm: form,
          targetSurface: form.join(""),
          glossNote: caseStrategy === "postposition" ? "postp" : "prep",
          resolution: "concept",
        });
      }
      continue;
    }
    if (tok.tag === "CONJ") {
      const form = closedClassForm(lang, tok.lemma) ?? [];
      if (form.length > 0) {
        targetTokens.push({
          englishLemma: tok.lemma,
          englishTag: tok.tag,
          targetForm: form,
          targetSurface: form.join(""),
          glossNote: "conj",
          resolution: "concept",
        });
      }
      continue;
    }

    // ------ open-class branches ------
    const { form, resolution, glossNote } = resolveLemma(lang, tok.lemma);
    if (!form) {
      missing.push(tok.lemma);
      targetTokens.push({
        englishLemma: tok.lemma,
        englishTag: tok.tag,
        targetForm: [],
        // Unresolved English lemma — surface in typographic
        // quotation marks so the reader knows it's a passthrough,
        // and keep the token in surface order so the rest of the
        // sentence still scans grammatically. Was previously
        // `[lemma]` — switched to "lemma" per user request.
        targetSurface: `“${tok.lemma}”`,
        glossNote: "?",
        resolution,
      });
      continue;
    }
    let { form: inflected, cat } = inflectForToken(form, tok, lang, tok.lemma);

    // Attach a pending enclitic / proclitic article from a preceding DET.
    const pending = (tok as EnglishToken & { _pendingArticle?: WordForm })._pendingArticle;
    if (pending && pending.length > 0) {
      inflected =
        articlePresence === "proclitic"
          ? [...pending, ...inflected]
          : [...inflected, ...pending];
    }

    const out: TranslatedToken = {
      englishLemma: tok.lemma,
      englishTag: tok.tag,
      targetForm: inflected,
      targetSurface: inflected.join(""),
      glossNote,
      resolution,
      inflectedAs: cat,
    };
    targetTokens.push(out);
  }

  // Reorder respecting word-order; closed-class extras are kept in
  // surface position around the S/V/O pivot.
  const arrangedTokens = rearrangeClause(
    targetTokens,
    englishTokens.filter(
      (t) =>
        t.tag !== "PUNCT" &&
        t.tag !== "AUX" &&
        // DETs and PREPs may now be present in targetTokens — pass them
        // through to rearrange so it can keep them in surface order.
        true,
    ),
    lang.grammar.wordOrder,
  );
  // Filter out undefined entries — the legacy `rearrangeClause` can
  // produce sparse arrays when targetTokens and the filtered
  // englishTokens get out of sync due to closed-class extras.
  const arrangedNonNull = arrangedTokens.filter((t): t is TranslatedToken => !!t);
  const arranged = arrangedNonNull.map((t) => t.targetSurface);

  const notes = missing.length === 0
    ? `Resolved every word via the dictionary.`
    : `${missing.length} word${missing.length === 1 ? "" : "s"} unresolved — flagged with [].`;

  return {
    english,
    englishTokens,
    targetTokens: arrangedNonNull,
    arranged,
    missing,
    notes,
  };
}

/**
 * Tree-driven translation path (§2.1).
 *
 * Parses the tagged English tokens into a Sentence, runs the realiser
 * with language-specific typology, then maps the resulting
 * RealisedTokens back into the legacy `TranslatedToken` / `arranged`
 * surface so the UI doesn't need to change. The `englishTokens` field
 * is preserved verbatim so the gloss view still aligns rows.
 */
function translateViaTree(
  lang: Language,
  english: string,
  englishTokens: EnglishToken[],
  parsed: import("./syntax").Sentence,
): SentenceTranslation {
  const missing: string[] = [];
  const realised = realiseSentence(parsed, lang, {
    resolveOpen: (lemma) => {
      const r = resolveLemma(lang, lemma);
      if (!r.form) {
        missing.push(lemma);
        return { form: null, resolution: r.resolution };
      }
      return { form: r.form, resolution: r.resolution };
    },
  });

  // Map RealisedToken[] → TranslatedToken[]. Only open-class slots
  // (S, V, O, ADJ, ADV, possessive heads) carry a real englishLemma;
  // function-word slots (DET, PREP, NEG, NUM) carry the closed-class
  // lemma so the gloss row still labels them.
  const translated: TranslatedToken[] = realised.map((r) => ({
    englishLemma: r.english,
    englishTag:
      r.role === "V" ? "V" :
      r.role === "S" || r.role === "O" || r.role === "PP-NP" || r.role === "POSS" ? "N" :
      r.role === "ADJ" ? "ADJ" :
      r.role === "ADV" ? "ADV" :
      r.role === "DET" ? "DET" :
      r.role === "NUM" ? "NUM" :
      r.role === "PREP" || r.role === "POSTP" ? "PREP" :
      r.role === "NEG" ? "AUX" : // legacy fallback tag
      "PUNCT",
    targetForm: [r.surface],
    targetSurface: r.surface,
    glossNote:
      r.role === "DET" ? "art/det" :
      r.role === "PREP" ? "prep" :
      r.role === "POSTP" ? "postp" :
      r.role === "NEG" ? "neg" :
      r.role === "NUM" ? "num" :
      r.role === "POSS" ? "poss" :
      r.role === "PP-NP" ? "obl" :
      "",
    resolution: r.resolution ?? "concept",
  }));

  const notes = missing.length === 0
    ? `Resolved every word via the dictionary.`
    : `${missing.length} word${missing.length === 1 ? "" : "s"} unresolved — flagged with [].`;

  return {
    english,
    englishTokens,
    targetTokens: translated,
    arranged: translated.map((t) => t.targetSurface).filter((s) => s.length > 0),
    missing,
    notes,
  };
}
