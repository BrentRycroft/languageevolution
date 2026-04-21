export * from "./types";
export { makeRng, fnv1a } from "./rng";
export type { Rng } from "./rng";
export { CATALOG, CATALOG_BY_ID } from "./phonology/catalog";
export { applyChangesToLexicon, applyChangesToWord } from "./phonology/apply";
export { DEFAULT_LEXICON } from "./lexicon/defaults";
export { createSimulation, replay, type Simulation } from "./simulation";
export { defaultConfig } from "./config";
export { leafIds, splitLeaf } from "./tree/split";
export {
  createPopulation,
  derivedConsensus,
  clonePopulation,
  agentAgreementPercent,
  resyncAgentsToLexicon,
} from "./agents/population";
export { runInteractions } from "./agents/interaction";
export { isVowel, isConsonant, formToString, levenshtein, asciiToIpa } from "./phonology/ipa";
