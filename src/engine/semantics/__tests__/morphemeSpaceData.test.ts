import { describe, it, expect } from "vitest";
import { MORPHEME_SPACE } from "../morphemeSpaceData";
import { loadMorphemeSpace } from "../morphemeSpaceLoader";
import { morphemeBreakdown } from "../morphemeSpaceLoader";
import { embed } from "../embeddings";
import { fromFloats, distanceSq, sumVecs } from "../vec";

describe("morphemeSpaceData — baked artifact", () => {
  it("morpheme ids are sorted (deterministic bake)", () => {
    const ids = MORPHEME_SPACE.morphemes.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
  });
  it("the composition invariant holds on the BAKED data (word point == Σ part points)", () => {
    const { morphemes, wordPoints } = loadMorphemeSpace();
    const byId = new Map(morphemes.map((m) => [m.id, m.point]));
    for (const w of MORPHEME_SPACE.words) {
      const composed = sumVecs(w.parts.map((p) => byId.get(p)!));
      expect(distanceSq(wordPoints.get(w.meaning)!, composed), w.meaning).toBe(0);
    }
  });
  it("behind reconstructs its GloVe anchor exactly (single-occurrence be-)", () => {
    const { wordPoints } = loadMorphemeSpace();
    expect(distanceSq(wordPoints.get("behind")!, fromFloats(embed("behind")))).toBe(0);
  });
  it("affix morphemes carry prefix/suffix types, roots carry root", () => {
    const byId = new Map(MORPHEME_SPACE.morphemes.map((m) => [m.id, m.type]));
    expect(byId.get("be-")).toBe("prefix");
    expect(byId.get("-er.agt")).toBe("suffix");
    expect(byId.get("day")).toBe("root");
  });
});

describe("morphemeSpaceLoader — morphemeBreakdown", () => {
  it("returns the ordered parts for a decomposed word", () => {
    expect(morphemeBreakdown("behind")).toEqual(["hind", "be-"]);
    expect(morphemeBreakdown("daylight")).toEqual(["day", "light"]);
  });
  it("returns null for a non-decomposed word (a root or unseen meaning)", () => {
    expect(morphemeBreakdown("water")).toBeNull();
    expect(morphemeBreakdown("zzz-not-a-word")).toBeNull();
  });
});
