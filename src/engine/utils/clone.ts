import type {
  GrammarFeatures,
  Language,
  LanguageNode,
  LanguageTree,
  Lexicon,
  SimulationState,
} from "../types";
import type { Morphology } from "../morphology/types";

export function cloneLexicon(lex: Lexicon): Lexicon {
  const out: Lexicon = {};
  for (const m of Object.keys(lex)) out[m] = lex[m]!.slice();
  return out;
}

export function cloneGrammar(g: GrammarFeatures): GrammarFeatures {
  return { ...g };
}

export function cloneMorphology(morph: Morphology | undefined): Morphology {
  if (!morph) return { paradigms: {} };
  const paradigms: Morphology["paradigms"] = {};
  for (const k of Object.keys(morph.paradigms) as Array<
    keyof Morphology["paradigms"]
  >) {
    const p = morph.paradigms[k];
    if (!p) continue;
    paradigms[k] = {
      affix: p.affix.slice(),
      position: p.position,
      category: p.category,
    };
  }
  return { paradigms };
}

/**
 * Deep-clone a Language so that mutations to the copy can't reach the
 * original. Used at snapshot boundaries (share/export) and by state
 * actions that mutate outside a step cycle (e.g. applyRuleBiasToLanguage).
 */
export function cloneLanguage(lang: Language): Language {
  return {
    ...lang,
    lexicon: cloneLexicon(lang.lexicon),
    grammar: cloneGrammar(lang.grammar),
    morphology: cloneMorphology(lang.morphology),
    events: lang.events.map((e) => ({ ...e })),
    wordFrequencyHints: { ...lang.wordFrequencyHints },
    phonemeInventory: {
      segmental: lang.phonemeInventory.segmental.slice(),
      tones: lang.phonemeInventory.tones.slice(),
      usesTones: lang.phonemeInventory.usesTones,
    },
    localNeighbors: Object.fromEntries(
      Object.entries(lang.localNeighbors).map(([k, v]) => [k, v.slice()]),
    ),
    wordOrigin: { ...lang.wordOrigin },
    activeRules: (lang.activeRules ?? []).map((r) => ({
      ...r,
      outputMap: { ...r.outputMap },
      context: { ...r.context },
    })),
    retiredRules: (lang.retiredRules ?? []).map((r) => ({
      ...r,
      outputMap: { ...r.outputMap },
      context: { ...r.context },
    })),
    ruleBias: lang.ruleBias ? { ...lang.ruleBias } : undefined,
    registerOf: lang.registerOf ? { ...lang.registerOf } : undefined,
    orthography: { ...lang.orthography },
    otRanking: lang.otRanking.slice(),
    lastChangeGeneration: { ...lang.lastChangeGeneration },
  };
}

export function cloneTree(tree: LanguageTree): LanguageTree {
  const out: LanguageTree = {};
  for (const id of Object.keys(tree)) {
    const node = tree[id]!;
    const cloned: LanguageNode = {
      language: cloneLanguage(node.language),
      parentId: node.parentId,
      childrenIds: node.childrenIds.slice(),
    };
    if (node.splitGeneration !== undefined) {
      cloned.splitGeneration = node.splitGeneration;
    }
    out[id] = cloned;
  }
  return out;
}

export function cloneSimulationState(state: SimulationState): SimulationState {
  return {
    generation: state.generation,
    rootId: state.rootId,
    rngState: state.rngState,
    tree: cloneTree(state.tree),
  };
}

