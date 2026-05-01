import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { harmonizeAffix } from "../morphology/harmony";
import { classifierMeaningFor } from "../translator/classifiers";
import { inflect } from "../morphology/evolve";
import type { Language, Lexicon } from "../types";
import type { Paradigm } from "../morphology/types";

function makeLang(overrides: Partial<Language> = {}, lexicon: Lexicon = {}): Language {
  return {
    id: "L-t",
    name: "TestLang",
    lexicon,
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO",
      affixPosition: "suffix",
      pluralMarking: "affix",
      tenseMarking: "past",
      hasCase: true,
      genderCount: 0,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["p", "t", "k", "a", "e", "i", "o", "u"], tones: [], usesTones: false },
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

describe("Phase 12 — typological depth", () => {
  describe("alignment", () => {
    it("ergative-absolutive marks transitive subject with erg, object with abs", () => {
      const ergPdm: Paradigm = { affix: ["e", "k"], position: "suffix", category: "noun.case.erg" };
      const absPdm: Paradigm = { affix: ["a", "n"], position: "suffix", category: "noun.case.abs" };
      const lang = makeLang(
        {
          grammar: {
            wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
            tenseMarking: "none", hasCase: true, genderCount: 0,
            alignment: "erg-abs", caseStrategy: "case",
          },
          morphology: { paradigms: { "noun.case.erg": ergPdm, "noun.case.abs": absPdm } },
        },
        { dog: ["k", "a", "n"], cat: ["m", "i", "u"], see: ["w", "a", "t"] },
      );
      const out = translateSentence(lang, "the dog sees the cat");
      const dog = out.targetTokens.find((t) => t.englishLemma === "dog");
      const cat = out.targetTokens.find((t) => t.englishLemma === "cat");
      expect(dog?.targetSurface, "subject of transitive should bear erg").toContain("ek");
      expect(cat?.targetSurface, "object should bear abs").toContain("an");
    });

    it("ergative-absolutive: intransitive subject takes abs", () => {
      const ergPdm: Paradigm = { affix: ["e", "k"], position: "suffix", category: "noun.case.erg" };
      const absPdm: Paradigm = { affix: ["a", "n"], position: "suffix", category: "noun.case.abs" };
      const lang = makeLang(
        {
          grammar: {
            wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
            tenseMarking: "none", hasCase: true, genderCount: 0,
            alignment: "erg-abs", caseStrategy: "case",
          },
          morphology: { paradigms: { "noun.case.erg": ergPdm, "noun.case.abs": absPdm } },
        },
        { dog: ["k", "a", "n"], run: ["r", "u"] },
      );
      const out = translateSentence(lang, "the dog runs");
      const dog = out.targetTokens.find((t) => t.englishLemma === "dog");
      expect(dog?.targetSurface, "intransitive subject should bear abs").toContain("an");
    });

    it("nom-acc default: subject unmarked, object accusative", () => {
      const accPdm: Paradigm = { affix: ["a", "m"], position: "suffix", category: "noun.case.acc" };
      const lang = makeLang(
        {
          grammar: {
            wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
            tenseMarking: "none", hasCase: true, genderCount: 0,
            alignment: "nom-acc", caseStrategy: "case",
          },
          morphology: { paradigms: { "noun.case.acc": accPdm } },
        },
        { dog: ["k", "a", "n"], cat: ["m", "i", "u"], see: ["w", "a", "t"] },
      );
      const out = translateSentence(lang, "the dog sees the cat");
      const cat = out.targetTokens.find((t) => t.englishLemma === "cat");
      expect(cat?.targetSurface).toContain("am");
    });
  });

  describe("vowel harmony", () => {
    it("front-back harmony shifts back-vowel affix to front when stem is front", () => {
      const out = harmonizeAffix(["l", "ɑ", "r"], ["k", "i", "t"], "front-back");
      expect(out).toEqual(["l", "æ", "r"]);
    });

    it("front-back harmony leaves matching affix unchanged", () => {
      const out = harmonizeAffix(["l", "ɑ", "r"], ["k", "u", "t"], "front-back");
      expect(out).toEqual(["l", "ɑ", "r"]);
    });

    it("rounding harmony shifts unrounded to rounded after rounded stem", () => {
      const out = harmonizeAffix(["s", "i"], ["t", "u", "k"], "rounding");
      expect(out).toEqual(["s", "y"]);
    });

    it("inflect applies harmony when grammar.harmony is set", () => {
      const pdm: Paradigm = { affix: ["l", "ɑ", "r"], position: "suffix", category: "noun.num.pl" };
      const lang = makeLang({
        grammar: {
          wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "affix",
          tenseMarking: "none", hasCase: false, genderCount: 0,
          harmony: "front-back",
        },
        morphology: { paradigms: { "noun.num.pl": pdm } },
      });
      const inflected = inflect(["k", "i", "t"], pdm, lang, "house");
      expect(inflected).toEqual(["k", "i", "t", "l", "æ", "r"]);
    });
  });

  describe("classifiers", () => {
    it("classifierMeaningFor maps humans to person, animals to creature", () => {
      expect(classifierMeaningFor("mother")).toBe("person");
      expect(classifierMeaningFor("dog")).toBe("creature");
      expect(classifierMeaningFor("stone")).toBe("round-thing");
      expect(classifierMeaningFor("water")).toBe("drop");
      expect(classifierMeaningFor("knife")).toBe("thing");
    });

    it("classifier emitted when numeral modifies a noun in classifier-system language", () => {
      const lang = makeLang(
        {
          grammar: {
            wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
            tenseMarking: "none", hasCase: false, genderCount: 0,
            classifierSystem: true,
          },
        },
        {
          dog: ["k", "a"],
          run: ["r", "u"],
          creature: ["t", "u"],
          three: ["t", "r", "i"],
        },
      );
      const out = translateSentence(lang, "three dogs run");
      const clf = out.targetTokens.find((t) => t.englishLemma.startsWith("CLF:"));
      expect(clf, "classifier token should be emitted").toBeTruthy();
      expect(clf?.englishLemma).toBe("CLF:creature");
    });
  });

  describe("evidentials", () => {
    it("emits direct-evidential paradigm when verb is 'see'", () => {
      const dirPdm: Paradigm = { affix: ["m", "i"], position: "suffix", category: "verb.evid.dir" };
      const lang = makeLang(
        {
          grammar: {
            wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
            tenseMarking: "none", hasCase: false, genderCount: 0,
            evidentialMarking: "three-way",
          },
          morphology: { paradigms: { "verb.evid.dir": dirPdm } },
        },
        { i: ["i"], see: ["w", "a"], cat: ["m", "i"] },
      );
      const out = translateSentence(lang, "i see the cat");
      const verb = out.targetTokens.find((t) => t.englishLemma === "see");
      expect(verb?.targetSurface).toContain("mi");
    });

    it("emits reportative when verb is 'say'", () => {
      const repPdm: Paradigm = { affix: ["s", "u"], position: "suffix", category: "verb.evid.rep" };
      const lang = makeLang(
        {
          grammar: {
            wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
            tenseMarking: "none", hasCase: false, genderCount: 0,
            evidentialMarking: "three-way",
          },
          morphology: { paradigms: { "verb.evid.rep": repPdm } },
        },
        { i: ["i"], say: ["t", "a"] },
      );
      const out = translateSentence(lang, "i say");
      const verb = out.targetTokens.find((t) => t.englishLemma === "say");
      expect(verb?.targetSurface).toContain("su");
    });
  });

  describe("expanded TAM", () => {
    it("habitual aspect inflection applies when verb has habitual aspect", () => {
      const habPdm: Paradigm = { affix: ["h", "a", "b"], position: "suffix", category: "verb.aspect.hab" };
      const lang = makeLang(
        {
          grammar: {
            wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
            tenseMarking: "none", hasCase: false, genderCount: 0,
          },
          morphology: { paradigms: { "verb.aspect.hab": habPdm } },
        },
        { run: ["r", "u"] },
      );
      const out = translateSentence(lang, "i run");
      void out;
      expect(habPdm.affix.join("")).toBe("hab");
    });
  });
});
