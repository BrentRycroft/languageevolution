import type { MorphCategory } from "../morphology/types";

export type SemanticTag =
  | "motion"
  | "posture"
  | "existential"
  | "possession"
  | "body_core"
  | "body_periphery"
  | "quantifier"
  | "perception"
  | "life"
  | "deixis"
  | "interrogative"
  | "topic_noun"
  | "emphasis";

export const SEMANTIC_TAG: Record<string, SemanticTag> = {
  go: "motion",
  come: "motion",
  walk: "motion",
  run: "motion",
  fly: "motion",
  swim: "motion",
  fall: "motion",
  sit: "posture",
  stand: "posture",
  lie: "posture",
  be: "existential",
  live: "existential",
  hold: "possession",
  take: "possession",
  give: "possession",
  carry: "possession",
  have: "possession",
  head: "body_core",
  hand: "body_core",
  heart: "body_core",
  eye: "body_core",
  face: "body_core",
  back: "body_core",
  belly: "body_core",
  mouth: "body_core",
  foot: "body_periphery",
  finger: "body_periphery",
  nail: "body_periphery",
  tail: "body_periphery",
  one: "quantifier",
  two: "quantifier",
  three: "quantifier",
  all: "quantifier",
  many: "quantifier",
  some: "quantifier",
  see: "perception",
  hear: "perception",
  know: "perception",
  say: "perception",
  speak: "perception",
  think: "perception",
  eat: "life",
  drink: "life",
  sleep: "life",
  die: "life",
  bear_child: "life",
  this: "deixis",
  that: "deixis",
  here: "deixis",
  there: "deixis",
  who: "interrogative",
  what: "interrogative",
  where: "interrogative",
  when: "interrogative",
  why: "interrogative",
  how: "interrogative",
  name: "topic_noun",
  word: "topic_noun",
  truth: "emphasis",
};

export const PATHWAYS: Record<SemanticTag, MorphCategory[]> = {
  motion: ["verb.tense.fut", "verb.aspect.pfv", "verb.aspect.ipfv"],
  posture: ["verb.aspect.ipfv", "verb.aspect.pfv"],
  existential: ["verb.tense.past", "verb.aspect.pfv"],
  possession: ["noun.case.gen", "noun.case.dat", "verb.aspect.pfv"],
  body_core: ["noun.case.loc", "noun.case.dat", "noun.case.inst"],
  body_periphery: ["noun.case.loc", "noun.case.abl"],
  quantifier: ["noun.num.pl", "noun.num.du"],
  perception: ["verb.tense.past", "verb.aspect.pfv"],
  life: ["verb.aspect.pfv"],
  deixis: ["noun.case.nom"],
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
