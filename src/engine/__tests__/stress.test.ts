import { describe, it, expect } from "vitest";
import {
  penultimateStressIndex,
  stressClass,
  stressSensitivity,
  UNSTRESSED_REDUCTION,
} from "../phonology/stress";
import { makeRng } from "../rng";

describe("stress placement + sensitivity", () => {
  it("single-vowel word is stressed on that vowel", () => {
    expect(penultimateStressIndex(["d", "o"])).toBe(1);
  });

  it("multi-syllable word is stressed on penultimate vowel", () => {
    // v a t e r → vowels at 1, 3 → penultimate is index 1
    const form = ["v", "a", "t", "e", "r"];
    expect(penultimateStressIndex(form)).toBe(1);
  });

  it("unstressed vowels are the most mutation-prone", () => {
    const form = ["w", "a", "t", "e", "r"];
    expect(stressClass(form, 1)).toBe("stressed");
    expect(stressClass(form, 3)).toBe("unstressed");
    expect(stressSensitivity(form, 1)).toBeLessThan(stressSensitivity(form, 3));
  });
});

describe("unstressed reduction rule", () => {
  it("reduces an unstressed vowel to schwa", () => {
    const rng = makeRng("reduce");
    const form = ["w", "a", "t", "e", "r"];
    const out = UNSTRESSED_REDUCTION.apply(form, rng);
    // The final vowel (unstressed) should become schwa.
    expect(out).toContain("ə");
  });

  it("does not target stressed vowels", () => {
    const form = ["p", "a"];
    // Only one vowel, which is stressed, so probability should be 0.
    expect(UNSTRESSED_REDUCTION.probabilityFor(form)).toBe(0);
  });
});
