import { describe, it, expect } from "vitest";
import { splitLeaf, leafIds } from "../tree/split";
import type { Language, LanguageNode, LanguageTree } from "../types";
import { makeRng } from "../rng";
import { DEFAULT_LEXICON } from "../lexicon/defaults";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { tForm as lexGet, tSet as lexSet } from "../lexicon/__tests__/glossSeam";

/**
 * split.test.ts
 *
 * Test suite for: "tree split".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function makeTree(): LanguageTree {
  const lang: Language = {
    id: "L-0",
    name: "Proto",
    lexemes: {},
    enabledChangeIds: ["lenition.p_to_f", "lenition.t_to_theta"],
    changeWeights: { "lenition.p_to_f": 1, "lenition.t_to_theta": 1 },
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    orthography: {}, otRanking: [], lastChangeGeneration: {},
  };
  for (const [gloss, form] of Object.entries(DEFAULT_LEXICON as Record<string, string[]>)) {
    lexSet(lang, gloss, form.slice());
  }
  const root: LanguageNode = {
    language: lang,
    parentId: null,
    childrenIds: [],
  };
  return { "L-0": root };
}

describe("tree split", () => {
  it("splitting a leaf creates new leaves and makes parent internal", () => {
    const tree = makeTree();
    const rng = makeRng("x");
    const leavesBefore = leafIds(tree);
    expect(leavesBefore).toEqual(["L-0"]);
    const children = splitLeaf(tree, "L-0", 10, rng);
    expect(children.length).toBeGreaterThanOrEqual(2);
    expect(new Set(children).size).toBe(children.length);
    for (const c of children) {
      expect(tree[c]!.parentId).toBe("L-0");
    }
    expect(tree["L-0"]!.childrenIds).toEqual(children);
    const leavesAfter = leafIds(tree);
    expect(leavesAfter.sort()).toEqual(children.slice().sort());
  });

  it("child count is bounded in [2, 9]", () => {
    for (let i = 0; i < 40; i++) {
      const tree = makeTree();
      const rng = makeRng("n-" + i);
      const children = splitLeaf(tree, "L-0", 1, rng);
      expect(children.length).toBeGreaterThanOrEqual(2);
      expect(children.length).toBeLessThanOrEqual(9);
    }
  });

  it("child lexicons are deep copies", () => {
    const tree = makeTree();
    const rng = makeRng("x");
    const children = splitLeaf(tree, "L-0", 1, rng);
    const a = children[0]!;
    const b = children[1]!;
    lexSet(tree[a]!.language, "water", ["X"]);
    expect(lexGet(tree[b]!.language, "water")).not.toEqual(["X"]);
    expect(lexGet(tree["L-0"]!.language, "water")).not.toEqual(["X"]);
  });

  it("at least one child's change set differs from the parent's", () => {
    const tree = makeTree();
    const rng = makeRng("perturb-test");
    const children = splitLeaf(tree, "L-0", 1, rng);
    const parentSet = new Set(tree["L-0"]!.language.enabledChangeIds);
    const allMatch = children.every((c) => {
      const cSet = new Set(tree[c]!.language.enabledChangeIds);
      return (
        cSet.size === parentSet.size &&
        Array.from(cSet).every((v) => parentSet.has(v))
      );
    });
    expect(allMatch).toBe(false);
  });
});
