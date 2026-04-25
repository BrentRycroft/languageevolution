import type { MorphCategory } from "../morphology/types";

/**
 * Semantic tags for cross-linguistically common grammaticalization sources.
 * Not every meaning needs a tag — an untagged meaning simply isn't eligible
 * to become an affix via `maybeGrammaticalize`. Tags are chosen for their
 * attested pathways; see Heine & Kuteva's _Lexicon of Grammaticalization_
 * for the canonical reference list.
 */
export type SemanticTag =
  | "motion" // go, come, walk, run, fly, swim, fall
  | "posture" // sit, stand, lie
  | "existential" // be, live
  | "possession" // hold, have, take, give, carry
  | "body_core" // hand, head, heart, eye, face, back, belly
  | "body_periphery" // foot, nail, finger, tail
  | "quantifier" // one, two, three, all, many
  | "perception" // see, hear, know, say, think
  | "life" // eat, drink, sleep, die, bear_child
  | "deixis" // this, that, here, there
  | "interrogative" // who, what, where, when, why, how → question particle
  | "topic_noun" // name, word, thing → topic marker
  | "emphasis"; // very, really, indeed → emphasis particle

export const SEMANTIC_TAG: Record<string, SemanticTag> = {
  // motion
  go: "motion",
  come: "motion",
  walk: "motion",
  run: "motion",
  fly: "motion",
  swim: "motion",
  fall: "motion",
  // posture
  sit: "posture",
  stand: "posture",
  lie: "posture",
  // existential
  be: "existential",
  live: "existential",
  // possession / transfer
  hold: "possession",
  take: "possession",
  give: "possession",
  carry: "possession",
  have: "possession",
  // body, core (locative + case sources)
  head: "body_core",
  hand: "body_core",
  heart: "body_core",
  eye: "body_core",
  face: "body_core",
  back: "body_core",
  belly: "body_core",
  mouth: "body_core",
  // body, periphery
  foot: "body_periphery",
  finger: "body_periphery",
  nail: "body_periphery",
  tail: "body_periphery",
  // quantifier
  one: "quantifier",
  two: "quantifier",
  three: "quantifier",
  all: "quantifier",
  many: "quantifier",
  some: "quantifier",
  // perception / cognition
  see: "perception",
  hear: "perception",
  know: "perception",
  say: "perception",
  speak: "perception",
  think: "perception",
  // life
  eat: "life",
  drink: "life",
  sleep: "life",
  die: "life",
  bear_child: "life",
  // deixis
  this: "deixis",
  that: "deixis",
  here: "deixis",
  there: "deixis",
  // interrogatives → question particles (Mandarin ma, Japanese ka)
  who: "interrogative",
  what: "interrogative",
  where: "interrogative",
  when: "interrogative",
  why: "interrogative",
  how: "interrogative",
  // topic-marking source nouns (Korean eun/neun, Japanese wa)
  name: "topic_noun",
  word: "topic_noun",
  // emphasis adverbs (Mandarin de, Japanese ne, English "really")
  truth: "emphasis",
};

/**
 * Attested source → target pathway. Keys are semantic tags; values are the
 * grammatical categories that tag typically grammaticalizes into. Pulled
 * from Heine & Kuteva, with a conservative subset chosen so the engine
 * doesn't propose fringe cases like "foot → dual".
 */
export const PATHWAYS: Record<SemanticTag, MorphCategory[]> = {
  // "go" → future is a famous one (English "going to", Swahili "ta-");
  // "come" → future also common. Aspectual uses come from general motion
  // + posture verbs merging into progressive/habitual.
  motion: ["verb.tense.fut", "verb.aspect.pfv", "verb.aspect.ipfv"],
  // Sit/stand/lie → progressive/continuative/habitual is attested across
  // Austronesian, Niger-Congo, and some Indo-European branches.
  posture: ["verb.aspect.ipfv", "verb.aspect.pfv"],
  // "Be" is the canonical past / perfect auxiliary in dozens of families.
  existential: ["verb.tense.past", "verb.aspect.pfv"],
  // Have/take/give → possessive marker or indirect-object case.
  possession: ["noun.case.gen", "noun.case.dat", "verb.aspect.pfv"],
  // Body parts are the dominant source of spatial cases worldwide.
  // "back" → behind/locative, "head" → top/on, "face" → in-front.
  body_core: ["noun.case.loc", "noun.case.dat", "noun.case.inst"],
  body_periphery: ["noun.case.loc", "noun.case.abl"],
  // "One" → singulative, quantifier → plural are rarer but attested.
  quantifier: ["noun.num.pl", "noun.num.du"],
  // "Say" → complementizer / reportative; "see" → evidential. We slot
  // these into past for simplicity (reportative-like).
  perception: ["verb.tense.past", "verb.aspect.pfv"],
  // Life verbs rarely grammaticalize; "die" → perfective resultative is
  // the best-attested.
  life: ["verb.aspect.pfv"],
  // Demonstratives → definite article is a top-10 pathway.
  deixis: ["noun.case.nom"],
  // Discourse pathways. Question particles from interrogative
  // pronouns (Mandarin "ma" from "mā" 'mother' is a folk-etymology
  // — it's actually from a final particle that grammaticalised
  // from interrogative roots; Japanese "ka" similarly derives from
  // an interrogative pronoun stem). Topic markers from topic-noun
  // sources ("name" / "word"). Emphasis particles from
  // truth/intensifier adverbs.
  interrogative: ["discourse.q"],
  topic_noun: ["discourse.topic"],
  emphasis: ["discourse.emph"],
};

export function semanticTagOf(meaning: string): SemanticTag | undefined {
  return SEMANTIC_TAG[meaning];
}

export function pathwayTargets(tag: SemanticTag): MorphCategory[] {
  return PATHWAYS[tag] ?? [];
}
