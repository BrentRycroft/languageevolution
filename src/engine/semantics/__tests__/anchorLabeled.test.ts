import { describe, it, expect } from "vitest";
import {
  labeledDimsFor,
  anchorPointFull,
  LABELED_DIMS,
  L_POS_NOUN,
  L_POS_VERB,
  L_POS_ADJ,
  L_POS_CLOSED,
  L_TIER,
  L_VALENCE,
  L_TABOO,
  L_BASIC,
} from "../anchorLabeled";
import { VEC_SCALE, GRAMMATICAL_DIMS, LEXICAL_DIMS } from "../vec";
import { fromFloats } from "../vec";
import { embed } from "../embeddings";
import { CONCEPTS } from "../../lexicon/concepts";

// ---------------------------------------------------------------------------
// 1. POS one-hot correctness
// ---------------------------------------------------------------------------

describe("anchorLabeled — POS one-hot", () => {
  const oneHotDims = [L_POS_NOUN, L_POS_VERB, L_POS_ADJ, L_POS_CLOSED] as const;

  function checkPosOneHot(concept: string, expectedDim: number) {
    const d = labeledDimsFor(concept as any);
    // exactly one of dims 0..3 equals VEC_SCALE
    const hotDims = oneHotDims.filter((i) => d[i] === VEC_SCALE);
    expect(hotDims).toHaveLength(1);
    expect(hotDims[0]).toBe(expectedDim);
    // all others are 0
    for (const i of oneHotDims) {
      if (i !== expectedDim) expect(d[i]).toBe(0);
    }
  }

  it("noun: 'dog' has L_POS_NOUN hot", () => {
    expect(CONCEPTS["dog"]?.pos).toBe("noun");
    checkPosOneHot("dog", L_POS_NOUN);
  });

  it("noun: 'water' has L_POS_NOUN hot", () => {
    expect(CONCEPTS["water"]?.pos).toBe("noun");
    checkPosOneHot("water", L_POS_NOUN);
  });

  it("verb: 'eat' has L_POS_VERB hot", () => {
    expect(CONCEPTS["eat"]?.pos).toBe("verb");
    checkPosOneHot("eat", L_POS_VERB);
  });

  it("adjective: 'big' has L_POS_ADJ hot", () => {
    expect(CONCEPTS["big"]?.pos).toBe("adjective");
    checkPosOneHot("big", L_POS_ADJ);
  });

  it("closed-class: 'i' (pronoun) has L_POS_CLOSED hot", () => {
    // 'i' is in BASIC_240 pronoun cluster and has pos === 'pronoun'
    expect(CONCEPTS["i"]?.pos).toBe("pronoun");
    checkPosOneHot("i", L_POS_CLOSED);
  });
});

// ---------------------------------------------------------------------------
// 2. L_TABOO
// ---------------------------------------------------------------------------

describe("anchorLabeled — L_TABOO", () => {
  it("'snake' (dangerous predator) is taboo-flagged", () => {
    const d = labeledDimsFor("snake" as any);
    expect(d[L_TABOO]).toBe(VEC_SCALE);
  });

  it("'wolf' (dangerous predator) is taboo-flagged", () => {
    const d = labeledDimsFor("wolf" as any);
    expect(d[L_TABOO]).toBe(VEC_SCALE);
  });

  it("'water' (ordinary concept) is NOT taboo-flagged", () => {
    const d = labeledDimsFor("water" as any);
    expect(d[L_TABOO]).toBe(0);
  });

  it("'dog' (ordinary animal) is NOT taboo-flagged", () => {
    const d = labeledDimsFor("dog" as any);
    expect(d[L_TABOO]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. L_BASIC
// ---------------------------------------------------------------------------

describe("anchorLabeled — L_BASIC", () => {
  it("'water' (in BASIC_240) is flagged basic", () => {
    const d = labeledDimsFor("water" as any);
    expect(d[L_BASIC]).toBe(VEC_SCALE);
  });

  it("'eat' (in BASIC_240) is flagged basic", () => {
    const d = labeledDimsFor("eat" as any);
    expect(d[L_BASIC]).toBe(VEC_SCALE);
  });

  it("'factory' (not in BASIC_240, tier 3) is NOT flagged basic", () => {
    // 'factory' is in EXPANDED_CONCEPTS at tier 3, not in BASIC_240
    expect(CONCEPTS["factory"]).toBeDefined();
    const d = labeledDimsFor("factory" as any);
    expect(d[L_BASIC]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. L_TIER
// ---------------------------------------------------------------------------

describe("anchorLabeled — L_TIER", () => {
  it("tier is recovered correctly for multiple concepts", () => {
    const samples = ["water", "dog", "eat", "big"] as const;
    for (const c of samples) {
      const d = labeledDimsFor(c as any);
      const expectedTier = CONCEPTS[c]!.tier;
      expect(d[L_TIER] / VEC_SCALE).toBe(expectedTier);
    }
  });

  it("'factory' (tier 3) stores 3 * VEC_SCALE", () => {
    const d = labeledDimsFor("factory" as any);
    expect(d[L_TIER]).toBe(3 * VEC_SCALE);
    expect(d[L_TIER] / VEC_SCALE).toBe(CONCEPTS["factory"]!.tier);
  });
});

// ---------------------------------------------------------------------------
// 5. anchorPointFull
// ---------------------------------------------------------------------------

describe("anchorLabeled — anchorPointFull", () => {
  const samples = ["water", "dog", "eat"] as const;

  for (const c of samples) {
    it(`anchorPointFull('${c}'): lexical dims [0..49] match fromFloats(embed(c))`, () => {
      const full = anchorPointFull(c as any);
      const lexical = fromFloats(embed(c as any));
      for (let i = 0; i < LEXICAL_DIMS; i++) {
        expect(full[i]).toBe(lexical[i]);
      }
    });

    it(`anchorPointFull('${c}'): labeled dims [50..57] match labeledDimsFor(c)`, () => {
      const full = anchorPointFull(c as any);
      const labeled = labeledDimsFor(c as any);
      for (let i = 0; i < GRAMMATICAL_DIMS; i++) {
        expect(full[LEXICAL_DIMS + i]).toBe(labeled[i]);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Shape, length, and determinism
// ---------------------------------------------------------------------------

describe("anchorLabeled — shape and determinism", () => {
  it("labeledDimsFor returns an Int32Array of length GRAMMATICAL_DIMS (8)", () => {
    const d = labeledDimsFor("water" as any);
    expect(d).toBeInstanceOf(Int32Array);
    expect(d.length).toBe(GRAMMATICAL_DIMS);
    expect(LABELED_DIMS).toBe(GRAMMATICAL_DIMS);
  });

  it("labeledDimsFor is deterministic — two calls give identical results", () => {
    for (const c of ["water", "eat", "big", "snake", "factory"] as const) {
      const d1 = labeledDimsFor(c as any);
      const d2 = labeledDimsFor(c as any);
      expect(Array.from(d1)).toEqual(Array.from(d2));
    }
  });

  it("anchorPointFull returns an Int32Array of length 58", () => {
    const full = anchorPointFull("water" as any);
    expect(full).toBeInstanceOf(Int32Array);
    expect(full.length).toBe(LEXICAL_DIMS + GRAMMATICAL_DIMS);
  });

  it("L_VALENCE is a Math.round of a float projection (finite integer)", () => {
    for (const c of ["good", "bad", "water", "snake"] as const) {
      const d = labeledDimsFor(c as any);
      expect(Number.isInteger(d[L_VALENCE])).toBe(true);
      expect(isFinite(d[L_VALENCE]!)).toBe(true);
    }
  });
});
