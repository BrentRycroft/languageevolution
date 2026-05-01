import { describe, it, expect } from "vitest";
import { reconstructProtoForm, reconstructProtoLexicon } from "../tree/reconstruction";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { levenshtein } from "../phonology/ipa";
import type { LanguageTree, WordForm } from "../types";

describe("comparative reconstruction", () => {
  it("reconstructs a single descendant's form trivially", () => {
    const lang = {
      id: "L0",
      name: "child",
      lexicon: { water: ["w", "a", "t", "e", "r"] },
      enabledChangeIds: [],
      changeWeights: {},
      birthGeneration: 0,
      grammar: {
        wordOrder: "SVO" as const,
        affixPosition: "suffix" as const,
        pluralMarking: "none" as const,
        tenseMarking: "none" as const,
        hasCase: false,
        genderCount: 0 as const,
      },
      events: [],
      wordFrequencyHints: {},
      phonemeInventory: { segmental: [], tones: [], usesTones: false },
      morphology: { paradigms: {} },
      localNeighbors: {},
      conservatism: 1,
      wordOrigin: {},
      activeRules: [],
      retiredRules: [],
      orthography: {},
      otRanking: [],
      lastChangeGeneration: {},
    };
    const tree: LanguageTree = {
      P: { language: { ...lang, id: "P" }, parentId: null, childrenIds: ["L0"] },
      L0: { language: lang, parentId: "P", childrenIds: [] },
    };
    const r = reconstructProtoForm(tree, "P", "water");
    expect(r).not.toBeNull();
    expect(r!.form).toEqual(["w", "a", "t", "e", "r"]);
    expect(r!.confidence).toBe(1);
  });

  it("reconstructs the majority position when descendants disagree", () => {
    const proto = {
      a: ["w", "a", "t"] as WordForm,
      b: ["w", "a", "t"] as WordForm,
      c: ["w", "i", "t"] as WordForm,
    };
    const tree: LanguageTree = {
      P: { language: makeStub("P"), parentId: null, childrenIds: ["a", "b", "c"] },
      a: { language: { ...makeStub("a"), lexicon: { x: proto.a } }, parentId: "P", childrenIds: [] },
      b: { language: { ...makeStub("b"), lexicon: { x: proto.b } }, parentId: "P", childrenIds: [] },
      c: { language: { ...makeStub("c"), lexicon: { x: proto.c } }, parentId: "P", childrenIds: [] },
    };
    const r = reconstructProtoForm(tree, "P", "x");
    expect(r!.form).toEqual(["w", "a", "t"]);
  });

  it("ignores extinct leaves", () => {
    const tree: LanguageTree = {
      P: { language: makeStub("P"), parentId: null, childrenIds: ["a", "b"] },
      a: {
        language: { ...makeStub("a"), lexicon: { x: ["k", "a", "t"] }, extinct: true },
        parentId: "P",
        childrenIds: [],
      },
      b: { language: { ...makeStub("b"), lexicon: { x: ["t", "i", "k"] } }, parentId: "P", childrenIds: [] },
    };
    const r = reconstructProtoForm(tree, "P", "x");
    expect(r!.form).toEqual(["t", "i", "k"]);
  });

  it("reconstructProtoLexicon returns one entry per meaning attested", () => {
    const tree: LanguageTree = {
      P: { language: makeStub("P"), parentId: null, childrenIds: ["a", "b"] },
      a: { language: { ...makeStub("a"), lexicon: { x: ["a"], y: ["b"] } }, parentId: "P", childrenIds: [] },
      b: { language: { ...makeStub("b"), lexicon: { x: ["a"], z: ["c"] } }, parentId: "P", childrenIds: [] },
    };
    const list = reconstructProtoLexicon(tree, "P");
    const meanings = new Set(list.map((r) => r.meaning));
    expect(meanings.has("x")).toBe(true);
    expect(meanings.has("y")).toBe(true);
    expect(meanings.has("z")).toBe(true);
  });

  it("end-to-end: reconstructed root forms stay close to seed lexicon for stable Swadesh words after 100 gens", () => {
    const cfg = defaultConfig();
    cfg.seed = "reconstruction-1";
    const sim = createSimulation(cfg);
    const seedLex = sim.getState().tree[sim.getState().rootId]!.language.lexicon;
    const seedSnapshot: Record<string, WordForm> = {};
    for (const m of Object.keys(seedLex)) seedSnapshot[m] = seedLex[m]!.slice();

    for (let i = 0; i < 100; i++) sim.step();
    const tree = sim.getState().tree;
    const rootId = sim.getState().rootId;
    const stableMeanings = ["water", "fire", "mother", "father", "i", "you", "two"];
    let totalDist = 0;
    let count = 0;
    for (const m of stableMeanings) {
      if (!seedSnapshot[m]) continue;
      const r = reconstructProtoForm(tree, rootId, m);
      if (!r) continue;
      const d = levenshtein(r.form, seedSnapshot[m]!);
      totalDist += d;
      count++;
    }
    expect(count).toBeGreaterThan(0);
    const avgDist = totalDist / count;
    expect(avgDist, "Average Levenshtein distance from seed across stable Swadesh words ≤ 4 over 100 gens").toBeLessThanOrEqual(4);
  });
});

function makeStub(id: string) {
  return {
    id,
    name: id,
    lexicon: {} as Record<string, WordForm>,
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO" as const,
      affixPosition: "suffix" as const,
      pluralMarking: "none" as const,
      tenseMarking: "none" as const,
      hasCase: false,
      genderCount: 0 as const,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
  };
}
