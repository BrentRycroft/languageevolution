import { describe, it, expect } from "vitest";
import { VEC_DIM, VEC_SCALE, LEXICAL_DIMS, GRAMMATICAL_DIMS, zeroVec, fromFloats, toFloats } from "../vec";
import { sumVecs, dotFixed, distanceSq, cosineFixed } from "../vec";

describe("vec — fixed-point representation", () => {
  it("dimensionality is 50 lexical + 8 grammatical = 58", () => {
    expect(LEXICAL_DIMS).toBe(50);
    expect(GRAMMATICAL_DIMS).toBe(8);
    expect(VEC_DIM).toBe(58);
  });
  it("zeroVec is the full dimensionality, all zeros", () => {
    const z = zeroVec();
    expect(z.length).toBe(VEC_DIM);
    expect(Array.from(z).every((x) => x === 0)).toBe(true);
  });
  it("fromFloats quantizes into the lexical dims and leaves grammatical dims zero", () => {
    const v = fromFloats([1, -1, 0.5]);
    expect(v[0]).toBe(VEC_SCALE);
    expect(v[1]).toBe(-VEC_SCALE);
    expect(v[2]).toBe(Math.round(0.5 * VEC_SCALE));
    expect(v[VEC_DIM - 1]).toBe(0);
  });
  it("toFloats round-trips within quantization error", () => {
    const f = toFloats(fromFloats([0.123, -2.5, 3.14159]));
    expect(f[0]).toBeCloseTo(0.123, 3);
    expect(f[1]).toBeCloseTo(-2.5, 3);
    expect(f[2]).toBeCloseTo(3.14159, 3);
  });
});

describe("vec — integer arithmetic", () => {
  it("sumVecs adds componentwise (the additive composition operation)", () => {
    const s = sumVecs([fromFloats([1, 2, 3]), fromFloats([0.5, -1, 0])]);
    expect(s[0]).toBe(Math.round(1.5 * VEC_SCALE));
    expect(s[1]).toBe(Math.round(1 * VEC_SCALE));
    expect(s[2]).toBe(Math.round(3 * VEC_SCALE));
  });
  it("distanceSq is integer-exact: 0 for identical, positive otherwise", () => {
    const a = fromFloats([1, 2, 3]);
    expect(distanceSq(a, a)).toBe(0);
    expect(distanceSq(a, fromFloats([1, 2, 4]))).toBe(VEC_SCALE * VEC_SCALE);
  });
  it("dotFixed is integer-exact", () => {
    const a = fromFloats([1, 1]);
    const b = fromFloats([2, 3]);
    expect(dotFixed(a, b)).toBe(VEC_SCALE * (2 * VEC_SCALE) + VEC_SCALE * (3 * VEC_SCALE));
  });
  it("cosineFixed ~1 for parallel, ~0 for orthogonal (readout only)", () => {
    expect(cosineFixed(fromFloats([1, 0, 0]), fromFloats([3, 0, 0]))).toBeCloseTo(1, 5);
    expect(cosineFixed(fromFloats([1, 0, 0]), fromFloats([0, 1, 0]))).toBeCloseTo(0, 5);
  });
});
