import { describe, it, expect } from "vitest";
import { assignGenderHeuristic, assignAllGenders, genderOf } from "../morphology/gender";
import { inflect } from "../morphology/evolve";
import type { Language } from "../types";

function makeLang(opts: Partial<Language> = {}): Language {
  return {
    id: "L-g",
    name: "Test",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO",
      affixPosition: "suffix",
      pluralMarking: "affix",
      tenseMarking: "past",
      hasCase: false,
      genderCount: 2,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    ...opts,
  };
}

describe("gender heuristic", () => {
  it("returns 0 when genderCount=0 (no gender system)", () => {
    expect(assignGenderHeuristic(["k", "a"], 0)).toBe(0);
  });

  it("2-gender: vowel-final → 0, consonant-final → 1", () => {
    expect(assignGenderHeuristic(["k", "a"], 2)).toBe(0);
    expect(assignGenderHeuristic(["k", "a", "t"], 2)).toBe(1);
  });

  it("3-gender: -a → 0 (fem), -o → 1 (masc), consonant-final → 2 (neuter)", () => {
    expect(assignGenderHeuristic(["k", "a", "s", "a"], 3)).toBe(0);
    expect(assignGenderHeuristic(["g", "a", "t", "o"], 3)).toBe(1);
    expect(assignGenderHeuristic(["k", "a", "n"], 3)).toBe(2);
  });

  it("genderOf lazily fills the map and is stable across calls", () => {
    const lang = makeLang({ lexicon: { dog: ["k", "a", "n"] } });
    expect(lang.gender).toBeUndefined();
    const g1 = genderOf(lang, "dog");
    expect(g1).toBe(1);
    expect(lang.gender?.dog).toBe(1);
    const g2 = genderOf(lang, "dog");
    expect(g2).toBe(1);
  });

  it("genderOf returns 0 for languages with genderCount=0", () => {
    const lang = makeLang({
      lexicon: { dog: ["k", "a", "n"] },
      grammar: { ...makeLang().grammar, genderCount: 0 },
    });
    expect(genderOf(lang, "dog")).toBe(0);
    expect(lang.gender).toBeUndefined();
  });

  it("assignAllGenders fills every lexicon entry", () => {
    const lang = makeLang({
      lexicon: {
        dog: ["k", "a", "n"],
        cat: ["g", "a", "t", "o"],
        moon: ["l", "u", "n", "a"],
      },
      grammar: { ...makeLang().grammar, genderCount: 3 },
    });
    assignAllGenders(lang);
    expect(lang.gender?.dog).toBe(2);
    expect(lang.gender?.cat).toBe(1);
    expect(lang.gender?.moon).toBe(0);
  });
});

describe("gender-conditioned paradigm variants", () => {
  it("inflect picks the gender:N variant when the meaning's gender matches", () => {
    const lang = makeLang({
      lexicon: {
        dog: ["k", "a", "n"],
        moon: ["l", "u", "n", "a"],
      },
      morphology: {
        paradigms: {
          "noun.case.acc": {
            affix: ["m"],
            position: "suffix",
            category: "noun.case.acc",
            variants: [
              { when: "gender:0", affix: ["m", "a"] },
              { when: "gender:1", affix: ["m", "o"] },
            ],
          },
        },
      },
    });
    assignAllGenders(lang);
    const accDog = inflect(["k", "a", "n"], lang.morphology.paradigms["noun.case.acc"], lang, "dog");
    const accMoon = inflect(["l", "u", "n", "a"], lang.morphology.paradigms["noun.case.acc"], lang, "moon");
    expect(accDog).toEqual(["k", "a", "n", "m", "o"]);
    expect(accMoon).toEqual(["l", "u", "n", "a", "m", "a"]);
  });

  it("falls back to stem-shape variant if no gender variant matches", () => {
    const lang = makeLang({
      lexicon: { dog: ["k", "a", "n"] },
      morphology: {
        paradigms: {
          "noun.case.acc": {
            affix: ["m"],
            position: "suffix",
            category: "noun.case.acc",
            variants: [
              { when: "vowel-final", affix: ["m"] },
              { when: "consonant-final", affix: ["e", "m"] },
            ],
          },
        },
      },
    });
    const acc = inflect(["k", "a", "n"], lang.morphology.paradigms["noun.case.acc"], lang, "dog");
    expect(acc).toEqual(["k", "a", "n", "e", "m"]);
  });

  it("languages without gender ignore gender:N variants", () => {
    const lang = makeLang({
      lexicon: { dog: ["k", "a", "n"] },
      grammar: { ...makeLang().grammar, genderCount: 0 },
      morphology: {
        paradigms: {
          "noun.case.acc": {
            affix: ["m"],
            position: "suffix",
            category: "noun.case.acc",
            variants: [
              { when: "gender:0", affix: ["m", "a"] },
              { when: "consonant-final", affix: ["e", "m"] },
            ],
          },
        },
      },
    });
    const acc = inflect(["k", "a", "n"], lang.morphology.paradigms["noun.case.acc"], lang, "dog");
    expect(acc).toEqual(["k", "a", "n", "e", "m"]);
  });
});
