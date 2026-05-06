import type { Language, Meaning, WordForm } from "../types";
import { isRegisteredConcept, CONCEPTS, colexWith } from "../lexicon/concepts";
import { posOf } from "../lexicon/pos";
import { closedClassForm } from "./closedClass";
import { parseSyntaxAll } from "./parse";
import { realiseSentence } from "./realise";
import { pickAspect } from "../narrative/verbClasses";
import { disambiguateSense, pickSynonym } from "../lexicon/word";

export type { EnglishTag, EnglishToken } from "./tokens";
import type { EnglishTag, EnglishToken } from "./tokens";
import { WH_LEMMAS } from "./tokens";

export interface TranslatedToken {
  englishLemma: string;
  englishTag: EnglishTag;
  targetForm: WordForm;
  targetSurface: string;
  glossNote: string;
  resolution:
    | "direct"
    | "concept"
    | "colex"
    | "reverse-colex"
    | "fallback";
}

export interface SentenceTranslation {
  english: string;
  englishTokens: EnglishToken[];
  targetTokens: TranslatedToken[];
  arranged: string[];
  missing: string[];
  notes: string;
}

const PUNCT = /^[.,!?;:'"()]+$/;

const PRONOUNS_OBJ = new Set(["me", "him", "her", "us", "them"]);
const PRONOUNS_SUBJ = new Set(["i", "he", "she", "we", "they"]);
const PRONOUNS_BOTH = new Set(["you", "it"]);
const DETERMINERS = new Set([
  "the", "a", "an",
  "this", "that", "these", "those", "yonder", "yon",
  "some", "any", "all", "no", "every", "each",
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
  "than", "as",
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
const INTERJECTIONS = new Set([
  "yes", "no", "ok", "okay", "yeah", "nope",
  "hi", "hello", "hey", "bye", "goodbye",
  "wow", "oh", "ah", "ouch", "alas", "ugh", "uh", "um",
  "thanks", "sorry", "please", "welcome",
]);
const BARE_NUMERALS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
  "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "million",
]);
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
const BARE_VERBS = new Set([
  "go", "come", "walk", "run", "stand", "sit", "lie", "fall", "fly", "swim",
  "see", "hear", "know", "think", "speak", "say", "call", "ask",
  "do", "make", "take", "give", "hold", "carry", "throw", "pull",
  "push", "cut", "break", "bend", "build", "burn", "wash", "weave",
  "plant", "sow", "freeze", "melt", "hunt", "fight", "scratch",
  "dig", "split", "sew", "rub", "wipe", "pour", "flow", "suck",
  "blow", "spit", "bite", "kill", "breathe",
  "eat", "drink", "sleep", "live", "die", "grow",
  "love", "fear", "laugh", "cry", "play",
  "want", "need", "like", "find", "lose", "win", "open", "close",
  "start", "stop", "wait", "help",
  "chase", "follow", "attack", "meet", "leave", "send", "save",
  "catch", "reach", "join", "show", "tell",
]);
const BARE_ADJECTIVES = new Set([
  "big", "small", "tall", "short", "fast", "slow", "new", "old",
  "good", "bad", "long", "wide", "narrow", "deep", "shallow",
  "hot", "cold", "high", "low", "near", "far", "young", "rich",
  "poor", "strong", "weak", "happy", "sad", "easy", "hard",
  "red", "blue", "green", "yellow", "black", "white",
  "wet", "dry", "full", "empty", "round", "straight", "sharp",
  "wise", "foolish", "brave", "kind", "cruel", "true", "false",
]);

const COMPARATIVE_BASES = new Set([
  "big", "small", "tall", "short", "fast", "slow", "new", "old",
  "good", "bad", "long", "wide", "narrow", "deep", "shallow",
  "hot", "cold", "high", "low", "near", "far", "young", "rich",
  "poor", "strong", "weak", "happy", "sad", "easy", "hard",
]);

const PAST_PARTICIPLES = new Set([
  "seen", "gone", "taken", "given", "made", "fallen", "flown",
  "swum", "written", "broken", "spoken", "known", "heard",
  "felt", "brought", "bought", "sold", "thought", "built",
  "fought", "been", "done", "eaten", "drunk", "said", "had",
  "told", "kept", "left", "lost", "met", "paid", "sent",
  "shown", "sung", "sat", "stood", "found",
]);

const isBareNoun = (w: string): boolean =>
  BARE_NOUNS.has(w) || posOf(w) === "noun";
const isBareVerb = (w: string): boolean =>
  BARE_VERBS.has(w) || posOf(w) === "verb";
const isBareAdjective = (w: string): boolean =>
  BARE_ADJECTIVES.has(w) || posOf(w) === "adjective";

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

const IRREGULAR_PLURALS: Record<string, string> = {
  men: "man", women: "woman", children: "child",
  feet: "foot", teeth: "tooth", mice: "mouse",
  geese: "goose", oxen: "ox", people: "person",
};

function stripVerbSuffix(s: string): string {
  if (IRREGULAR_VERBS[s]) return IRREGULAR_VERBS[s]!;
  if (s.length >= 4 && s.endsWith("ies")) return s.slice(0, -3) + "y";
  if (s.length >= 4 && s.endsWith("ied")) return s.slice(0, -3) + "y";
  if (s.length >= 5 && s.endsWith("ing")) {
    const stem = s.slice(0, -3);
    return stem;
  }
  if (s.length >= 3 && s.endsWith("ed")) {
    const stem = s.slice(0, -2);
    return stem;
  }
  if (s.length >= 4 && s.endsWith("es")) {
    const dropS = s.slice(0, -1);
    if (isBareVerb(dropS)) return dropS;
    return s.slice(0, -2);
  }
  if (s.length >= 2 && s.endsWith("s") && !s.endsWith("ss")) {
    return s.slice(0, -1);
  }
  return s;
}

function stripNounSuffix(s: string): string {
  if (IRREGULAR_PLURALS[s]) return IRREGULAR_PLURALS[s]!;
  if (s.length >= 4 && s.endsWith("ies")) return s.slice(0, -3) + "y";
  if (s.length >= 4 && s.endsWith("ses")) return s.slice(0, -2);
  if (s.length >= 5 && s.endsWith("ves")) {
    const stem = s.slice(0, -3);
    return stem + "f";
  }
  if (s.length >= 3 && s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
  return s;
}

export function tokeniseEnglish(text: string): EnglishToken[] {
  const tokens: EnglishToken[] = [];
  const rawSplit = text
    .toLowerCase()
    .split(/(\s+|[.,!?;:()'"])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const CONTRACTION_HOST: Record<string, string> = {
    doesn: "does", don: "do", didn: "did",
    won: "will", wouldn: "would",
    isn: "is", aren: "are", wasn: "was", weren: "were",
    hasn: "has", haven: "have", hadn: "had",
    couldn: "could", shouldn: "should", mustn: "must",
    shan: "shall", mightn: "might",
    "can": "can",
  };

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
    if (PRONOUNS_OBJ.has(w) || PRONOUNS_SUBJ.has(w) || PRONOUNS_BOTH.has(w)) {
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
      // Phase 36 Tranche 36c/36i: "yonder" / "yon" surface as a
      // DET with the distance lemma `that_far`. Two-way demonstrative
      // languages will fall back to "that" via closedClassForm.
      const lemma = (w === "yonder" || w === "yon") ? "that_far" : w;
      tokens.push({ surface: w, lemma, tag: "DET", features: {} });
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
    if (WH_LEMMAS.has(w)) {
      tokens.push({ surface: w, lemma: w, tag: "PUNCT", features: {} });
      continue;
    }
    if (NEGATORS.has(w)) {
      tokens.push({ surface: w, lemma: w, tag: "PUNCT", features: {} });
      continue;
    }
    if (INTERJECTIONS.has(w)) {
      tokens.push({ surface: w, lemma: w, tag: "PUNCT", features: {} });
      continue;
    }
    if (isBareNoun(w)) {
      tokens.push({
        surface: w,
        lemma: w,
        tag: "N",
        features: { number: "sg" },
      });
      lastWasVerb = false;
      continue;
    }
    if (isBareAdjective(w)) {
      tokens.push({ surface: w, lemma: w, tag: "ADJ", features: {} });
      continue;
    }
    if (isBareVerb(w)) {
      const tense: "past" | "present" | "future" | undefined =
        pendingTense ?? "present";
      tokens.push({ surface: w, lemma: w, tag: "V", features: { tense } });
      pendingTense = undefined;
      lastWasVerb = true;
      continue;
    }
    if (AUX_VERBS.has(w)) {
      const past = ["was", "were", "did", "had"].includes(w);
      const future = w === "will" || w === "would";
      const isHave = w === "have" || w === "has" || w === "had";
      let prevIsDoAux = false;
      for (let pj = tokens.length - 1; pj >= 0; pj--) {
        const u = tokens[pj]!;
        if (u.tag === "PUNCT") continue;
        if (u.tag === "AUX" && (u.lemma === "do" || u.lemma === "does" || u.lemma === "did")) {
          prevIsDoAux = true;
        }
        break;
      }
      const tense: "past" | "present" | "future" =
        prevIsDoAux && isHave
          ? (pendingTense ?? "present")
          : past ? "past" : future ? "future" : "present";
      pendingTense = tense;
      tokens.push({
        surface: w,
        lemma: COPULAS.has(w) ? "be" : w,
        tag: "AUX",
        features: { tense },
      });
      lastWasVerb = false;
      continue;
    }
    if (/^[0-9]+$/.test(w)) {
      tokens.push({ surface: w, lemma: w, tag: "NUM", features: {} });
      continue;
    }
    if (BARE_NUMERALS.has(w)) {
      tokens.push({ surface: w, lemma: w, tag: "NUM", features: {} });
      continue;
    }
    if (w.length >= 3 && w.endsWith("ly")) {
      tokens.push({
        surface: w,
        lemma: w.slice(0, -2),
        tag: "ADV",
        features: {},
      });
      continue;
    }
    if (w.length >= 5 && (w.endsWith("er") || w.endsWith("est"))) {
      const stem = w.endsWith("est") ? w.slice(0, -3) : w.slice(0, -2);
      const stemY = stem.endsWith("i") ? stem.slice(0, -1) + "y" : stem;
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
    }
    const looksVerb =
      IRREGULAR_VERBS[w] !== undefined ||
      (w.length >= 4 && (w.endsWith("ed") || w.endsWith("ing"))) ||
      (w.length >= 4 && w.endsWith("es") && isBareVerb(w.slice(0, -2))) ||
      (w.length >= 3 &&
        w.endsWith("s") &&
        !w.endsWith("ss") &&
        isBareVerb(w.slice(0, -1))) ||
      (lastWasVerb === false && i > 0 && raw[i - 1] === "to");
    if (looksVerb) {
      const lemma = stripVerbSuffix(w);
      const isParticiple = PAST_PARTICIPLES.has(w);
      const tense: "past" | "present" | "future" | undefined =
        isParticiple
          ? "past"
          : pendingTense ??
            (
              w.endsWith("ed") ||
              (IRREGULAR_VERBS[w] && /^(went|came|saw|said|knew|ate|drank|slept|died|had|took|gave|made|fell|ran|flew|swam|fought|brought|bought|sold|thought|built|broke|wrote|read|spoke|heard|felt)$/.test(w))
                ? "past"
                : w.endsWith("ing")
                  ? "present"
                  : "present"
            );
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

  for (const idx of possessorIndices) {
    const t = tokens[idx];
    if (t) t.features.possessor = true;
  }
  for (const idx of negatorIndices) {
    tokens.splice(idx + 1, 0, {
      surface: "n't",
      lemma: "not",
      tag: "PUNCT",
      features: {},
    });
  }

  const DEMONSTRATIVES = new Set(["this", "that", "these", "those"]);
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!;
    if (t.tag !== "DET" || !DEMONSTRATIVES.has(t.lemma)) continue;
    const next = tokens[k + 1];
    const isPronominal =
      !next ||
      (next.tag !== "N" && next.tag !== "ADJ" && next.tag !== "NUM");
    if (!isPronominal) continue;
    const isPlural = t.lemma === "these" || t.lemma === "those";
    tokens[k] = {
      ...t,
      tag: "PRON",
      features: {
        ...t.features,
        person: "3",
        number: isPlural ? "pl" : "sg",
      },
    };
  }

  let nounsSeen = 0;
  for (const t of tokens) {
    if (t.tag !== "N" && t.tag !== "PRON") continue;
    if (t.features.possessor) continue;
    if (t.features.role) continue;
    if (nounsSeen === 0) t.features.role = "subject";
    else if (nounsSeen === 1) t.features.role = "object";
    nounsSeen++;
  }
  return tokens;
}

function resolveLemma(
  lang: Language,
  lemma: string,
): {
  form: WordForm | null;
  resolution: TranslatedToken["resolution"];
  glossNote: string;
} {
  if (lang.lexicon[lemma]) {
    return {
      form: lang.lexicon[lemma]!.slice(),
      resolution: "direct",
      glossNote: "",
    };
  }
  // Phase 39c: compound resolution. If the lemma is registered as a
  // compound (Phase 34a — e.g., "stranger" = strange + -er.agt),
  // recompose from the parts. Models the user's complaint that
  // typing "stranger" against English silently fails.
  if (lang.compounds && lang.compounds[lemma]) {
    const meta = lang.compounds[lemma]!;
    const parts: string[] = [];
    let allFound = true;
    for (const partMeaning of meta.parts) {
      const f = lang.lexicon[partMeaning];
      if (!f || f.length === 0) { allFound = false; break; }
      parts.push(...f);
      if (meta.linker) parts.push(...meta.linker);
    }
    if (allFound && parts.length > 0) {
      return {
        form: parts,
        resolution: "direct",
        glossNote: `compound: ${meta.parts.join("+")}`,
      };
    }
  }
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
  void posOf;
  return { form: null, resolution: "fallback", glossNote: "?" };
}

/**
 * Build a multi-meaning reverse index from `formString` → `Meaning[]`
 * for the given language. `formString` is the IPA-joined phoneme
 * sequence (no separators) — same shape `formToString` produces in IPA
 * mode plus a lowercased ASCII variant. Phase 21b: a single form may
 * carry multiple senses (homonymy / polysemy, e.g. "bank"); the index
 * holds all candidates, and disambiguation happens at lookup time.
 */
export function buildReverseIndex(lang: Language): Map<string, Meaning[]> {
  const out = new Map<string, Meaning[]>();
  const push = (key: string, meaning: Meaning): void => {
    const list = out.get(key);
    if (list) {
      if (!list.includes(meaning)) list.push(meaning);
    } else {
      out.set(key, [meaning]);
    }
  };
  // Prefer the form-centric `words` table when present — it natively
  // groups multi-sense entries. Fall back to the meaning-keyed lexicon
  // for pre-Phase-21 saves with no `words`.
  if (lang.words && lang.words.length > 0) {
    for (const w of lang.words) {
      const ipa = w.formKey;
      const ascii = ipa.toLowerCase();
      for (const s of w.senses) {
        push(ipa, s.meaning);
        if (ascii !== ipa) push(ascii, s.meaning);
      }
    }
  } else {
    for (const m of Object.keys(lang.lexicon)) {
      const form = lang.lexicon[m];
      if (!form || form.length === 0) continue;
      const ipa = form.join("");
      push(ipa, m);
      const ascii = ipa.toLowerCase();
      if (ascii !== ipa) push(ascii, m);
    }
  }
  // Include altForms (Phase 20d doublets): typing the borrowed alt
  // resolves to its meaning. Alts are still per-meaning, so always
  // single-sense entries on the form key.
  if (lang.altForms) {
    for (const m of Object.keys(lang.altForms)) {
      for (const alt of lang.altForms[m] ?? []) {
        const ipa = alt.join("");
        push(ipa, m);
        const ascii = ipa.toLowerCase();
        if (ascii !== ipa) push(ascii, m);
      }
    }
  }
  return out;
}

/**
 * Reverse parse: take a string of target-language tokens (whitespace-
 * separated), match each against the reverse index, and produce a flat
 * list of `TranslatedToken` ready for glossToEnglish. Unmatched tokens
 * yield a fallback token tagged "?". When a form carries multiple
 * meanings (homonymy), `disambiguateSense` picks one based on the
 * surrounding tokens' resolved meanings as sentential context.
 */
export function reverseParseToTokens(
  lang: Language,
  text: string,
): TranslatedToken[] {
  const index = buildReverseIndex(lang);
  const rawTokens = text.trim().split(/\s+/).filter((r) => r.length > 0);
  // First pass: collect candidate-lists per token (no decision yet).
  const candidates: Array<{ raw: string; choices: Meaning[] }> = rawTokens.map(
    (raw) => {
      const choices =
        index.get(raw) ?? index.get(raw.toLowerCase()) ?? [];
      return { raw, choices };
    },
  );
  // Second pass: disambiguate each token using the OTHER tokens'
  // unambiguous meanings as sentential context. (Single-meaning tokens
  // contribute their only meaning; multi-meaning tokens skip until we
  // reach them.)
  const contextLemmas: Meaning[] = candidates
    .filter((c) => c.choices.length === 1)
    .map((c) => c.choices[0]!);
  const tokens: TranslatedToken[] = [];
  for (const { raw, choices } of candidates) {
    if (choices.length === 0) {
      tokens.push({
        englishLemma: "?",
        englishTag: "N",
        targetForm: [],
        targetSurface: raw,
        glossNote: "",
        resolution: "fallback",
      });
      continue;
    }
    const meaning =
      choices.length === 1
        ? choices[0]!
        : disambiguateSense(lang, choices, { contextLemmas });
    const otherSenses = choices.filter((c) => c !== meaning);
    tokens.push({
      englishLemma: meaning,
      englishTag: "N",
      targetForm: lang.lexicon[meaning] ?? [],
      targetSurface: raw,
      glossNote:
        otherSenses.length > 0 ? `↔ ${otherSenses.join("/")}` : "",
      resolution: "direct",
    });
  }
  return tokens;
}

/**
 * Phase 36 Tranche 36d: in-place pass that overrides each VP's
 * `verb.aspect` based on the language's `aspectSystem` setting and
 * the verb's lexical class. Skipped when aspectSystem is "simple"
 * or undefined.
 */
function applyAspectOverrides(
  sentences: import("./syntax").Sentence[],
  lang: Language,
): void {
  const aspectSystem = lang.grammar.aspectSystem ?? "simple";
  if (aspectSystem === "simple") return;
  for (const s of sentences) {
    const vp = s.predicate;
    const verb = vp.verb;
    if (!verb || verb.aspect) continue;
    const tense = verb.tense ?? "present";
    if (tense === "future") continue;
    const picked = pickAspect(verb.lemma, tense, aspectSystem);
    if (picked) verb.aspect = picked;
  }
}

/**
 * Phase 36 Tranche 36e: in-place pass that sets `verb.mood =
 * "subjunctive"` on a parsed Sentence when the language has a
 * subjunctive marker AND the sentence is a subordinate clause.
 * Triggers: `leadingConj` matches a subordinator (that, if, because,
 * when, while, though). Imperative-second-person sentences also get
 * `mood: "imperative"` when applicable.
 */
const SUBJUNCTIVE_TRIGGERS = new Set([
  "that", "if", "because", "when", "while", "though", "although",
  "unless", "lest", "until",
]);
function applyMoodOverrides(
  sentences: import("./syntax").Sentence[],
  lang: Language,
): void {
  const moodMarking = lang.grammar.moodMarking ?? "declarative";
  if (moodMarking === "declarative") return;
  for (const s of sentences) {
    const verb = s.predicate.verb;
    if (!verb || verb.mood) continue;
    // Imperative: second-person subject with no explicit subject
    // (parser-detected) and not interrogative. Triggered for any
    // language with moodMarking that supports it.
    const subjLemma = s.subject?.head.lemma ?? "";
    const isImperative =
      !s.interrogative &&
      verb.tense !== "past" &&
      (subjLemma === "you" || s.subject?.head.isPronoun === true && subjLemma === "you");
    if (moodMarking === "imperative" && isImperative) {
      verb.mood = "imperative";
      continue;
    }
    if (moodMarking === "subjunctive" && s.leadingConj && SUBJUNCTIVE_TRIGGERS.has(s.leadingConj.lemma)) {
      verb.mood = "subjunctive";
      continue;
    }
    // Phase 36 Tranche 36l: opportunistic jussive/hortative emission
    // when the language allows. Jussive triggers on 3rd-person
    // directive sentences containing "let" or "may" as a leading
    // particle; hortative triggers on 1pl with "let us" or "let's".
    if (s.leadingConj && (s.leadingConj.lemma === "let" || s.leadingConj.lemma === "may")) {
      const subjPerson = s.subject?.head.person;
      const subjNum = s.subject?.head.number;
      if (subjPerson === "1" && subjNum === "pl") verb.mood = "hortative";
      else if (subjPerson === "3") verb.mood = "jussive";
    }
  }
}

/**
 * Phase 36 Tranche 36j: opportunistic switch-reference flagging.
 * Walks each parsed Sentence; for languages that track SR, when the
 * sentence has a subordinator (`if`, `when`, `because`, `while`,
 * `that`), set `predicate.subordSubjectCoreference` based on whether
 * the subject is a pronoun (assumed coreferential with matrix → SS)
 * or a full noun (assumed disjoint reference → DS). Heuristic but
 * produces visible morphological contrast in narrative output.
 */
const SUBORDINATOR_TRIGGERS = new Set([
  "if", "when", "because", "while", "though", "although", "that",
  "unless", "lest", "until",
]);
function applySwitchReference(
  sentences: import("./syntax").Sentence[],
  lang: Language,
): void {
  const refTrack = lang.grammar.referenceTracking ?? "none";
  if (refTrack === "none" || refTrack === "logophoric") return;
  for (const s of sentences) {
    if (!s.leadingConj || !SUBORDINATOR_TRIGGERS.has(s.leadingConj.lemma)) continue;
    const subj = s.subject?.head;
    if (!subj) continue;
    s.predicate.subordSubjectCoreference = subj.isPronoun ? "same" : "different";
  }
}

export function translateSentence(lang: Language, english: string): SentenceTranslation {
  const englishTokens = tokeniseEnglish(english);

  const parsedAll = parseSyntaxAll(englishTokens);
  if (parsedAll.length > 0) {
    return translateViaTree(lang, english, englishTokens, parsedAll);
  }
  return translateFragment(lang, english, englishTokens);
}

function translateFragment(
  lang: Language,
  english: string,
  englishTokens: EnglishToken[],
): SentenceTranslation {
  const articlePresence = lang.grammar.articlePresence ?? "none";
  const caseStrategy = lang.grammar.caseStrategy ?? (lang.grammar.hasCase ? "case" : "preposition");
  const hasNominalHost = englishTokens.some((t) => t.tag === "N" || t.tag === "PRON");
  const targetTokens: TranslatedToken[] = [];
  const missing: string[] = [];
  let pendingArticle: WordForm | null = null;
  let pendingAffix: "enclitic" | "proclitic" | null = null;
  const emitClosedClass = (lemma: string, tag: EnglishTag, glossNote: string) => {
    const form = closedClassForm(lang, lemma === "an" ? "a" : lemma) ?? [];
    if (form.length === 0) return;
    targetTokens.push({
      englishLemma: lemma,
      englishTag: tag,
      targetForm: form,
      targetSurface: form.join(""),
      glossNote,
      resolution: "concept",
    });
  };

  for (const tok of englishTokens) {
    switch (tok.tag) {
      case "PUNCT":
        if (tok.lemma === "not" || tok.lemma === "n't" || tok.lemma === "never") {
          emitClosedClass("not", "PUNCT", "neg");
        } else if (WH_LEMMAS.has(tok.lemma)) {
          emitClosedClass(tok.lemma, "PUNCT", "wh");
        } else if (INTERJECTIONS.has(tok.lemma)) {
          const lex = lang.lexicon[tok.lemma];
          const form = lex ?? closedClassForm(lang, tok.lemma) ?? [];
          if (form.length > 0) {
            targetTokens.push({
              englishLemma: tok.lemma,
              englishTag: "PUNCT",
              targetForm: form,
              targetSurface: form.join(""),
              glossNote: "interj",
              resolution: lex ? "direct" : "concept",
            });
          }
        }
        continue;
      case "AUX":
        continue;
      case "DET": {
        const isArticle = tok.lemma === "the" || tok.lemma === "a" || tok.lemma === "an";
        if (isArticle && articlePresence === "none") continue;
        if (isArticle && (articlePresence === "enclitic" || articlePresence === "proclitic")) {
          const af = closedClassForm(lang, tok.lemma === "an" ? "a" : tok.lemma) ?? [];
          if (af.length > 0) {
            pendingArticle = af;
            pendingAffix = articlePresence;
          }
          continue;
        }
        emitClosedClass(tok.lemma, "DET", isArticle ? "art" : "det");
        continue;
      }
      case "PREP":
        if (caseStrategy === "case" && hasNominalHost) continue;
        emitClosedClass(tok.lemma, "PREP", caseStrategy === "postposition" ? "postp" : "prep");
        continue;
      case "CONJ":
        emitClosedClass(tok.lemma, "CONJ", "conj");
        continue;
      case "NUM": {
        const lex = lang.lexicon[tok.lemma];
        const form = lex ?? closedClassForm(lang, tok.lemma) ?? [];
        if (form.length > 0) {
          targetTokens.push({
            englishLemma: tok.lemma,
            englishTag: "NUM",
            targetForm: form,
            targetSurface: form.join(""),
            glossNote: "num",
            resolution: lex ? "direct" : "concept",
          });
        }
        continue;
      }
      default: {
        const { form: rawForm, resolution, glossNote } = resolveLemma(lang, tok.lemma);
        // Phase 39c: synonym selection in fragment fallback. When the
        // meaning has synonyms, pick one (register-aware). Pre-39c
        // fragment mode used the primary form only; tree mode used
        // pickSynonym. Now both paths are consistent.
        let form: WordForm | null = rawForm;
        if (rawForm && lang.words) {
          const picked = pickSynonym(lang, tok.lemma, {});
          if (picked && picked.length > 0) form = picked;
        }
        if (!form) {
          missing.push(tok.lemma);
          targetTokens.push({
            englishLemma: tok.lemma,
            englishTag: tok.tag,
            targetForm: [],
            targetSurface: `“${tok.lemma}”`,
            glossNote: "?",
            resolution,
          });
          continue;
        }
        let inflected = form;
        if (pendingArticle && (tok.tag === "N" || tok.tag === "PRON")) {
          inflected = pendingAffix === "proclitic"
            ? [...pendingArticle, ...inflected]
            : [...inflected, ...pendingArticle];
          pendingArticle = null;
          pendingAffix = null;
        }
        targetTokens.push({
          englishLemma: tok.lemma,
          englishTag: tok.tag,
          targetForm: inflected,
          targetSurface: inflected.join(""),
          glossNote,
          resolution,
        });
      }
    }
  }

  const notes = missing.length === 0
    ? `Resolved every word via the dictionary.`
    : `${missing.length} word${missing.length === 1 ? "" : "s"} unresolved — flagged with [].`;

  return {
    english,
    englishTokens,
    targetTokens,
    arranged: targetTokens.map((t) => t.targetSurface).filter((s) => s.length > 0),
    missing,
    notes,
  };
}

function translateViaTree(
  lang: Language,
  english: string,
  englishTokens: EnglishToken[],
  parsedAll: import("./syntax").Sentence[],
): SentenceTranslation {
  // Phase 36 Tranche 36d: language-driven aspect override. Walk
  // each parsed VP and, when the language has a grammaticalised
  // aspect system, override the verb's aspect based on its class
  // (punctual/durative/stative). For "simple" aspect systems this
  // is a no-op.
  applyAspectOverrides(parsedAll, lang);
  applyMoodOverrides(parsedAll, lang);
  applySwitchReference(parsedAll, lang);
  const missing: string[] = [];
  const resolveOpen = (lemma: string) => {
    const r = resolveLemma(lang, lemma);
    if (!r.form) {
      missing.push(lemma);
      return { form: null, resolution: r.resolution };
    }
    return { form: r.form, resolution: r.resolution };
  };
  const realised = parsedAll.flatMap((s) =>
    realiseSentence(s, lang, { resolveOpen }),
  );

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
      r.role === "NEG" ? "AUX" :
      "PUNCT",
    targetForm: r.form.length > 0 ? r.form : [r.surface],
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

  for (const tok of englishTokens) {
    if (tok.tag !== "PUNCT") continue;
    if (!INTERJECTIONS.has(tok.lemma)) continue;
    const lex = lang.lexicon[tok.lemma];
    const form = lex ?? closedClassForm(lang, tok.lemma) ?? [];
    if (form.length === 0) continue;
    translated.unshift({
      englishLemma: tok.lemma,
      englishTag: "PUNCT",
      targetForm: form,
      targetSurface: form.join(""),
      glossNote: "interj",
      resolution: lex ? "direct" : "concept",
    });
  }

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
