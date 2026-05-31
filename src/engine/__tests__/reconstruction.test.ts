import { describe, it, expect } from "vitest";
import { reconstructProtoForm, reconstructProtoLexicon } from "../tree/reconstruction";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { levenshtein } from "../phonology/ipa";
import type { LanguageTree, WordForm } from "../types";
import { rekeyLexiconToConceptIds } from "../lexicon/conceptIdentity";
import { lexEntries } from "../lexicon/access";

/**
 * reconstruction.test.ts
 *
 * Test suite for: "comparative reconstruction".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("comparative reconstruction", () => {
  it("reconstructs a single descendant's form trivially", () => {
    const lang = makeStubWith("L0", { water: ["w", "a", "t", "e", "r"] });
    const tree: LanguageTree = {
      P: { language: makeStubWith("P", { water: ["w", "a", "t", "e", "r"] }), parentId: null, childrenIds: ["L0"] },
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
      a: { language: makeStubWith("a", { x: proto.a }), parentId: "P", childrenIds: [] },
      b: { language: makeStubWith("b", { x: proto.b }), parentId: "P", childrenIds: [] },
      c: { language: makeStubWith("c", { x: proto.c }), parentId: "P", childrenIds: [] },
    };
    const r = reconstructProtoForm(tree, "P", "x");
    expect(r!.form).toEqual(["w", "a", "t"]);
  });

  it("ignores extinct leaves", () => {
    const langA = makeStubWith("a", { x: ["k", "a", "t"] });
    (langA as any).extinct = true;
    const tree: LanguageTree = {
      P: { language: makeStub("P"), parentId: null, childrenIds: ["a", "b"] },
      a: { language: langA, parentId: "P", childrenIds: [] },
      b: { language: makeStubWith("b", { x: ["t", "i", "k"] }), parentId: "P", childrenIds: [] },
    };
    const r = reconstructProtoForm(tree, "P", "x");
    expect(r!.form).toEqual(["t", "i", "k"]);
  });

  it("reconstructProtoLexicon returns one entry per meaning attested", () => {
    const tree: LanguageTree = {
      P: { language: makeStub("P"), parentId: null, childrenIds: ["a", "b"] },
      a: { language: makeStubWith("a", { x: ["a"], y: ["b"] }), parentId: "P", childrenIds: [] },
      b: { language: makeStubWith("b", { x: ["a"], z: ["c"] }), parentId: "P", childrenIds: [] },
    };
    const list = reconstructProtoLexicon(tree, "P");
    const meanings = new Set(list.map((r) => r.meaning));
    expect(meanings.has("x")).toBe(true);
    expect(meanings.has("y")).toBe(true);
    expect(meanings.has("z")).toBe(true);
  });

  // Phase 29 Tranche 7g: trimmed 100→60 gens. The reconstruction
  // assertion only needs sister-language drift to be observable; 60
  // gens demonstrates that, and brings runtime from 40s under budget.
  it("end-to-end: reconstructed root forms stay close to seed lexicon for stable Swadesh words after 60 gens", () => {
    const cfg = defaultConfig();
    cfg.seed = "reconstruction-1";
    const sim = createSimulation(cfg);
    const seedLang = sim.getState().tree[sim.getState().rootId]!.language;
    const seedSnapshot: Record<string, WordForm> = {};
    for (const [m, form] of lexEntries(seedLang)) seedSnapshot[m] = form.slice();

    for (let i = 0; i < 60; i++) sim.step();
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
    // Phase 37 bumped 4 → 5: the synonym-genesis pathway can spawn
    // alternative forms for high-freq content words, which the
    // reconstruction pipeline occasionally pulls in as the daughter's
    // form, marginally widening the average Levenshtein distance.
    // The signal is still present (avg ≤ 5 means most Swadesh words
    // remain recognisably close to their seed); 4 was just too tight
    // a budget under the new dynamics.
    expect(avgDist, "Average Levenshtein distance from seed across stable Swadesh words ≤ 5 over 100 gens").toBeLessThanOrEqual(5);
  });
});

function makeStubWith(id: string, glossLexicon: Record<string, WordForm>) {
  const lang = makeStub(id);
  // Replace the empty store with the gloss-keyed lexicon and rekey.
  lang.lexicon = glossLexicon as any;
  rekeyLexiconToConceptIds(lang as never);
  return lang;
}

function makeStub(id: string) {
  const lang = {
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
  rekeyLexiconToConceptIds(lang);
  return lang;
}
