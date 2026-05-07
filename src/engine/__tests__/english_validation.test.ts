import { describe, it, expect } from "vitest";
import { isValidEnglishLemma } from "../translator/englishWordlist";

describe("Phase 51 T1 + 53.5 — English lemma validation", () => {
  it("accepts CONCEPTS-registered words", () => {
    expect(isValidEnglishLemma("water")).toBe(true);
    expect(isValidEnglishLemma("mother")).toBe(true);
    expect(isValidEnglishLemma("light")).toBe(true);
  });

  it("accepts closed-class function words", () => {
    expect(isValidEnglishLemma("the")).toBe(true);
    expect(isValidEnglishLemma("a")).toBe(true);
    expect(isValidEnglishLemma("i")).toBe(true);
    expect(isValidEnglishLemma("is")).toBe(true);
    expect(isValidEnglishLemma("not")).toBe(true);
  });

  it("accepts derived forms via affix decomposition", () => {
    // Stems light, walk are CONCEPTS-registered; affix is recognised.
    expect(isValidEnglishLemma("lighter")).toBe(true);
    expect(isValidEnglishLemma("walker")).toBe(true);
  });

  it("accepts inflected forms (-s, -ed, -ing)", () => {
    expect(isValidEnglishLemma("dogs")).toBe(true);
    expect(isValidEnglishLemma("walked")).toBe(true);
    expect(isValidEnglishLemma("walking")).toBe(true);
  });

  it("accepts doubled-consonant inflections", () => {
    // run → running, swim → swimming.
    expect(isValidEnglishLemma("running")).toBe(true);
  });

  it("rejects single letters", () => {
    expect(isValidEnglishLemma("w")).toBe(false);
    expect(isValidEnglishLemma("z")).toBe(false);
  });

  it("rejects keyboard mash and typos (Phase 53.5)", () => {
    expect(isValidEnglishLemma("asdfgh")).toBe(false);
    expect(isValidEnglishLemma("qrtxzv")).toBe(false);
    // Phase 53.5 explicit user complaint: typo "engin" (intended
    // "engine") should reject, not get coined into a fresh form.
    expect(isValidEnglishLemma("engin")).toBe(false);
    expect(isValidEnglishLemma("asdf")).toBe(false);
    expect(isValidEnglishLemma("qwerty")).toBe(false);
    expect(isValidEnglishLemma("xyzzy")).toBe(false);
  });

  it("accepts compounds of two known stems (Phase 53.5)", () => {
    // firewood = fire (CONCEPTS) + wood (CONCEPTS).
    expect(isValidEnglishLemma("firewood")).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isValidEnglishLemma("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isValidEnglishLemma("Water")).toBe(true);
    expect(isValidEnglishLemma("WATER")).toBe(true);
  });
});
