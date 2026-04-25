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
      // Conjugation/declension class variants and grammaticalisation
      // source — both optional, both must survive a clone or sister
      // languages would lose their class structure / etymology trail
      // every time `cloneLanguage` runs (snapshot boundary, share,
      // post-bias mutation).
      variants: p.variants
        ? p.variants.map((v) => ({ when: v.when, affix: v.affix.slice() }))
        : undefined,
      source: p.source ? { ...p.source } : undefined,
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
    // New optional containers must be deep-cloned (the spread above
    // only copies their reference). Without this, mutations to a
    // cloned language would leak back into the original — caught by
    // the integration tests when a snapshot's `colexifiedAs` got
    // appended to and the original tree saw the new entries too.
    colexifiedAs: lang.colexifiedAs
      ? Object.fromEntries(
          Object.entries(lang.colexifiedAs).map(([k, v]) => [k, v.slice()]),
        )
      : undefined,
    derivationalSuffixes: lang.derivationalSuffixes
      ? lang.derivationalSuffixes.map((s) => ({
          tag: s.tag,
          affix: s.affix.slice(),
        }))
      : undefined,
    suppletion: lang.suppletion
      ? Object.fromEntries(
          Object.entries(lang.suppletion).map(([m, slots]) => [
            m,
            Object.fromEntries(
              Object.entries(slots).map(([cat, form]) => [
                cat,
                form ? form.slice() : form,
              ]),
            ),
          ]),
        )
      : undefined,
    // Territory: deep-clone the cells array so a snapshot can mutate
    // it without leaking back to the live tree.
    territory: lang.territory
      ? { cells: lang.territory.cells.slice() }
      : undefined,
    // Phoneme-provenance map: shallow per-entry copy is enough since
    // the inner objects are flat.
    inventoryProvenance: lang.inventoryProvenance
      ? Object.fromEntries(
          Object.entries(lang.inventoryProvenance).map(([k, v]) => [k, { ...v }]),
        )
      : undefined,
    // Substrate-acceleration timer is a primitive; spread above already
    // copied it. recentLoanGens needs a slice so the snapshot's array
    // is independent of the live language's running window.
    recentLoanGens: lang.recentLoanGens ? lang.recentLoanGens.slice() : undefined,
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

