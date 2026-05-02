import type {
  Language,
  LanguageNode,
  LanguageTree,
  SimulationConfig,
  SimulationState,
} from "../types";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { DEFAULT_OT_RANKING } from "../phonology/ot";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";
import { makeRng } from "../rng";
import { cloneLexicon, cloneMorphology } from "../utils/clone";
import { inventoryFromLexicon, seedNativeProvenance } from "./helpers";
import { seedDerivationalSuffixes } from "../lexicon/derivation";
import { assignAllGenders } from "../morphology/gender";
import { lexicalCapacity as computeCapacity } from "../lexicon/tier";
import {
  getWorldMap,
  randomLandCell,
  suggestedEarthOrigin,
  territoryCentroid,
} from "../geo/map";

function initialLexicalCapacity(lang: Language): number {
  return computeCapacity(lang, lang.birthGeneration);
}

function cloneSuppletion(
  s: NonNullable<Language["suppletion"]>,
): NonNullable<Language["suppletion"]> {
  const out: NonNullable<Language["suppletion"]> = {};
  for (const m of Object.keys(s)) {
    const slots = s[m];
    if (!slots) continue;
    const cloned: NonNullable<Language["suppletion"]>[string] = {};
    for (const cat of Object.keys(slots) as Array<keyof typeof slots>) {
      const f = slots[cat];
      if (f && f.length > 0) cloned[cat] = f.slice();
    }
    out[m] = cloned;
  }
  return out;
}

function seedRegister(
  lex: import("../types").Lexicon,
  rng: import("../rng").Rng,
): Record<string, "high" | "low"> {
  const out: Record<string, "high" | "low"> = {};
  for (const m of Object.keys(lex).sort()) {
    if (rng.chance(0.15)) {
      out[m] = rng.chance(0.5) ? "high" : "low";
    }
  }
  return out;
}

export function buildInitialState(config: SimulationConfig): SimulationState {
  const rng = makeRng(config.seed);
  const rootId = "L-0";
  const enabled = config.phonology.enabledChangeIds.slice().sort();
  const weights: Record<string, number> = {};
  for (const id of enabled) {
    weights[id] = config.phonology.changeWeights[id] ?? CATALOG_BY_ID[id]?.baseWeight ?? 1;
  }
  const seedLex = cloneLexicon(config.seedLexicon);
  const rootLang: Language = {
    id: rootId,
    name: "Proto",
    lexicon: seedLex,
    enabledChangeIds: enabled,
    changeWeights: weights,
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR, ...(config.seedGrammar ?? {}) },
    events: [],
    wordFrequencyHints: { ...(config.seedFrequencyHints ?? {}) },
    phonemeInventory: inventoryFromLexicon(seedLex),
    morphology: cloneMorphology(config.seedMorphology),
    localNeighbors: {},
    conservatism: 1.0,
    speakers: 10000,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    ruleBias: { ...DEFAULT_RULE_BIAS },
    registerOf: seedRegister(seedLex, rng),
    coords: { x: 0, y: 0 },
    orthography: {},
    otRanking: DEFAULT_OT_RANKING.slice(),
    lastChangeGeneration: {},
    stressPattern: config.seedStressPattern ?? "penult",
    lexicalStress: config.seedLexicalStress
      ? { ...config.seedLexicalStress }
      : undefined,
    culturalTier: config.seedCulturalTier ?? 0,
    suppletion: config.seedSuppletion
      ? cloneSuppletion(config.seedSuppletion)
      : undefined,
  };
  rootLang.derivationalSuffixes = seedDerivationalSuffixes(rootLang, rng);
  rootLang.lexicalCapacity = initialLexicalCapacity(rootLang);
  seedNativeProvenance(rootLang);
  assignAllGenders(rootLang);
  const mapMode = config.mapMode ?? "random";
  const worldMap = getWorldMap(mapMode, config.seed);
  let originId: number | null =
    config.originCellId !== undefined && worldMap.cells[config.originCellId]
      ? config.originCellId
      : null;
  if (originId === null) {
    if (mapMode === "earth") {
      originId = suggestedEarthOrigin(config.preset, worldMap);
    }
    if (originId === null) {
      originId = randomLandCell(worldMap, rng);
    }
  }
  if (originId !== null && worldMap.cells[originId]) {
    rootLang.territory = { cells: [originId] };
    rootLang.coords = territoryCentroid(worldMap, [originId]);
  }
  const rootNode: LanguageNode = {
    language: rootLang,
    parentId: null,
    childrenIds: [],
  };
  const tree: LanguageTree = { [rootId]: rootNode };
  return {
    generation: 0,
    tree,
    rootId,
    rngState: rng.state(),
  };
}
