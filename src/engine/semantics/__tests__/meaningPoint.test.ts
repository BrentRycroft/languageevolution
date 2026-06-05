import { describe, it, expect } from "vitest";
import { lexPoint } from "../meaningPoint";
import { fromFloats } from "../vec";
import { embed } from "../embeddings";
import { loadMorphemeSpace } from "../morphemeSpaceLoader";

describe("meaningPoint — lexPoint", () => {
  it("a decomposed word sits at its baked morpheme composition", () => {
    const behind = loadMorphemeSpace().wordPoints.get("behind")!;
    expect(Array.from(lexPoint("behind"))).toEqual(Array.from(behind));
  });
  it("a non-decomposed word sits at its quantized GloVe anchor", () => {
    expect(Array.from(lexPoint("water"))).toEqual(Array.from(fromFloats(embed("water"))));
  });
  it("behind's composition reconstructs its anchor (single-occurrence be-)", () => {
    expect(Array.from(lexPoint("behind"))).toEqual(Array.from(fromFloats(embed("behind"))));
  });
  it("is cached — same reference on repeat", () => {
    expect(lexPoint("water")).toBe(lexPoint("water"));
  });
});
