import { describe, it, expect } from "vitest";
import { buildStemma, ruleDistance, stemmaMatrix } from "../analysis/stemma";
import type { Language, LanguageNode, LanguageTree } from "../types";
import type { GeneratedRule } from "../phonology/generated";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { DEFAULT_OT_RANKING } from "../phonology/ot";

function mockRule(tpl: string): GeneratedRule {
  return {
    id: `mock.${tpl}`,
    templateId: tpl,
    family: "lenition",
    description: tpl,
    birthGeneration: 0,
    lastFireGeneration: 0,
    strength: 0.5,
    from: { type: "consonant" },
    context: {},
    outputMap: {},
  };
}

function mockLang(id: string, templates: string[]): Language {
  return {
    id,
    name: id,
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: templates.map(mockRule),
    retiredRules: [],
    orthography: {},
    otRanking: DEFAULT_OT_RANKING.slice(),
    lastChangeGeneration: {},
  };
}

function mockTree(entries: Array<[string, string[]]>): LanguageTree {
  const tree: LanguageTree = {};
  for (const [id, templates] of entries) {
    const node: LanguageNode = {
      language: mockLang(id, templates),
      parentId: null,
      childrenIds: [],
    };
    tree[id] = node;
  }
  return tree;
}

describe("analysis/stemma", () => {
  it("ruleDistance is 0 for identical rule sets", () => {
    const a = mockLang("A", ["lenition.x", "vowel.y"]);
    const b = mockLang("B", ["vowel.y", "lenition.x"]);
    expect(ruleDistance(a, b)).toBe(0);
  });

  it("ruleDistance is 1 for disjoint rule sets", () => {
    const a = mockLang("A", ["x", "y"]);
    const b = mockLang("B", ["p", "q"]);
    expect(ruleDistance(a, b)).toBe(1);
  });

  it("ruleDistance is 0 when both sides are empty", () => {
    expect(ruleDistance(mockLang("A", []), mockLang("B", []))).toBe(0);
  });

  it("stemmaMatrix returns n*(n-1)/2 edges for n leaves", () => {
    const tree = mockTree([
      ["A", ["x"]],
      ["B", ["x", "y"]],
      ["C", ["y", "z"]],
      ["D", ["z"]],
    ]);
    const edges = stemmaMatrix(tree);
    expect(edges.length).toBe(6);
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i]!.distance).toBeGreaterThanOrEqual(edges[i - 1]!.distance);
    }
  });

  it("buildStemma clusters identical languages tightest", () => {
    const tree = mockTree([
      ["twinA", ["x", "y", "z"]],
      ["twinB", ["x", "y", "z"]],
      ["loner", ["a", "b", "c"]],
    ]);
    const root = buildStemma(tree);
    expect(root).not.toBeNull();
    if (!root) return;
    const hasTwinsSubtree = root.children.some(
      (c) =>
        c.children.length === 2 &&
        c.children.every((gc) => ["twinA", "twinB"].includes(gc.id)),
    );
    expect(hasTwinsSubtree).toBe(true);
  });
});
