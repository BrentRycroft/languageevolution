import { describe, it, expect } from "vitest";
import { fromFloats, distanceSq } from "../vec";
import { factorizeMorphemes, type Decomp } from "../morphemeFactor";

describe("morphemeFactor — factorizeMorphemes", () => {
  it("a single-occurrence affix is solved exactly (residual reconstructs the anchor)", () => {
    const roots = new Map([["hind", fromFloats([1, 0, 0])]]);
    const decomps: Decomp[] = [
      { word: "behind", wordAnchor: fromFloats([1, 0.5, 0]), parts: ["hind", "be-"] },
    ];
    const { morphemes, wordPoints } = factorizeMorphemes({ roots, affixIds: new Set(["be-"]), decomps });
    expect(Array.from(morphemes.get("be-")!)).toEqual(Array.from(fromFloats([0, 0.5, 0])));
    expect(distanceSq(wordPoints.get("behind")!, fromFloats([1, 0.5, 0]))).toBe(0);
  });
  it("a multi-occurrence affix is the rounded mean of its residuals (least-squares)", () => {
    const roots = new Map([
      ["teach", fromFloats([1, 0, 0])],
      ["bake", fromFloats([2, 0, 0])],
    ]);
    const decomps: Decomp[] = [
      { word: "teacher", wordAnchor: fromFloats([1, 0.5, 0]), parts: ["teach", "-er"] },
      { word: "baker", wordAnchor: fromFloats([2, 0.3, 0]), parts: ["bake", "-er"] },
    ];
    const { morphemes, wordPoints } = factorizeMorphemes({ roots, affixIds: new Set(["-er"]), decomps });
    expect(Array.from(morphemes.get("-er")!)).toEqual(Array.from(fromFloats([0, 0.4, 0])));
    expect(distanceSq(wordPoints.get("teacher")!, fromFloats([1, 0.4, 0]))).toBe(0);
    expect(distanceSq(wordPoints.get("teacher")!, fromFloats([1, 0.5, 0]))).toBeGreaterThan(0);
  });
  it("pure compounds (all roots) compose with no affix to solve", () => {
    const roots = new Map([
      ["day", fromFloats([1, 0, 0])],
      ["light", fromFloats([0, 1, 0])],
    ]);
    const decomps: Decomp[] = [
      { word: "daylight", wordAnchor: fromFloats([9, 9, 9]), parts: ["day", "light"] },
    ];
    const { wordPoints } = factorizeMorphemes({ roots, affixIds: new Set(), decomps });
    expect(Array.from(wordPoints.get("daylight")!)).toEqual(Array.from(fromFloats([1, 1, 0])));
  });
  it("throws on an unknown root or stacked affixes (v1 limits)", () => {
    expect(() =>
      factorizeMorphemes({
        roots: new Map(),
        affixIds: new Set(["-er"]),
        decomps: [{ word: "x", wordAnchor: fromFloats([0]), parts: ["missing", "-er"] }],
      }),
    ).toThrow(/no anchor/);
    expect(() =>
      factorizeMorphemes({
        roots: new Map([["r", fromFloats([1])]]),
        affixIds: new Set(["-a", "-b"]),
        decomps: [{ word: "x", wordAnchor: fromFloats([1]), parts: ["r", "-a", "-b"] }],
      }),
    ).toThrow(/stacks/);
  });
});
