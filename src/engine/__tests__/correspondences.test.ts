import { describe, it, expect } from "vitest";
import {
  buildCorrespondenceMatrix,
  correspondenceRegularity,
  scoreMeaningCorrespondence,
} from "../tree/correspondences";
import type { Language, LanguageNode, LanguageTree } from "../types";

function leaf(id: string, lex: Record<string, string[]>): LanguageNode {
  const lang: Language = {
    id,
    name: id,
    lexicon: lex,
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO",
      affixPosition: "suffix",
      pluralMarking: "none",
      tenseMarking: "none",
      hasCase: false,
      genderCount: 0,
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
  return { language: lang, parentId: "P", childrenIds: [] };
}

describe("sound-correspondence matrix", () => {
  it("captures p ↔ f correspondence as regular when 3 of 3 cognates show it", () => {
    const tree: LanguageTree = {
      P: { language: {} as Language, parentId: null, childrenIds: ["A", "B"] },
      A: leaf("A", {
        father: ["p", "a", "t"],
        five: ["p", "i", "v"],
        full: ["p", "u", "l"],
      }),
      B: leaf("B", {
        father: ["f", "a", "t"],
        five: ["f", "i", "v"],
        full: ["f", "u", "l"],
      }),
    };
    const m = buildCorrespondenceMatrix(tree, "A", "B");
    const reg = correspondenceRegularity(m, "p", "f");
    expect(reg).toBe(1);
    expect(m.pairs.get("p")?.get("f")).toBe(3);
  });

  it("treats sporadic correspondences as low-regularity", () => {
    const tree: LanguageTree = {
      P: { language: {} as Language, parentId: null, childrenIds: ["A", "B"] },
      A: leaf("A", {
        a: ["p", "a"],
        b: ["p", "i"],
        c: ["p", "u"],
        d: ["p", "e"],
      }),
      B: leaf("B", {
        a: ["f", "a"],
        b: ["f", "i"],
        c: ["b", "u"], // sporadic
        d: ["b", "e"], // sporadic
      }),
    };
    const m = buildCorrespondenceMatrix(tree, "A", "B");
    expect(correspondenceRegularity(m, "p", "f")).toBe(0.5);
    expect(correspondenceRegularity(m, "p", "b")).toBe(0.5);
  });

  it("scoreMeaningCorrespondence flags each column with its regularity", () => {
    const tree: LanguageTree = {
      P: { language: {} as Language, parentId: null, childrenIds: ["A", "B"] },
      A: leaf("A", {
        father: ["p", "a", "t"],
        five: ["p", "i", "v"],
      }),
      B: leaf("B", {
        father: ["f", "a", "t"],
        five: ["f", "i", "v"],
      }),
    };
    const m = buildCorrespondenceMatrix(tree, "A", "B");
    const scored = scoreMeaningCorrespondence(
      m,
      ["p", "a", "t"],
      ["f", "a", "t"],
    );
    expect(scored).toHaveLength(3);
    expect(scored[0]!.segA).toBe("p");
    expect(scored[0]!.segB).toBe("f");
    expect(scored[0]!.regularity).toBe(1);
    expect(scored[1]!.regularity).toBe(1); // a ↔ a
    expect(scored[2]!.regularity).toBe(1); // t ↔ t
  });

  it("returns 0 regularity for an unseen segment", () => {
    const tree: LanguageTree = {
      P: { language: {} as Language, parentId: null, childrenIds: ["A", "B"] },
      A: leaf("A", { a: ["p", "a"] }),
      B: leaf("B", { a: ["f", "a"] }),
    };
    const m = buildCorrespondenceMatrix(tree, "A", "B");
    expect(correspondenceRegularity(m, "z", "y")).toBe(0);
  });
});
