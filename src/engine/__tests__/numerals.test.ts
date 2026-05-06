import { describe, it, expect } from "vitest";
import { describeNumeral } from "../translator/numerals";
import type { Language } from "../types";

function makeLang(grammar: Partial<Language["grammar"]> = {}): Language {
  return {
    id: "L",
    name: "Test",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO",
      affixPosition: "suffix",
      pluralMarking: "none",
      tenseMarking: "none",
      hasCase: false,
      genderCount: 0,
      ...grammar,
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
  };
}

describe("Phase 39k — numeral formatting", () => {
  it("English-style decimal big-small: 55 → fifty five", () => {
    const lang = makeLang();
    expect(describeNumeral(55, lang)).toBe("fifty five");
  });

  it("German-style decimal small-big: 55 → five-and fifty", () => {
    const lang = makeLang({ numeralOrder: "small-big" });
    expect(describeNumeral(55, lang)).toBe("five-and fifty");
  });

  it("French-style 70 → soixante-dix (sixty ten)", () => {
    const lang = makeLang({ numeralBase: "mixed-decimal-vigesimal" });
    expect(describeNumeral(70, lang)).toBe("sixty ten");
  });

  it("French-style 80 → quatre-vingts (four twenty)", () => {
    const lang = makeLang({ numeralBase: "mixed-decimal-vigesimal" });
    expect(describeNumeral(80, lang)).toBe("four twenty");
  });

  it("French-style 95 → quatre-vingt-quinze (four twenty fifteen)", () => {
    const lang = makeLang({ numeralBase: "mixed-decimal-vigesimal" });
    expect(describeNumeral(95, lang)).toBe("four twenty fifteen");
  });

  it("Yoruba-style subtractive 45 → 'five from fifty'", () => {
    const lang = makeLang({ numeralBase: "subtractive-decimal" });
    expect(describeNumeral(45, lang)).toBe("five from fifty");
  });

  it("Vigesimal 40 → 'two twenty'", () => {
    const lang = makeLang({ numeralBase: "vigesimal" });
    expect(describeNumeral(40, lang)).toBe("two twenty");
  });

  it("hundreds: 305 → three hundred five", () => {
    const lang = makeLang();
    expect(describeNumeral(305, lang)).toBe("three hundred five");
  });

  it("zero", () => {
    const lang = makeLang();
    expect(describeNumeral(0, lang)).toBe("zero");
  });
});
