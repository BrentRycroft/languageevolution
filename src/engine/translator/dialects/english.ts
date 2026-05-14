import type { SourceDialect } from "./types";
import { posOf } from "../../lexicon/pos";

/**
 * dialects/english.ts — Phase 73c Tier C Phase 5.5.
 *
 * Concrete `SourceDialect` for English source input. Extracted
 * verbatim from `translator/sentence.ts`'s inline tables; the
 * `tokeniseEnglish` entry point now reads from here through the
 * dialect descriptor.
 *
 * The lemma/strip tables are intentionally small — they cover the
 * highest-frequency irregular forms the simulator's narrative +
 * translation tests exercise. Adding entries here is the supported
 * way to expand coverage; modifying the tokenizer's structural
 * heuristics is a Phase 6+ concern.
 */

const IRREGULAR_VERBS: Readonly<Record<string, string>> = {
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

const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  men: "man", women: "woman", children: "child",
  feet: "foot", teeth: "tooth", mice: "mouse",
  geese: "goose", oxen: "ox", people: "person",
};

const PAST_PARTICIPLES: ReadonlySet<string> = new Set([
  "seen", "gone", "taken", "given", "made", "fallen", "flown",
  "swum", "written", "broken", "spoken", "known", "heard",
  "felt", "brought", "bought", "sold", "thought", "built",
  "fought", "been", "done", "eaten", "drunk", "said", "had",
  "told", "kept", "left", "lost", "met", "paid", "sent",
  "shown", "sung", "sat", "stood", "found",
]);

const AUX_VERBS: ReadonlySet<string> = new Set([
  "am", "is", "are", "was", "were", "be", "been",
  "do", "does", "did",
  "will", "would", "shall", "should",
  "can", "could", "may", "might", "must",
  "have", "has", "had",
]);

const CONTRACTION_HOSTS: Readonly<Record<string, string>> = {
  doesn: "does", don: "do", didn: "did",
  won: "will", wouldn: "would",
  isn: "is", aren: "are", wasn: "was", weren: "were",
  hasn: "has", haven: "have", hadn: "had",
  couldn: "could", shouldn: "should", mustn: "must",
  shan: "shall", mightn: "might",
  "can": "can",
};

/**
 * Local heuristic used by `stripVerbSuffix` to decide whether
 * dropping a single "s" from a -es-ending form yields a legal
 * verb stem. Mirrors the `isBareVerb` helper in sentence.ts but
 * inlined here so the dialect module is self-contained.
 */
function isBareVerb(w: string): boolean {
  return BARE_VERBS.has(w) || posOf(w) === "verb";
}

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

export const ENGLISH_DIALECT: SourceDialect = {
  irregularVerbs: IRREGULAR_VERBS,
  irregularPlurals: IRREGULAR_PLURALS,
  pastParticiples: PAST_PARTICIPLES,
  auxVerbs: AUX_VERBS,
  contractionHosts: CONTRACTION_HOSTS,
  stripVerbSuffix,
  stripNounSuffix,
};
