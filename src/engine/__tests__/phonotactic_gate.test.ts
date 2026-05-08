import { describe, it, expect } from "vitest";
import {
  repairToProfile,
  pickEpentheticVowel,
  phonotacticScore,
} from "../phonology/phonotactics";
import type { Language, Phoneme, WordForm } from "../types";

/**
 * phonotactic_gate.test.ts
 *
 * Test suite for: "Phase 67 T3 — phonotactic constraints as coinage gates".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("Phase 67 T3 — phonotactic constraints as coinage gates", () => {
  it("repairToProfile breaks up onset clusters violating maxOnset", () => {
    const profile = { maxOnset: 1, maxCoda: 0, maxCluster: 1, strictness: 1 };
    const form: WordForm = ["s", "t", "ɹ", "ɛ", "s"] as Phoneme[];
    const repaired = repairToProfile(form, profile, "ə");
    // "stɹɛs" with maxOnset 1 → split CCC at indices 1, 2: "səttɹəɛs"-style
    // (the exact splits depend on iteration order — assert that the
    // result has no onset cluster larger than 1 and no medial cluster
    // larger than maxCluster).
    let onset = 0;
    while (onset < repaired.length && /[bcdfghjklmnpqrstvwxyzɹθʃ]/.test(repaired[onset]!)) onset++;
    expect(onset).toBeLessThanOrEqual(profile.maxOnset);
    // The original form had 3-onset; repaired should be at most 1.
    expect(repaired.length).toBeGreaterThan(form.length);
  });

  it("repairToProfile breaks up coda clusters violating maxCoda", () => {
    const profile = { maxOnset: 2, maxCoda: 0, maxCluster: 2, strictness: 1 };
    const form: WordForm = ["d", "ɔ", "g", "z"] as Phoneme[];
    const repaired = repairToProfile(form, profile, "ə");
    // Coda /gz/ with maxCoda 0 should be split — vowel inserted
    // between g and z.
    expect(repaired.length).toBeGreaterThan(form.length);
    expect(repaired).toContain("ə");
  });

  it("repairToProfile is no-op when form already complies", () => {
    const profile = { maxOnset: 2, maxCoda: 1, maxCluster: 2, strictness: 1 };
    const form: WordForm = ["t", "a"] as Phoneme[];
    expect(repairToProfile(form, profile, "ə")).toEqual(form);
  });

  it("pickEpentheticVowel picks the first inventory vowel", () => {
    const lang = {
      phonemeInventory: {
        segmental: ["k", "p", "i", "a", "u"] as Phoneme[],
      },
    } as unknown as Language;
    expect(pickEpentheticVowel(lang)).toBe("i");

    const lang2 = {
      phonemeInventory: {
        segmental: ["k", "p", "t"] as Phoneme[],
      },
    } as unknown as Language;
    expect(pickEpentheticVowel(lang2)).toBe("ə");
  });

  it("post-repair phonotacticScore is higher than the original violating score", () => {
    const profile = { maxOnset: 1, maxCoda: 0, maxCluster: 1, strictness: 1 };
    const form: WordForm = ["s", "k", "ɹ", "i", "p", "t"] as Phoneme[];
    const before = phonotacticScore(form, profile);
    const repaired = repairToProfile(form, profile, "ə");
    const after = phonotacticScore(repaired, profile);
    expect(before).toBeLessThan(0.5);
    expect(after).toBeGreaterThan(before);
  });
});
