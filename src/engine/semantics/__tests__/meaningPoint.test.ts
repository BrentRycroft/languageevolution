import { describe, it, expect } from "vitest";
import { lexPoint, sensePoint, senseSpread, DEFAULT_SPREAD } from "../meaningPoint";
import { fromFloats } from "../vec";
import { embed } from "../embeddings";
import { loadMorphemeSpace } from "../morphemeSpaceLoader";
import type { WordSense } from "../../types";

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

describe("meaningPoint — per-lexeme sensePoint / senseSpread", () => {
  const base = { weight: 1, bornGeneration: 0 } as const;
  it("sensePoint falls back to the meaning's static point when the sense hasn't glided", () => {
    const s: WordSense = { meaning: "water", ...base };
    expect(Array.from(sensePoint(s))).toEqual(Array.from(lexPoint("water")));
  });
  it("sensePoint uses the sense's own point once it has glided", () => {
    const moved = Array.from(lexPoint("fire"));
    const s: WordSense = { meaning: "water", point: moved, ...base };
    expect(Array.from(sensePoint(s))).toEqual(moved);
  });
  it("senseSpread defaults when unset, else returns the stored spread", () => {
    expect(senseSpread({ meaning: "x", ...base })).toBe(DEFAULT_SPREAD);
    expect(senseSpread({ meaning: "x", spread: 0.5, ...base })).toBe(0.5);
  });
});
