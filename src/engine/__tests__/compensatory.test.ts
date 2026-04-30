import { describe, it, expect } from "vitest";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";

describe("compensatory lengthening rule", () => {
  const rule = CATALOG_BY_ID["compensatory.final_coda_lengthening"]!;

  it("is registered in the catalog", () => {
    expect(rule).toBeDefined();
  });

  it("lengthens the vowel when a final consonant is present", () => {
    const word = ["k", "a", "t"];
    const rng = makeRng("compensatory-1");
    const prob = rule.probabilityFor(word);
    expect(prob).toBeGreaterThan(0);
    const next = rule.apply(word, rng);
    expect(next).toEqual(["k", "aː"]);
  });

  it("refuses to fire when the last vowel is already long", () => {
    const word = ["k", "aː", "t"];
    expect(rule.probabilityFor(word)).toBe(0);
  });

  it("refuses to fire when the word doesn't end in a consonant", () => {
    expect(rule.probabilityFor(["k", "a"])).toBe(0);
  });

  it("refuses to fire when the penult is not a vowel", () => {
    expect(rule.probabilityFor(["s", "t", "r", "k"])).toBe(0);
  });
});
