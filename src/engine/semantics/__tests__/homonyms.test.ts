import { describe, it, expect } from "vitest";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import { tSet as lexSet } from "../../lexicon/__tests__/glossSeam";
import { homonymsOf } from "../homonyms";

function freshEnglish() {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("homonyms — homonymsOf", () => {
  it("two distant meanings sharing a form ARE homonyms (big/small are antonyms → far apart)", () => {
    const l = freshEnglish();
    lexSet(l, "big", ["k", "u", "x"]);
    lexSet(l, "small", ["k", "u", "x"]);
    expect(homonymsOf(l, "big")).toContain("small");
    expect(homonymsOf(l, "small")).toContain("big");
  });
  it("two NEAR meanings sharing a form are NOT homonyms — that's polysemy (dog/cat are close)", () => {
    const l = freshEnglish();
    lexSet(l, "dog", ["m", "o", "z"]);
    lexSet(l, "cat", ["m", "o", "z"]);
    expect(homonymsOf(l, "dog")).not.toContain("cat");
  });
  it("a unique form has no homonyms", () => {
    const l = freshEnglish();
    lexSet(l, "water", ["w", "a", "q", "ʒ", "x", "z"]);
    expect(homonymsOf(l, "water")).toEqual([]);
  });
});
