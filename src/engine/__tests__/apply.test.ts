import { describe, it, expect } from "vitest";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { applyChangesToWord } from "../phonology/apply";
import { makeRng } from "../rng";
import type { WordForm } from "../types";

describe("sound changes", () => {
  it("p → f applies to words containing p", () => {
    const change = CATALOG_BY_ID["lenition.p_to_f"]!;
    const rng = makeRng("test");
    const word: WordForm = ["p", "a", "p"];
    const out = change.apply(word, rng);
    const changedCount = out.filter((p, i) => p !== word[i]).length;
    expect(changedCount).toBe(1);
    expect(out.some((p) => p === "f")).toBe(true);
  });

  it("probability is 0 when no p present", () => {
    const change = CATALOG_BY_ID["lenition.p_to_f"]!;
    expect(change.probabilityFor(["a", "t", "e"])).toBe(0);
  });

  it("p → f with forced probability via applyChangesToWord", () => {
    const change = CATALOG_BY_ID["lenition.p_to_f"]!;
    const rng = makeRng("test2");
    const out = applyChangesToWord(["p", "a"], [change], rng, {
      globalRate: 10,
      weights: { [change.id]: 10 },
    });
    expect(out[0]).toBe("f");
  });

  it("k → h /_V only fires when followed by vowel", () => {
    const change = CATALOG_BY_ID["lenition.k_to_h_before_V"]!;
    expect(change.probabilityFor(["k", "a"])).toBeGreaterThan(0);
    expect(change.probabilityFor(["a", "k"])).toBe(0);
    expect(change.probabilityFor(["a", "k", "t"])).toBe(0);
  });

  it("final vowel deletion requires word length >= 3", () => {
    const change = CATALOG_BY_ID["deletion.final_vowel"]!;
    expect(change.probabilityFor(["a", "t"])).toBe(0);
    expect(change.probabilityFor(["a", "t", "e"])).toBeGreaterThan(0);
  });
});
