import { describe, it, expect } from "vitest";
import { applyChangesToWord } from "../phonology/apply";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";

/**
 * Check age-grading: a word freshly changed (age 0) should be more likely
 * to be re-changed than one that's been stable for generations (age 20+).
 * We measure average fire rate across many trials at both extremes.
 */
describe("age-grading via agesSinceChange", () => {
  it("freshly-changed words mutate more often than stable ones", () => {
    const rule = CATALOG_BY_ID["lenition.p_to_f"]!;
    const trials = 400;
    const form = ["p", "a", "p"] as const;
    const makeOpts = (age: number) => ({
      globalRate: 1,
      weights: { [rule.id]: 1 },
      rateMultiplier: 1,
      frequencyHints: { test: 0.5 },
      agesSinceChange: { test: age },
    });
    let fresh = 0;
    let stable = 0;
    for (let i = 0; i < trials; i++) {
      const r1 = makeRng("fresh-" + i);
      const r2 = makeRng("stable-" + i);
      if (applyChangesToWord(form.slice(), [rule], r1, makeOpts(0), "test").join("") !== form.join(""))
        fresh++;
      if (applyChangesToWord(form.slice(), [rule], r2, makeOpts(30), "test").join("") !== form.join(""))
        stable++;
    }
    expect(fresh).toBeGreaterThan(stable);
  });
});
