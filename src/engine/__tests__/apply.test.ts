import { describe, it, expect } from "vitest";
import { CATALOG, CATALOG_BY_ID } from "../phonology/catalog";
import { applyChangesToWord } from "../phonology/apply";
import { makeRng } from "../rng";
import type { WordForm } from "../types";

/**
 * apply.test.ts
 *
 * Test suite for: "sound changes".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

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

  // Phase 74 (perf): the hot loop skips a rule when none of its `triggers`
  // are present, ASSUMING that implies probabilityFor === 0. This locks
  // that contract: every rule declaring triggers must genuinely yield 0
  // probability for a word containing none of them — otherwise the
  // pre-filter would silently drop real sound changes (non-byte-identical).
  it("declared triggers are a true necessary condition (probability 0 when all absent)", () => {
    const FILLERS = [
      "a", "i", "u", "e", "o", "p", "t", "k", "b", "d", "g", "m", "n", "s",
      "l", "r", "w", "j", "h", "f", "z", "x", "q",
    ];
    let checked = 0;
    for (const rule of CATALOG) {
      if (!rule.triggers || rule.triggers.length === 0) continue;
      const trig = new Set<string>(rule.triggers);
      const filler = FILLERS.find((f) => !trig.has(f));
      expect(filler, `no trigger-free filler for ${rule.id}`).toBeDefined();
      const word: WordForm = [filler!, filler!, filler!];
      expect(
        rule.probabilityFor(word),
        `${rule.id}: triggers must imply probability 0 when none present`,
      ).toBe(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
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
