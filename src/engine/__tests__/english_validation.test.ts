import { describe, it, expect } from "vitest";
import { isValidEnglishLemma } from "../translator/englishWordlist";

describe("Phase 51 T1 — English lemma validation", () => {
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

  it("rejects keyboard mash with consonant clusters", () => {
    // "asdfgh" has the 5-consonant run "sdfgh", "qrtxzv" no vowel.
    expect(isValidEnglishLemma("asdfgh")).toBe(false);
    expect(isValidEnglishLemma("qrtxzv")).toBe(false);
  });

  it("accepts plausible-English words not in CONCEPTS (heuristic layer)", () => {
    // Dragon, house, wise, angry aren't in CONCEPTS but look like
    // English; the translator should attempt to render them rather
    // than emit a literal-quote fallback.
    expect(isValidEnglishLemma("dragon")).toBe(true);
    expect(isValidEnglishLemma("house")).toBe(true);
    expect(isValidEnglishLemma("wise")).toBe(true);
    expect(isValidEnglishLemma("angry")).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isValidEnglishLemma("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isValidEnglishLemma("Water")).toBe(true);
    expect(isValidEnglishLemma("WATER")).toBe(true);
  });
});
