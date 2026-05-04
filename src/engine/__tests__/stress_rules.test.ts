import { describe, it, expect } from "vitest";
import type { WordForm } from "../types";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";

const RULES = [
  "stress.pretonic_weakening",
  "stress.stressed_diphthongization",
  "stress.open_syllable_lengthening",
  "stress.unstressed_final_apocope",
  "stress.unstressed_medial_syncope",
] as const;

describe("stress-aware catalog rules", () => {
  it("registers all five rules under stable ids", () => {
    for (const id of RULES) {
      expect(CATALOG_BY_ID[id], `missing rule ${id}`).toBeDefined();
    }
  });

  it("declares the right stressFilter on each rule", () => {
    expect(CATALOG_BY_ID["stress.pretonic_weakening"]!.stressFilter).toBe("pretonic");
    expect(CATALOG_BY_ID["stress.stressed_diphthongization"]!.stressFilter).toBe("stressed");
    expect(CATALOG_BY_ID["stress.open_syllable_lengthening"]!.stressFilter).toBe("stressed");
    expect(CATALOG_BY_ID["stress.unstressed_final_apocope"]!.stressFilter).toBe("unstressed");
    expect(CATALOG_BY_ID["stress.unstressed_medial_syncope"]!.stressFilter).toBe("unstressed");
  });

  // Phase 25: stress.open_syllable_lengthening was promoted to
  // enabledByDefault=true (Middle English stān → stoːn is a strong
  // cross-Germanic / Romance pattern worth enabling for the default
  // English-shaped preset). The rest stay opt-in.
  it("ships the four typologically-marked stress rules disabled by default", () => {
    const optIn = RULES.filter((id) => id !== "stress.open_syllable_lengthening");
    for (const id of optIn) {
      expect(CATALOG_BY_ID[id]!.enabledByDefault).toBe(false);
    }
    expect(CATALOG_BY_ID["stress.open_syllable_lengthening"]!.enabledByDefault).toBe(true);
  });

  describe("pretonic weakening", () => {
    it("replaces a pretonic vowel with schwa", () => {
      const word: WordForm = ["a", "p", "a", "t", "a"];
      const rule = CATALOG_BY_ID["stress.pretonic_weakening"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out.some((p) => p === "ə")).toBe(true);
    });
  });

  describe("stressed diphthongization", () => {
    it("turns stressed /e/ into /j e/ pair", () => {
      const word: WordForm = ["p", "e", "r", "e"];
      const rule = CATALOG_BY_ID["stress.stressed_diphthongization"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out.length).toBe(word.length + 1);
      expect(out).toContain("j");
    });

    it("turns stressed /o/ into /w o/ pair", () => {
      const word: WordForm = ["p", "o", "r", "t", "a"];
      const rule = CATALOG_BY_ID["stress.stressed_diphthongization"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out).toContain("w");
    });

    it("leaves stressed /a/ / /i/ / /u/ alone (only mid vowels diphthongise)", () => {
      const word: WordForm = ["k", "a", "t", "a"];
      const rule = CATALOG_BY_ID["stress.stressed_diphthongization"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out).toEqual(word);
    });
  });

  describe("open-syllable lengthening", () => {
    it("lengthens a stressed short vowel in an open syllable", () => {
      const word: WordForm = ["s", "t", "a", "n", "a"];
      const rule = CATALOG_BY_ID["stress.open_syllable_lengthening"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out.some((p) => p === "aː")).toBe(true);
    });

    it("skips an already-long stressed vowel", () => {
      const word: WordForm = ["s", "t", "aː", "n", "a"];
      const rule = CATALOG_BY_ID["stress.open_syllable_lengthening"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out).toEqual(word);
    });
  });

  describe("unstressed final apocope", () => {
    it("deletes a word-final unstressed vowel", () => {
      const word: WordForm = ["n", "a", "m", "a"];
      const rule = CATALOG_BY_ID["stress.unstressed_final_apocope"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out).toEqual(["n", "a", "m"]);
    });

    it("doesn't fire when the last phoneme isn't a vowel", () => {
      const word: WordForm = ["n", "a", "m"];
      const rule = CATALOG_BY_ID["stress.unstressed_final_apocope"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out).toEqual(word);
    });
  });

  describe("unstressed medial syncope", () => {
    it("deletes a medial unstressed vowel", () => {
      const word: WordForm = ["k", "a", "l", "i", "d", "u", "s"];
      const rule = CATALOG_BY_ID["stress.unstressed_medial_syncope"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out.length).toBe(word.length - 1);
    });

    it("never deletes a word-final or word-initial vowel", () => {
      const word: WordForm = ["a", "p", "a", "t", "a"];
      const rule = CATALOG_BY_ID["stress.unstressed_medial_syncope"]!;
      const out = rule.apply(word, makeRng("seed"));
      expect(out[0]).toBe("a");
      expect(out[out.length - 1]).toBe("a");
    });
  });
});
