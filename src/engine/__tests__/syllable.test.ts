import { describe, it, expect } from "vitest";
import {
  syllabify,
  assignStress,
  syllabifyAndStress,
  formatStressedIpa,
} from "../phonology/syllable";

describe("syllabify", () => {
  it("returns no syllables when there is no nucleus", () => {
    expect(syllabify(["t", "k"])).toEqual([]);
  });

  it("treats a lone vowel as a single-syllable form", () => {
    const s = syllabify(["a"]);
    expect(s).toHaveLength(1);
    expect(s[0]).toEqual({ onset: [], nucleus: 0, coda: [] });
  });

  it("attaches a single intervocalic consonant to the following onset", () => {
    const s = syllabify(["a", "t", "a"]);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ onset: [], nucleus: 0, coda: [] });
    expect(s[1]).toEqual({ onset: [1], nucleus: 2, coda: [] });
  });

  it("splits a falling-sonority cluster across syllable boundary (apti → ap.ti)", () => {
    const s = syllabify(["a", "p", "t", "i"]);
    expect(s).toHaveLength(2);
    expect(s[0]!.coda).toEqual([1]);
    expect(s[1]!.onset).toEqual([2]);
  });

  it("keeps a rising-sonority cluster as onset (matre → ma.tre)", () => {
    const s = syllabify(["m", "a", "t", "r", "e"]);
    expect(s).toHaveLength(2);
    expect(s[0]!.onset).toEqual([0]);
    expect(s[0]!.coda).toEqual([]);
    expect(s[1]!.onset).toEqual([2, 3]);
  });

  it("honours the s+stop exception (astri → a.stri)", () => {
    const s = syllabify(["a", "s", "t", "r", "i"]);
    expect(s).toHaveLength(2);
    expect(s[0]!.coda).toEqual([]);
    expect(s[1]!.onset).toEqual([1, 2, 3]);
  });

  it("treats syllabic resonants as nuclei (wodr̩ → wo.dr̩)", () => {
    const s = syllabify(["w", "o", "d", "r̩"]);
    expect(s).toHaveLength(2);
    expect(s[0]!.onset).toEqual([0]);
    expect(s[0]!.nucleus).toBe(1);
    expect(s[1]!.onset).toEqual([2]);
    expect(s[1]!.nucleus).toBe(3);
  });

  it("assigns word-initial consonants to the first onset", () => {
    const s = syllabify(["s", "t", "r", "a"]);
    expect(s).toHaveLength(1);
    expect(s[0]!.onset).toEqual([0, 1, 2]);
    expect(s[0]!.nucleus).toBe(3);
  });

  it("assigns word-final consonants to the last coda", () => {
    const s = syllabify(["a", "k", "t"]);
    expect(s).toHaveLength(1);
    expect(s[0]!.coda).toEqual([1, 2]);
  });
});

describe("assignStress", () => {
  it("returns -1 for an empty syllable list", () => {
    expect(assignStress([], "penult")).toBe(-1);
  });

  it("places initial stress on the first syllable", () => {
    const sylls = syllabify(["k", "u", "n", "i", "n", "g", "a", "z"]);
    expect(assignStress(sylls, "initial")).toBe(0);
  });

  it("places final stress on the last syllable", () => {
    const sylls = syllabify(["k", "u", "n", "i", "n", "g", "a", "z"]);
    expect(assignStress(sylls, "final")).toBe(sylls.length - 1);
  });

  it("places penult stress on the second-to-last syllable", () => {
    const sylls = syllabify(["v", "i", "d", "e", "r", "e"]);
    expect(assignStress(sylls, "penult")).toBe(sylls.length - 2);
  });

  it("places antepenult stress on the third-from-last syllable when available", () => {
    const sylls = syllabify(["k", "u", "n", "i", "n", "g", "a", "z"]);
    expect(assignStress(sylls, "antepenult")).toBe(0);
  });

  it("falls back to penult when antepenult would be out of range", () => {
    const sylls = syllabify(["k", "a", "t"]);
    expect(assignStress(sylls, "antepenult")).toBe(0);
  });

  it("honours a lexical override when valid", () => {
    const sylls = syllabify(["d", "u", "g", "h₂", "t", "e", "r"]);
    const idx = assignStress(sylls, "lexical", 0);
    expect(idx).toBe(0);
  });

  it("falls back to penult when the lexical override is out of range", () => {
    const sylls = syllabify(["v", "i", "d", "e", "r", "e"]);
    const idx = assignStress(sylls, "lexical", 99);
    expect(idx).toBe(sylls.length - 2);
  });
});

describe("formatStressedIpa", () => {
  it("renders the user's example /wodr̩/ as [ˈwɔ.dr̩]", () => {
    const form = ["w", "o", "d", "r̩"];
    const { syllables, stressedIdx } = syllabifyAndStress(form, "penult");
    expect(formatStressedIpa(form, syllables, stressedIdx)).toBe("[ˈwo.dr̩]");
  });

  it("places the dot before non-initial unstressed syllables", () => {
    const form = ["v", "i", "d", "e", "r", "e"];
    const { syllables, stressedIdx } = syllabifyAndStress(form, "penult");
    expect(formatStressedIpa(form, syllables, stressedIdx)).toBe("[viˈde.re]");
  });

  it("emits an empty bracket for an empty form", () => {
    expect(formatStressedIpa([], [], -1)).toBe("[]");
  });
});
