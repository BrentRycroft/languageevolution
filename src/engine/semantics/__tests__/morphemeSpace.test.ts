import { describe, it, expect } from "vitest";
import { fromFloats } from "../vec";
import { compose, compositionError, nearestComposition, type Morpheme } from "../morphemeSpace";

describe("morphemeSpace — additive composition", () => {
  it("compose sums morpheme points (teacher = teach + -er offset)", () => {
    const teach = fromFloats([1, 0, 0]);
    const er = fromFloats([0, 0.2, 0]);
    expect(Array.from(compose([teach, er]))).toEqual(Array.from(fromFloats([1, 0.2, 0])));
  });
  it("compositionError is zero when the point equals its composition (the invariant)", () => {
    const fire = fromFloats([2, 1, 0]);
    const water = fromFloats([1, 2, 0]);
    expect(compositionError(compose([fire, water]), [fire, water])).toBe(0);
  });
  it("compositionError is positive when the point drifts from the composition", () => {
    const fire = fromFloats([2, 1, 0]);
    const water = fromFloats([1, 2, 0]);
    expect(compositionError(fromFloats([5, 5, 0]), [fire, water])).toBeGreaterThan(0);
  });
  it("a Morpheme carries id/form/point/type", () => {
    const m: Morpheme = { id: "fire", form: ["f", "a", "j", "ə"], point: fromFloats([2, 0, 0]), type: "root" };
    expect(m.type).toBe("root");
    expect(m.point.length).toBe(58);
  });
});

function morph(id: string, floats: number[]): Morpheme {
  return { id, form: [], point: fromFloats(floats), type: "root" };
}

describe("morphemeSpace — nearestComposition (gap-filler used by Track B)", () => {
  const inventory: Morpheme[] = [
    morph("fire", [2, 0, 0]),
    morph("water", [0, 2, 0]),
    morph("big", [0, 0, 2]),
    morph("small", [0, 0, -2]),
  ];
  it("finds the single morpheme nearest a target", () => {
    const got = nearestComposition(fromFloats([1.9, 0, 0]), inventory, 1, "s");
    expect(got.map((m) => m.id)).toEqual(["fire"]);
  });
  it("composes two morphemes to reach a combined target", () => {
    const got = nearestComposition(fromFloats([2, 2, 0]), inventory, 2, "s");
    expect(got.map((m) => m.id).sort()).toEqual(["fire", "water"]);
  });
  it("stops adding morphemes once none improves the fit", () => {
    const got = nearestComposition(fromFloats([2, 0, 0]), inventory, 3, "s");
    expect(got.map((m) => m.id)).toEqual(["fire"]);
  });
  it("is deterministic under a fixed seed", () => {
    const a = nearestComposition(fromFloats([2, 2, 0]), inventory, 2, "seed-1").map((m) => m.id);
    const b = nearestComposition(fromFloats([2, 2, 0]), inventory, 2, "seed-1").map((m) => m.id);
    expect(a).toEqual(b);
  });
});
