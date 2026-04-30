import { describe, it, expect } from "vitest";
import {
  PHONE_FEATURES,
  featuresOf,
  matchesQuery,
  shiftHeight,
  findConsonant,
  isIntervocalic,
} from "../phonology/features";

describe("phonology/features", () => {
  it("classifies core stops, fricatives, nasals, and vowels", () => {
    expect(PHONE_FEATURES.p).toMatchObject({ type: "consonant", manner: "stop", voice: false });
    expect(PHONE_FEATURES.s).toMatchObject({ type: "consonant", manner: "fricative", voice: false });
    expect(PHONE_FEATURES.n).toMatchObject({ type: "consonant", manner: "nasal", voice: true });
    expect(PHONE_FEATURES.i).toMatchObject({ type: "vowel", height: "high", backness: "front" });
  });

  it("featuresOf returns undefined for unknown segments", () => {
    expect(featuresOf("ZZZ")).toBeUndefined();
  });

  it("matchesQuery matches type + feature combinations", () => {
    expect(matchesQuery("p", { type: "consonant", manner: "stop" })).toBe(true);
    expect(matchesQuery("p", { type: "consonant", voice: true })).toBe(false);
    expect(matchesQuery("i", { type: "vowel", backness: "front" })).toBe(true);
    expect(matchesQuery("u", { type: "vowel", backness: "front" })).toBe(false);
    expect(matchesQuery("ZZZ", { type: "consonant" })).toBe(false);
  });

  it("shiftHeight raises vowels by one step", () => {
    expect(shiftHeight("a", 1)).toBeDefined();
    expect(shiftHeight("i", 1)).toBe("i");
    expect(shiftHeight("e", 1)).not.toBe("e");
  });

  it("findConsonant resolves simple feature queries", () => {
    expect(findConsonant({ type: "consonant", place: "labiodental", manner: "fricative", voice: false })).toBe("f");
    expect(findConsonant({ type: "consonant", place: "velar", manner: "nasal", voice: true })).toBe("ŋ");
  });

  it("isIntervocalic requires both neighbours to be vowels", () => {
    expect(isIntervocalic("a", "e")).toBe(true);
    expect(isIntervocalic("a", "t")).toBe(false);
    expect(isIntervocalic(undefined, "a")).toBe(false);
  });
});
