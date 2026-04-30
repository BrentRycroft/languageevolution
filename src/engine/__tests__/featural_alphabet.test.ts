import { describe, it, expect } from "vitest";
import {
  ALL_VOICED_CONSONANTS,
  ALL_VOICELESS_CONSONANTS,
  VOICED_OBSTRUENTS,
  STOPS,
  isVelarStop,
  isFrontVowel,
  isVoicedObstruent,
  mirrorDiacritics,
} from "../phonology/inventory";
import { CATALOG_BY_ID } from "../phonology/catalog";

describe("featural alphabet wiring", () => {
  it("voiced consonant set includes PIE aspirates and labiovelars", () => {
    for (const p of ["bʰ", "dʰ", "gʰ", "gʷ", "gʷʰ", "gʲ", "gʲʰ", "ɣ"]) {
      expect(ALL_VOICED_CONSONANTS.has(p), `${p} should be voiced`).toBe(true);
    }
  });

  it("voiceless consonant set includes aspirates, palatovelars, laryngeals", () => {
    for (const p of ["pʰ", "tʰ", "kʰ", "kʷ", "kʲ", "ḱ", "h₁", "h₂"]) {
      expect(ALL_VOICELESS_CONSONANTS.has(p), `${p} should be voiceless`).toBe(true);
    }
  });

  it("voiced-obstruent set excludes nasals and liquids", () => {
    for (const p of ["m", "n", "l", "r", "ŋ"]) {
      expect(VOICED_OBSTRUENTS.has(p), `${p} should not be a voiced obstruent`).toBe(false);
    }
    expect(isVoicedObstruent("dʰ")).toBe(true);
    expect(isVoicedObstruent("m")).toBe(false);
  });

  it("STOPS set includes aspirated, palatalised, labialised stops", () => {
    for (const p of ["p", "t", "k", "kʲ", "kʷ", "bʰ", "dʰ", "gʷʰ"]) {
      expect(STOPS.has(p), `${p} should be a stop`).toBe(true);
    }
  });

  it("isVelarStop catches all velar stop variants", () => {
    for (const p of ["k", "g", "kʷ", "gʷ", "kʲ", "gʲ", "ḱ", "ǵ", "kʰ", "gʰ", "bʰ"]) {
      expect(isVelarStop(p), `${p}`).toBe(p === "bʰ" ? false : true);
    }
  });

  it("isFrontVowel catches long fronts", () => {
    expect(isFrontVowel("i")).toBe(true);
    expect(isFrontVowel("e")).toBe(true);
    expect(isFrontVowel("iː")).toBe(true);
    expect(isFrontVowel("eː")).toBe(true);
    expect(isFrontVowel("a")).toBe(false);
    expect(isFrontVowel("o")).toBe(false);
  });

  it("mirrorDiacritics carries trailing ʷ/ʲ/ʰ/ː from source to target", () => {
    expect(mirrorDiacritics("kʷ", "tʃ")).toBe("tʃʷ");
    expect(mirrorDiacritics("kʲ", "tʃ")).toBe("tʃʲ");
    expect(mirrorDiacritics("kʰ", "tʃ")).toBe("tʃʰ");
    expect(mirrorDiacritics("k", "tʃ")).toBe("tʃ");
  });

  it("palatalization rule fires on labialised velar before front vowel", () => {
    const rule = CATALOG_BY_ID["palatalization.k_before_front_V"]!;
    expect(rule.probabilityFor(["kʷ", "i", "n"])).toBeGreaterThan(0);
    expect(rule.probabilityFor(["kʲ", "e", "n"])).toBeGreaterThan(0);
    expect(rule.probabilityFor(["k", "iː"])).toBeGreaterThan(0);
    expect(rule.probabilityFor(["k", "a"])).toBe(0);
  });

  it("tonogenesis fires on word-final aspirated voiced stop", () => {
    const rule = CATALOG_BY_ID["tonogenesis.voiced_coda"]!;
    expect(rule.probabilityFor(["a", "dʰ"])).toBeGreaterThan(0);
    expect(rule.probabilityFor(["e", "bʰ"])).toBeGreaterThan(0);
    expect(rule.probabilityFor(["a", "m"])).toBe(0);
  });

  it("n-assimilation handles labialised velar following", () => {
    const rule = CATALOG_BY_ID["assimilation.n_before_labial_velar"]!;
    expect(rule.probabilityFor(["a", "n", "kʷ", "o"])).toBeGreaterThan(0);
    expect(rule.probabilityFor(["a", "n", "gʷ", "o"])).toBeGreaterThan(0);
    expect(rule.probabilityFor(["a", "n", "s", "o"])).toBe(0);
  });
});
