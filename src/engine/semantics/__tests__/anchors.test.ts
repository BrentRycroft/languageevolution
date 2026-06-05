import { describe, it, expect } from "vitest";
import { ANCHORS, nearestAnchor, anchorsWithin, kNearestAnchors } from "../anchors";
import { fromFloats } from "../vec";
import { embed } from "../embeddings";
import { CONCEPT_IDS } from "../../lexicon/concepts";

describe("anchors — the fixed English-concept coordinate system", () => {
  it("has exactly one anchor per registered concept, in sorted (deterministic) order", () => {
    expect(ANCHORS.length).toBe(CONCEPT_IDS.length);
    expect(ANCHORS.map((a) => a.concept)).toEqual([...CONCEPT_IDS]);
  });

  it("each anchor's point is the concept's quantized GloVe anchor (EMBED_TABLE/hash)", () => {
    for (const c of ["water", "fire", "dog"] as const) {
      const a = ANCHORS.find((x) => x.concept === c)!;
      expect(Array.from(a.point)).toEqual(Array.from(fromFloats(embed(c))));
    }
  });
});

describe("anchors — nearestAnchor", () => {
  it("an anchor's own point is nearest to itself", () => {
    for (const c of ["water", "fire", "stone", "tree"] as const) {
      const p = fromFloats(embed(c));
      expect(nearestAnchor(p).concept).toBe(c);
    }
  });

  it("is deterministic — same point yields the same anchor", () => {
    const p = fromFloats(embed("river"));
    expect(nearestAnchor(p).concept).toBe(nearestAnchor(p).concept);
  });
});

describe("anchors — anchorsWithin", () => {
  it("radius 0 returns only the exact-coincident anchor(s)", () => {
    const p = fromFloats(embed("water"));
    const within = anchorsWithin(p, 0);
    expect(within.map((a) => a.concept)).toContain("water");
    // every returned anchor sits exactly at p
    for (const a of within) expect(Array.from(a.point)).toEqual(Array.from(p));
  });

  it("results are sorted nearest-first and grow with the radius", () => {
    const p = fromFloats(embed("water"));
    const small = anchorsWithin(p, 4096);
    const big = anchorsWithin(p, 16384);
    expect(big.length).toBeGreaterThanOrEqual(small.length);
    // sorted nearest-first: first entry is the coincident one
    expect(small[0]!.concept).toBe("water");
  });
});

describe("anchors — kNearestAnchors", () => {
  it("k=1 agrees with nearestAnchor", () => {
    const p = fromFloats(embed("mountain"));
    expect(kNearestAnchors(p, 1)[0]!.concept).toBe(nearestAnchor(p).concept);
  });

  it("returns exactly k anchors, sorted nearest-first", () => {
    const p = fromFloats(embed("fire"));
    const k = kNearestAnchors(p, 5);
    expect(k.length).toBe(5);
    expect(k[0]!.concept).toBe("fire");
  });
});
