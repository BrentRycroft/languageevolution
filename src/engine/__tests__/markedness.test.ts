import { describe, it, expect } from "vitest";
import { markednessOf, markednessDelta } from "../phonology/markedness";
import { applyChangesToWord, type ApplyOptions } from "../phonology/apply";
import type { SoundChange } from "../types";
import { makeRng } from "../rng";

/**
 * Phase 48 D4-B: markedness-asymmetry tests.
 *
 * Sound changes that introduce marked segments (clicks, implosives,
 * lateral fricatives, ejectives, glottal stop) should fire less
 * often than changes that introduce unmarked segments. Reflects
 * Greenberg / Jakobson / Maddieson typology — marked phonemes are
 * cross-linguistically rare AND diachronically prone to loss.
 */

describe("Phase 48 D4-B — markednessOf scores", () => {
  it("universal-core consonants have markedness 0", () => {
    expect(markednessOf("p")).toBe(0);
    expect(markednessOf("t")).toBe(0);
    expect(markednessOf("k")).toBe(0);
    expect(markednessOf("m")).toBe(0);
    expect(markednessOf("n")).toBe(0);
  });

  it("universal-core vowels have markedness ≤ 0.05", () => {
    expect(markednessOf("a")).toBeLessThanOrEqual(0.05);
    expect(markednessOf("i")).toBeLessThanOrEqual(0.05);
    expect(markednessOf("u")).toBeLessThanOrEqual(0.05);
  });

  it("clicks are very marked (≥ 0.9)", () => {
    expect(markednessOf("ǀ")).toBeGreaterThanOrEqual(0.9);
    expect(markednessOf("ǃ")).toBeGreaterThanOrEqual(0.9);
    expect(markednessOf("ǁ")).toBeGreaterThanOrEqual(0.9);
    expect(markednessOf("ʘ")).toBeGreaterThanOrEqual(0.9);
  });

  it("implosives are very marked (≥ 0.85)", () => {
    expect(markednessOf("ɓ")).toBeGreaterThanOrEqual(0.85);
    expect(markednessOf("ɗ")).toBeGreaterThanOrEqual(0.85);
    expect(markednessOf("ʄ")).toBeGreaterThanOrEqual(0.85);
    expect(markednessOf("ɠ")).toBeGreaterThanOrEqual(0.85);
    expect(markednessOf("ʛ")).toBeGreaterThanOrEqual(0.85);
  });

  it("lateral fricatives are very marked (≥ 0.85)", () => {
    expect(markednessOf("ɬ")).toBeGreaterThanOrEqual(0.85);
    expect(markednessOf("ɮ")).toBeGreaterThanOrEqual(0.85);
  });

  it("front rounded vowels (y, ø, œ) are marked (≥ 0.7)", () => {
    expect(markednessOf("y")).toBeGreaterThanOrEqual(0.7);
    expect(markednessOf("ø")).toBeGreaterThanOrEqual(0.7);
    expect(markednessOf("œ")).toBeGreaterThanOrEqual(0.7);
  });

  it("ejectives are very marked (≥ 0.8)", () => {
    expect(markednessOf("pʼ")).toBeGreaterThanOrEqual(0.8);
    expect(markednessOf("tʼ")).toBeGreaterThanOrEqual(0.8);
    expect(markednessOf("kʼ")).toBeGreaterThanOrEqual(0.8);
  });

  it("retroflex consonants are marked (≥ 0.7)", () => {
    expect(markednessOf("ʈ")).toBeGreaterThanOrEqual(0.7);
    expect(markednessOf("ɖ")).toBeGreaterThanOrEqual(0.7);
    expect(markednessOf("ʂ")).toBeGreaterThanOrEqual(0.7);
  });

  it("unknown phonemes get the default markedness", () => {
    expect(markednessOf("⨂")).toBe(0.2); // MARKEDNESS_DEFAULT
  });
});

describe("Phase 48 D4-B — markednessDelta", () => {
  it("removing a marked segment yields positive delta", () => {
    // ʔ → ∅ (marked glottal stop disappears)
    expect(markednessDelta(["ʔ", "a"], ["a"])).toBeGreaterThan(0);
  });

  it("introducing a marked segment yields negative delta", () => {
    // p → ɓ (unmarked stop becomes very marked implosive)
    expect(markednessDelta(["p"], ["ɓ"])).toBeLessThan(-0.5);
  });

  it("transforming an unmarked segment to another unmarked yields ~0", () => {
    // p → t (both markedness 0)
    expect(markednessDelta(["p"], ["t"])).toBe(0);
  });

  it("p → k with surrounding context preserves delta", () => {
    expect(markednessDelta(["a", "p", "a"], ["a", "k", "a"])).toBe(0);
  });
});

describe("Phase 48 D4-B — markedness bias inhibits marked output", () => {
  function alwaysFiringRule(
    from: string,
    to: string,
    id = "test:marked",
  ): SoundChange {
    return {
      id,
      kind: "test",
      apply: (form: string[]) => form.map((p: string) => (p === from ? to : p)),
      probabilityFor: () => 1.0,
    } as unknown as SoundChange;
  }

  it("p → ɓ (introduces a very marked implosive) is inhibited", () => {
    let applied = 0;
    let suppressed = 0;
    for (let trial = 0; trial < 100; trial++) {
      const rng = makeRng(`marked-${trial}`);
      const opts: ApplyOptions = { globalRate: 1, weights: {} };
      const result = applyChangesToWord(
        ["p", "a"],
        [alwaysFiringRule("p", "ɓ")],
        rng,
        opts,
        "test-meaning",
      );
      if (result.includes("ɓ")) applied++;
      else suppressed++;
    }
    // Markedness gain × delta of ~-0.85 caps at 0.85 reject rate.
    // ~85% should be suppressed.
    expect(suppressed).toBeGreaterThan(60);
  });

  it("p → t (both unmarked) fires nearly every time", () => {
    let applied = 0;
    for (let trial = 0; trial < 100; trial++) {
      const rng = makeRng(`unmarked-${trial}`);
      const opts: ApplyOptions = { globalRate: 1, weights: {} };
      const result = applyChangesToWord(
        ["p", "a"],
        [alwaysFiringRule("p", "t")],
        rng,
        opts,
        "test-meaning",
      );
      if (result.includes("t")) applied++;
    }
    expect(applied).toBeGreaterThan(90);
  });

  it("ɓ → p (eliminates a marked segment) fires nearly every time", () => {
    let applied = 0;
    for (let trial = 0; trial < 100; trial++) {
      const rng = makeRng(`elim-${trial}`);
      const opts: ApplyOptions = { globalRate: 1, weights: {} };
      const result = applyChangesToWord(
        ["ɓ", "a"],
        [alwaysFiringRule("ɓ", "p")],
        rng,
        opts,
        "test-meaning",
      );
      if (result.includes("p") && !result.includes("ɓ")) applied++;
    }
    expect(applied).toBeGreaterThan(90);
  });

  it("respects markednessBias: false (back-compat replay)", () => {
    let applied = 0;
    for (let trial = 0; trial < 100; trial++) {
      const rng = makeRng(`flag-off-${trial}`);
      const opts: ApplyOptions = {
        globalRate: 1,
        weights: {},
        markednessBias: false,
      };
      const result = applyChangesToWord(
        ["p", "a"],
        [alwaysFiringRule("p", "ɓ")],
        rng,
        opts,
        "test-meaning",
      );
      if (result.includes("ɓ")) applied++;
    }
    expect(applied).toBeGreaterThan(90);
  });
});
