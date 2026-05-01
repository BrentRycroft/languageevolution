import { describe, it, expect } from "vitest";
import { romanize } from "../phonology/orthography";
import { presetEnglish } from "../presets/english";
import type { Language } from "../types";

const fakeLang = { orthography: {} } as unknown as Language;

describe("English-baseline romanization", () => {
  const lex = presetEnglish().seedLexicon;

  const cases: Array<[string, string]> = [
    ["moon", "moon"],
    ["mother", "muther"],
    ["thunder", "thunder"],
    ["sky", "sky"],
    ["day", "day"],
    ["snow", "snow"],
    ["tree", "tree"],
    ["sea", "see"],
    ["leaf", "leef"],
    ["queen", "kween"],
    ["fruit", "froot"],
    ["tooth", "tooth"],
    ["hot", "hot"],
    ["dog", "dog"],
    ["god", "god"],
    ["father", "father"],
    ["mother", "muther"],
    ["fish", "fish"],
    ["hand", "hand"],
    ["fly", "fly"],
    ["child", "child"],
    ["this", "this"],
    ["that", "that"],
  ];

  for (const [meaning, expected] of cases) {
    it(`${meaning} → ${expected}`, () => {
      const form = lex[meaning];
      expect(form, `${meaning} should exist in English preset`).toBeDefined();
      const out = romanize(form!, fakeLang);
      expect(out).toBe(expected);
    });
  }

  it("ʌ romanizes as 'u'", () => {
    expect(romanize(["b", "ʌ", "t"], fakeLang)).toBe("but");
  });

  it("æ romanizes as 'a'", () => {
    expect(romanize(["k", "æ", "t"], fakeLang)).toBe("kat");
  });

  it("ɪ romanizes as 'i'", () => {
    expect(romanize(["b", "ɪ", "g"], fakeLang)).toBe("big");
  });

  it("uː romanizes as 'oo'", () => {
    expect(romanize(["m", "uː", "n"], fakeLang)).toBe("moon");
  });

  it("iː romanizes as 'ee'", () => {
    expect(romanize(["t", "r", "iː"], fakeLang)).toBe("tree");
  });

  it("a+j combines to 'i' word-medially", () => {
    expect(romanize(["t", "a", "j", "m"], fakeLang)).toBe("tim");
  });

  it("a+j combines to 'y' word-finally", () => {
    expect(romanize(["s", "k", "a", "j"], fakeLang)).toBe("sky");
  });

  it("o+w combines to 'ow'", () => {
    expect(romanize(["s", "n", "o", "w"], fakeLang)).toBe("snow");
  });

  it("ð renders as 'th' (English convention)", () => {
    expect(romanize(["ð", "ɪ", "s"], fakeLang)).toBe("this");
  });

  it("standalone /j/ renders as 'y' (yes, you, year)", () => {
    expect(romanize(["j", "ɛ", "s"], fakeLang)).toBe("yes");
    expect(romanize(["j", "uː"], fakeLang)).toBe("yoo");
    expect(romanize(["j", "ɪ", "r"], fakeLang)).toBe("yir");
  });

  it("/dʒ/ still renders as 'j' (jump, jail)", () => {
    expect(romanize(["dʒ", "ʌ", "m", "p"], fakeLang)).toBe("jump");
  });

  it("language-specific orthography overrides default", () => {
    const langWithCustom = {
      orthography: { "ʌ": "uh" },
    } as unknown as Language;
    expect(romanize(["b", "ʌ", "t"], langWithCustom)).toBe("buht");
  });
});
