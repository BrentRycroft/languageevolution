import { describe, it, expect } from "vitest";
import { ANCHORS, nearestAnchor, anchorsWithin, kNearestAnchors, glossOf } from "../anchors";
import { fromFloats } from "../vec";
import { embed } from "../embeddings";
import { CONCEPT_IDS } from "../../lexicon/concepts";

describe("anchors — the fixed English-concept coordinate system", () => {
  it("covers exactly the registered concept inventory (deterministic)", () => {
    // G1: the anchor-coverage extras are now UNIONED into CONCEPT_IDS (the
    // embedding vocabulary), so ANCHORS covers exactly CONCEPT_IDS — one anchor
    // per registered concept (extras included, not added on top).
    expect(ANCHORS.length).toBe(CONCEPT_IDS.length);
    const set = new Set(ANCHORS.map((a) => a.concept));
    for (const c of CONCEPT_IDS) expect(set.has(c)).toBe(true);
  });

  it("the anchor-coverage extras give basic content words real anchors (no longer hash noise)", () => {
    // house/body/door were orphans glossing to noise; now they anchor to themselves.
    for (const w of ["house", "body", "door", "person", "time"] as const) {
      expect(glossOf(fromFloats(embed(w)))).toBe(w);
    }
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
