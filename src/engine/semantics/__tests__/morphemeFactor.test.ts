import { describe, it, expect } from "vitest";
import { fromFloats, distanceSq, subVecs, sumVecs, roundDivVec } from "../vec";
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
    const teach = fromFloats([1, 0, 0]);
    const bake = fromFloats([2, 0, 0]);
    const teacherAnchor = fromFloats([1, 0.5, 0]);
    const bakerAnchor = fromFloats([2, 0.3, 0]);
    const roots = new Map([
      ["teach", teach],
      ["bake", bake],
    ]);
    const decomps: Decomp[] = [
      { word: "teacher", wordAnchor: teacherAnchor, parts: ["teach", "-er"] },
      { word: "baker", wordAnchor: bakerAnchor, parts: ["bake", "-er"] },
    ];
    const { morphemes, wordPoints } = factorizeMorphemes({ roots, affixIds: new Set(["-er"]), decomps });
    // The affix is the rounded mean of the two residuals. Compute the expectation with the
    // SAME quantized arithmetic the solver uses (sum the already-quantized residuals, then
    // round-divide) — NOT by re-quantizing the float 0.4, which differs by one fixed-point
    // unit (round(3277/2)=1639 vs round(0.4*4096)=1638).
    const expectedAffix = roundDivVec(
      sumVecs([subVecs(teacherAnchor, teach), subVecs(bakerAnchor, bake)]),
      2,
    );
    expect(Array.from(morphemes.get("-er")!)).toEqual(Array.from(expectedAffix));
    // Composition invariant: the word point IS teach + affix.
    expect(Array.from(wordPoints.get("teacher")!)).toEqual(Array.from(sumVecs([teach, expectedAffix])));
    // Reconstruction vs the word's own anchor is nonzero — the least-squares residual.
    expect(distanceSq(wordPoints.get("teacher")!, teacherAnchor)).toBeGreaterThan(0);
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
