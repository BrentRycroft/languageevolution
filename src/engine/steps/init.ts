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
import { inventoryFromLexicon } from "./helpers";

/**
 * Assign a register ("high" / "low") to ~15% of seed meanings so the
 * language begins life with a small stylistic stratification. Deterministic
 * via the supplied RNG.
 */
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
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: { ...(config.seedFrequencyHints ?? {}) },
    phonemeInventory: inventoryFromLexicon(seedLex),
    morphology: cloneMorphology(config.seedMorphology),
    localNeighbors: {},
    conservatism: 1.0,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    ruleBias: { ...DEFAULT_RULE_BIAS },
    registerOf: seedRegister(seedLex, rng),
    // Proto sits at the map origin; daughters get coords at split time.
    coords: { x: 0, y: 0 },
    orthography: {},
    otRanking: DEFAULT_OT_RANKING.slice(),
    lastChangeGeneration: {},
  };
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
