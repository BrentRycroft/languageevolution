import { describe, it, expect } from "vitest";
import { splitLeaf, leafIds } from "../tree/split";
import type { Language, LanguageNode, LanguageTree } from "../types";
import { makeRng } from "../rng";
import { DEFAULT_LEXICON } from "../lexicon/defaults";

function makeTree(): LanguageTree {
  const lang: Language = {
    id: "L-0",
    name: "Proto",
    lexicon: Object.fromEntries(
      Object.entries(DEFAULT_LEXICON).map(([k, v]) => [k, v.slice()]),
    ),
    enabledChangeIds: ["lenition.p_to_f", "lenition.t_to_theta"],
    changeWeights: { "lenition.p_to_f": 1, "lenition.t_to_theta": 1 },
    birthGeneration: 0,
  };
  const root: LanguageNode = {
    language: lang,
    parentId: null,
    childrenIds: [],
  };
  return { "L-0": root };
}

describe("tree split", () => {
  it("splitting a leaf creates two new leaves and makes parent internal", () => {
    const tree = makeTree();
    const rng = makeRng("x");
    const leavesBefore = leafIds(tree);
    expect(leavesBefore).toEqual(["L-0"]);
    const [a, b] = splitLeaf(tree, "L-0", 10, rng);
    expect(a).not.toBe(b);
    expect(tree[a]!.parentId).toBe("L-0");
    expect(tree[b]!.parentId).toBe("L-0");
    expect(tree["L-0"]!.childrenIds).toEqual([a, b]);
    const leavesAfter = leafIds(tree);
    expect(leavesAfter.sort()).toEqual([a, b].sort());
  });

  it("child lexicons are deep copies", () => {
    const tree = makeTree();
    const rng = makeRng("x");
    const [a, b] = splitLeaf(tree, "L-0", 1, rng);
    tree[a]!.language.lexicon["water"] = ["X"];
    expect(tree[b]!.language.lexicon["water"]).not.toEqual(["X"]);
    expect(tree["L-0"]!.language.lexicon["water"]).not.toEqual(["X"]);
  });

  it("one child's change set is perturbed from the parent's", () => {
    const tree = makeTree();
    const rng = makeRng("perturb-test");
    const [a, b] = splitLeaf(tree, "L-0", 1, rng);
    const parentSet = new Set(tree["L-0"]!.language.enabledChangeIds);
    const aSet = new Set(tree[a]!.language.enabledChangeIds);
    const bSet = new Set(tree[b]!.language.enabledChangeIds);
    const aMatches =
      aSet.size === parentSet.size &&
      Array.from(aSet).every((v) => parentSet.has(v));
    const bMatches =
      bSet.size === parentSet.size &&
      Array.from(bSet).every((v) => parentSet.has(v));
    // At least one child should differ from the parent.
    expect(aMatches && bMatches).toBe(false);
  });
});
