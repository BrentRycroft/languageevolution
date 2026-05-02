import { describe, it, expect } from "vitest";
import { stepCreolization } from "../steps/creolization";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import type {
  Language,
  LanguageNode,
  SimulationConfig,
  SimulationState,
} from "../types";

function makeLang(id: string, overrides: Partial<Language> = {}): Language {
  return {
    id,
    name: id,
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SOV",
      affixPosition: "suffix",
      pluralMarking: "affix",
      tenseMarking: "past",
      hasCase: true,
      genderCount: 3,
      alignment: "erg-abs",
      caseStrategy: "case",
      synthesisIndex: 3.5,
      fusionIndex: 0.7,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["p", "a"], tones: ["H", "L"], usesTones: true },
    morphology: {
      paradigms: {
        "noun.num.pl": { affix: ["s"], position: "suffix", category: "noun.num.pl" },
        "noun.case.acc": { affix: ["m"], position: "suffix", category: "noun.case.acc" },
        "verb.tense.past": { affix: ["d"], position: "suffix", category: "verb.tense.past" },
        "verb.aspect.prog": { affix: ["i", "ŋ"], position: "suffix", category: "verb.aspect.prog" },
        "verb.person.3sg": { affix: ["s"], position: "suffix", category: "verb.person.3sg" },
      },
    },
    suppletion: {
      go: { "verb.tense.past": ["w", "ɛ", "n", "t"] },
    },
    gender: { dog: 1 },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    speakers: 1000,
    territory: { cells: [0, 1, 2] },
    ...overrides,
  };
}

function makeState(a: Language, b: Language): SimulationState {
  const tree: Record<string, LanguageNode> = {
    L1: { language: a, parentId: null, childrenIds: [] },
    L2: { language: b, parentId: null, childrenIds: [] },
  };
  return {
    generation: 100,
    rootId: "L1",
    tree,
    rngState: 1,
  };
}

describe("creolization deepening", () => {
  /**
   * Use stepCreolization with a fixed pseudo-RNG that always passes the
   * 0.0005 gate. We override the rng's chance() externally by repeating
   * many times until it fires (probability is low so we run lots).
   */
  it("applies all creolization transforms when it fires", () => {
    let fired = false;
    const cfg: SimulationConfig = {
      ...defaultConfig(),
      mapMode: "random",
    };
    for (let attempt = 0; attempt < 5000 && !fired; attempt++) {
      const a = makeLang("L1", { name: "lexifier", speakers: 100_000 });
      const b = makeLang("L2", { name: "substrate", speakers: 1_000 });
      // Same territory cells → high arealShareAffinity.
      a.territory = { cells: [0, 1, 2] };
      b.territory = { cells: [0, 1, 2] };
      const state = makeState(a, b);
      const rng = makeRng(`creo-${attempt}`);
      stepCreolization(state, cfg, rng, 100);
      // Detect: substrate's morphology has been pruned to ≤2 paradigms.
      const substrate = b;
      if (Object.keys(substrate.morphology.paradigms).length <= 2) {
        fired = true;
        // All audit-listed transforms should be applied:
        expect(substrate.grammar.wordOrder).toBe("SVO");
        expect(substrate.grammar.hasCase).toBe(false);
        expect(substrate.grammar.genderCount).toBe(0);
        expect(substrate.grammar.alignment).toBe("nom-acc");
        expect(substrate.suppletion).toBeUndefined();
        expect(substrate.gender).toBeUndefined();
        expect(substrate.phonemeInventory.usesTones).toBe(false);
        expect(substrate.phonemeInventory.tones).toEqual([]);
        // Synthesis collapses to analytic
        expect(substrate.grammar.synthesisIndex).toBe(1.0);
      }
    }
    expect(fired).toBe(true);
  });
});
