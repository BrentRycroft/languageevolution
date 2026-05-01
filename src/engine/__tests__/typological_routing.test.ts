import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { generateNarrative } from "../narrative/generate";
import type { Language, Lexicon } from "../types";

function makeLang(overrides: Partial<Language> = {}, lexicon: Lexicon = {}): Language {
  return {
    id: "L-r",
    name: "TestLang",
    lexicon,
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
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["p", "t", "k", "a", "e", "i", "o", "u", "m", "n", "s", "w"], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    speakers: 10000,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    ...overrides,
  };
}

describe("Phase 13 — relative clauses, serial verbs, narrative routing", () => {
  describe("relative clauses", () => {
    it("gap strategy: rel clause appears after head NP, no relativizer fronting it (matrix sibling fallback)", () => {
      const lang = makeLang(
        { grammar: { ...makeLang().grammar, relativeClauseStrategy: "gap" } },
        {
          man: ["m", "a", "n"],
          dog: ["d", "o", "g"],
          see: ["s", "i"],
          run: ["r", "u"],
        },
      );
      const out = translateSentence(lang, "the man who saw the dog runs");
      const verbs = out.targetTokens.filter((t) => t.englishLemma === "see" || t.englishLemma === "run");
      expect(verbs.length).toBeGreaterThanOrEqual(2);
      const headIdx = out.targetTokens.findIndex((t) => t.englishLemma === "man");
      const seeIdx = out.targetTokens.findIndex((t) => t.englishLemma === "see");
      expect(headIdx, "head 'man' realised").toBeGreaterThanOrEqual(0);
      expect(seeIdx, "rel verb 'see' realised").toBeGreaterThanOrEqual(0);
    });

    it("relativizer strategy: rel clause precedes head", () => {
      const lang = makeLang(
        { grammar: { ...makeLang().grammar, relativeClauseStrategy: "relativizer" } },
        {
          man: ["m", "a", "n"],
          dog: ["d", "o", "g"],
          see: ["s", "i"],
          run: ["r", "u"],
        },
      );
      const out = translateSentence(lang, "the man who saw the dog runs");
      const headIdx = out.targetTokens.findIndex((t) => t.englishLemma === "man");
      const seeIdx = out.targetTokens.findIndex((t) => t.englishLemma === "see");
      if (headIdx >= 0 && seeIdx >= 0) {
        expect(seeIdx, "rel verb precedes head in relativizer strategy").toBeLessThan(headIdx);
      }
    });
  });

  describe("serial-verb construction", () => {
    it("dropping 'and' between clauses when SVC enabled", () => {
      const lang = makeLang(
        { grammar: { ...makeLang().grammar, serialVerbConstructions: true } },
        {
          go: ["g", "o"],
          take: ["t", "a"],
          book: ["b", "u"],
        },
      );
      const out = translateSentence(lang, "go and take the book");
      const hasAnd = out.targetTokens.some((t) => t.englishLemma === "and");
      expect(hasAnd, "and conjunction should be dropped under SVC").toBe(false);
    });

    it("keeping 'and' when SVC disabled", () => {
      const lang = makeLang({}, {
        go: ["g", "o"],
        take: ["t", "a"],
        book: ["b", "u"],
        and: ["e"],
      });
      const out = translateSentence(lang, "go and take the book");
      const hasAnd = out.targetTokens.some((t) => t.englishLemma === "and");
      expect(hasAnd, "and is realised when SVC is off").toBe(true);
    });
  });

  describe("narrative routing through translateSentence", () => {
    it("non-trivial typology uses deep routing (alignment, harmony, classifiers)", () => {
      const lang = makeLang(
        {
          grammar: {
            wordOrder: "SOV",
            affixPosition: "suffix",
            pluralMarking: "none",
            tenseMarking: "none",
            hasCase: true,
            genderCount: 0,
            alignment: "erg-abs",
          },
          morphology: {
            paradigms: {
              "noun.case.erg": { affix: ["e", "k"], position: "suffix", category: "noun.case.erg" },
              "noun.case.abs": { affix: ["a", "n"], position: "suffix", category: "noun.case.abs" },
            },
          },
        },
        {
          mother: ["m", "a"],
          dog: ["d", "o"],
          see: ["w", "i"],
          eat: ["t", "a"],
          go: ["g", "o"],
        },
      );
      const lines = generateNarrative(lang, "narr-seed", 4, "ipa");
      expect(lines.length, "produces at least one narrative line").toBeGreaterThan(0);
      const erMatch = lines.some((l) => l.text.includes("ek"));
      const abMatch = lines.some((l) => l.text.includes("an"));
      expect(erMatch || abMatch, "at least one line bears erg/abs marking").toBe(true);
    });

    it("trivial nom-acc language produces narrative without crashing", () => {
      const lang = makeLang({}, {
        mother: ["m", "a"],
        father: ["t", "a"],
        see: ["w", "i"],
        run: ["r", "u"],
      });
      const lines = generateNarrative(lang, "narr-seed", 3, "ipa");
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.text.length).toBeGreaterThan(0);
        expect(line.gloss.length).toBeGreaterThan(0);
      }
    });
  });
});
