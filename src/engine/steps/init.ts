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
import { classifyLexicon } from "../morphology/inflectionClass";
import { lexicalCapacity as computeCapacity } from "../lexicon/tier";
import { syncWordsFromLexicon } from "../lexicon/word";
import {
  CLOSED_CLASS_LEMMAS,
  closedClassForm,
} from "../translator/closedClass";
import {
  getWorldMap,
  randomLandCell,
  suggestedEarthOrigin,
  territoryCentroid,
} from "../geo/map";

function initialLexicalCapacity(lang: Language): number {
  return computeCapacity(lang, lang.birthGeneration);
}

/**
 * Phase 29 Tranche 5k: pour synthesised closed-class lemmas
 * (the/of/and/i/you/…) into the lexicon at language birth so they
 * evolve through normal phonology. Only fills lemmas that the seed
 * lexicon doesn't already define. Marks them with origin
 * "closed-class" and high frequency so the rate-curve treats them
 * as function words (faster erosion than content words).
 */
function seedClosedClassLexicon(lang: Language): void {
  for (const lemma of CLOSED_CLASS_LEMMAS) {
    if (lemma === "Q" || lemma === "CLF") continue;
    if (lang.lexicon[lemma]) continue;
    const form = closedClassForm(lang, lemma);
    if (!form || form.length === 0) continue;
    lang.lexicon[lemma] = form;
    if (!lang.wordOrigin[lemma]) lang.wordOrigin[lemma] = "closed-class";
    if (lang.wordFrequencyHints[lemma] === undefined) {
      lang.wordFrequencyHints[lemma] = 0.95;
    }
  }
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
    infinitiveStrategy: config.seedInfinitiveStrategy ?? { kind: "bare" },
    // Phase 27a: phonotactic profile defaults to permissive (English-like)
    // when no preset specifies — preserves pre-Phase-27 behavior.
    phonotacticProfile: config.seedPhonotacticProfile ?? {
      maxOnset: 3,
      maxCoda: 4,
      maxCluster: 4,
      strictness: 0.4,
    },
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
  // Phase 29 Tranche 5k: pour synthesised closed-class lemmas into
  // the lexicon at language birth so they participate in phonology
  // like any other word. Pre-fix the closedClassForm() machinery
  // recomputed forms from a hash on every call, meaning function
  // words like "the" / "of" / "and" / "i" / "you" never eroded —
  // contradicting Phase 24's whole frequency-direction premise that
  // function words should erode FASTEST. (closedClassTable still
  // synthesises for any lemma we haven't seeded; pre-existing
  // analogy + drift gates already exclude these meanings, so they
  // erode but don't reshape.)
  seedClosedClassLexicon(rootLang);
  assignAllGenders(rootLang);
  // Phase 29 Tranche 5e: bucket every seed meaning into an inflection
  // class (Latin-style 1/2/3/4) biased by phonological shape. The
  // class is stable across the language's lifetime and consulted by
  // paradigm-pickers for class-specific affixes.
  classifyLexicon(rootLang, rng);
  // Phase 21a: build the form-centric `words` table from the seed
  // lexicon so day-zero languages already have the new layer populated.
  // No behavior change: `lexicon` remains the source of truth until
  // 21b+ wire writers through `addWord`/`removeSense`.
  syncWordsFromLexicon(rootLang, 0);
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
