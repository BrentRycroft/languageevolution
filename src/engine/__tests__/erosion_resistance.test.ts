import { describe, it, expect } from "vitest";
import { erosionResistance } from "../phonology/apply";

describe("Phase 24 — soft erosion resistance curve", () => {
  it("returns 1.0 (full rate) at full seed length for an erosive category", () => {
    expect(erosionResistance("deletion", 5, 5)).toBeCloseTo(1, 5);
    expect(erosionResistance("lenition", 4, 4)).toBeCloseTo(1, 5);
    expect(erosionResistance("gemination", 3, 3)).toBeCloseTo(1, 5);
  });

  it("returns 0 at or below the per-seed floor (max(2, ceil(seedLen*0.7)))", () => {
    // seedLen=5: floor = ceil(3.5) = 4. So lengths ≤ 4 give factor 0
    // (the soft cap collapses to a hard zero at the floor).
    expect(erosionResistance("deletion", 4, 5)).toBe(0);
    expect(erosionResistance("deletion", 3, 5)).toBe(0);
    expect(erosionResistance("deletion", 2, 5)).toBe(0);
    // seedLen=4: floor = ceil(2.8) = 3.
    expect(erosionResistance("deletion", 3, 4)).toBe(0);
    expect(erosionResistance("deletion", 2, 4)).toBe(0);
  });

  it("returns 1 at full seed length and approaches 0 only above the floor", () => {
    // seedLen=6: floor = ceil(4.2) = 5. Range = 1.
    //   currentLen=6 → factor = 1
    //   currentLen=5 → factor = 0 (≤ floor)
    expect(erosionResistance("deletion", 6, 6)).toBeCloseTo(1, 5);
    expect(erosionResistance("deletion", 5, 6)).toBe(0);
    // seedLen=7: floor = ceil(4.9) = 5. Range = 2.
    //   currentLen=7 → factor = 1
    //   currentLen=6 → factor = (1/2)^1.5 ≈ 0.354
    //   currentLen=5 → factor = 0
    expect(erosionResistance("deletion", 7, 7)).toBeCloseTo(1, 5);
    expect(erosionResistance("deletion", 6, 7)).toBeGreaterThan(0.3);
    expect(erosionResistance("deletion", 6, 7)).toBeLessThan(0.4);
    expect(erosionResistance("deletion", 5, 7)).toBe(0);
  });

  it("returns 1 for non-erosive categories regardless of length", () => {
    // Vowel shifts, palatalisation, fortition, insertion, voicing,
    // assimilation, and metathesis all stay at full rate. Only the
    // erosion-class rules get dampened.
    expect(erosionResistance("vowel", 2, 5)).toBe(1);
    expect(erosionResistance("palatalization", 2, 5)).toBe(1);
    expect(erosionResistance("fortition", 2, 5)).toBe(1);
    expect(erosionResistance("insertion", 2, 5)).toBe(1);
    expect(erosionResistance("voicing", 2, 5)).toBe(1);
    expect(erosionResistance("assimilation", 2, 5)).toBe(1);
    expect(erosionResistance("metathesis", 2, 5)).toBe(1);
  });

  it("returns 1 for 2-phoneme seeds — no erosion possible without breaking minimum legality", () => {
    expect(erosionResistance("deletion", 2, 2)).toBe(1);
    expect(erosionResistance("deletion", 2, 1)).toBe(1);
    expect(erosionResistance("lenition", 2, 2)).toBe(1);
  });

  it("clamps at 1 when currentLen exceeds seedLen (post-insertion case)", () => {
    // After an epenthesis rule fires, current length might exceed seed
    // length. Resistance should clip at 1, not balloon above it.
    expect(erosionResistance("deletion", 6, 5)).toBeCloseTo(1, 5);
    expect(erosionResistance("lenition", 7, 4)).toBeCloseTo(1, 5);
  });
});
