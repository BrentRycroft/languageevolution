import { describe, it, expect } from "vitest";
import type { WordForm } from "../types";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";

/**
 * Per-rule unit tests for the stress-aware additions to the catalog.
 * Each rule's `apply` is exercised on a hand-crafted form where the
 * expected mutation is unambiguous; we then assert the output's
 * shape (not the exact RNG-driven path).
 *
 * The `stressFilter` short-circuit lives in `apply.ts` — those tests
 * are in `stress_filter.test.ts`. Here we test the rule-internal
 * logic given a form that already has at least one matching site.
 */

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

  it("ships each new stress rule disabled by default (opt-in per language)", () => {
    for (const id of RULES) {
      // Skip the legacy rule which keeps its original default.
      expect(CATALOG_BY_ID[id]!.enabledByDefault).toBe(false);
    }
  });

  describe("pretonic weakening", () => {
    it("replaces a pretonic vowel with schwa", () => {
      // /a.pa.ta/ — penult stress places it on `a` (idx 3); pretonic
      // = idx 1 (a in position 1 — first vowel).
      const word: WordForm = ["a", "p", "a", "t", "a"];
      const rule = CATALOG_BY_ID["stress.pretonic_weakening"]!;
      const out = rule.apply(word, makeRng("seed"));
      // At least one of the pretonic-eligible vowels should be ə.
      expect(out.some((p) => p === "ə")).toBe(true);
    });
  });

  describe("stressed diphthongization", () => {
    it("turns stressed /e/ into /j e/ pair", () => {
      // /p e r e/ — penult = e at idx 1.
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
      // /s t a n a/ — penult = a at idx 2; followed by /n/ + /a/ = open.
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
      // /n a m a/ — penult = a at idx 1; final a at idx 3 unstressed.
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
      // /k a l i d u s/ — penult = u at idx 4; medial unstressed = a (1), i (3).
      const word: WordForm = ["k", "a", "l", "i", "d", "u", "s"];
      const rule = CATALOG_BY_ID["stress.unstressed_medial_syncope"]!;
      const out = rule.apply(word, makeRng("seed"));
      // One vowel was deleted somewhere in the word.
      expect(out.length).toBe(word.length - 1);
    });

    it("never deletes a word-final or word-initial vowel", () => {
      // Confirms positionBias: word-internal only.
      const word: WordForm = ["a", "p", "a", "t", "a"];
      const rule = CATALOG_BY_ID["stress.unstressed_medial_syncope"]!;
      const out = rule.apply(word, makeRng("seed"));
      // Initial /a/ and final /a/ must survive; only medial /a/ at idx 2 may go.
      expect(out[0]).toBe("a");
      expect(out[out.length - 1]).toBe("a");
    });
  });
});
