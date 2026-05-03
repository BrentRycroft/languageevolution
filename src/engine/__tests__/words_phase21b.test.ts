import { describe, it, expect } from "vitest";
import {
  addWord,
  disambiguateSense,
} from "../lexicon/word";
import {
  buildReverseIndex,
  reverseParseToTokens,
} from "../translator/sentence";
import { reverseLookupForm, reverseTranslate } from "../translator/reverse";
import type { Language } from "../types";

function makeLang(overrides: Partial<Language> = {}): Language {
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
    ...overrides,
  };
}

describe("Phase 21b — disambiguateSense", () => {
  it("returns the sole candidate when there's only one", () => {
    const lang = makeLang();
    expect(disambiguateSense(lang, ["dog"])).toBe("dog");
  });

  it("prefers the discourse topic when it's among the candidates", () => {
    const lang = makeLang({
      wordFrequencyHints: { "bank.financial": 0.9, "bank.river": 0.1 },
    });
    // Even though .financial has higher frequency, the discourse topic
    // should win.
    const picked = disambiguateSense(lang, ["bank.financial", "bank.river"], {
      discourseTopic: "bank.river",
    });
    expect(picked).toBe("bank.river");
  });

  it("uses semantic-context overlap to pick a sense", () => {
    const lang = makeLang({
      localNeighbors: {
        "bank.financial": ["money", "loan"],
        "bank.river": ["water", "stream"],
      },
    });
    // Context is finance-y → financial sense wins.
    const pickedFin = disambiguateSense(
      lang,
      ["bank.financial", "bank.river"],
      { contextLemmas: ["money", "loan"] },
    );
    expect(pickedFin).toBe("bank.financial");
    // Context is water-y → river sense wins.
    const pickedRiv = disambiguateSense(
      lang,
      ["bank.financial", "bank.river"],
      { contextLemmas: ["water", "stream"] },
    );
    expect(pickedRiv).toBe("bank.river");
  });

  it("falls back to highest-frequency sense when context is uninformative", () => {
    const lang = makeLang({
      wordFrequencyHints: { "bank.financial": 0.9, "bank.river": 0.2 },
    });
    const picked = disambiguateSense(lang, ["bank.financial", "bank.river"]);
    expect(picked).toBe("bank.financial");
  });

  it("alphabetic tiebreak when frequencies are equal and no context", () => {
    const lang = makeLang();
    expect(
      disambiguateSense(lang, ["zebra", "antelope", "monkey"]),
    ).toBe("antelope");
  });

  it("throws on empty candidate list (programmer error)", () => {
    const lang = makeLang();
    expect(() => disambiguateSense(lang, [])).toThrow();
  });
});

describe("Phase 21b — buildReverseIndex returns Meaning[]", () => {
  it("a homonym surface returns all senses", () => {
    const lang = makeLang({
      lexicon: {
        "bank.financial": ["b", "æ", "ŋ", "k"],
        "bank.river": ["b", "æ", "ŋ", "k"],
      },
    });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    const index = buildReverseIndex(lang);
    const senses = index.get("bæŋk")!;
    expect(senses).toBeDefined();
    expect(senses.sort()).toEqual(["bank.financial", "bank.river"]);
  });

  it("a single-sense surface returns a one-element array", () => {
    const lang = makeLang({
      lexicon: { dog: ["d", "ɔ", "g"] },
    });
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    const index = buildReverseIndex(lang);
    expect(index.get("dɔg")).toEqual(["dog"]);
  });

  it("works on pre-Phase-21 saves with no words field (falls back to lexicon)", () => {
    const lang = makeLang({
      lexicon: { dog: ["d", "ɔ", "g"], cat: ["k", "æ", "t"] },
    });
    // No words field; reverseIndex still functions via the lexicon.
    expect(lang.words).toBeUndefined();
    const index = buildReverseIndex(lang);
    expect(index.get("dɔg")).toEqual(["dog"]);
    expect(index.get("kæt")).toEqual(["cat"]);
  });

  it("includes altForms as additional surface entries", () => {
    const lang = makeLang({
      lexicon: { horse: ["h", "ɔ", "r", "s"] },
      altForms: { horse: [["s", "t", "iː", "d"]] },
    });
    addWord(lang, ["h", "ɔ", "r", "s"], "horse", { bornGeneration: 0 });
    const index = buildReverseIndex(lang);
    expect(index.get("hɔrs")).toEqual(["horse"]);
    expect(index.get("stiːd")).toEqual(["horse"]);
  });
});

describe("Phase 21b — reverseParseToTokens disambiguates polysemous forms", () => {
  it("a polysemous surface is disambiguated by the sentence context", () => {
    const lang = makeLang({
      lexicon: {
        "bank.financial": ["b", "æ", "ŋ", "k"],
        "bank.river": ["b", "æ", "ŋ", "k"],
        money: ["m", "ʌ", "n", "i"],
        water: ["w", "ɔ", "t", "ə"],
      },
      localNeighbors: {
        "bank.financial": ["money"],
        "bank.river": ["water"],
      },
    });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    addWord(lang, ["m", "ʌ", "n", "i"], "money", { bornGeneration: 0 });
    addWord(lang, ["w", "ɔ", "t", "ə"], "water", { bornGeneration: 0 });
    // Sentence with "money" → bank.financial picked.
    const finOut = reverseParseToTokens(lang, "bæŋk mʌni");
    const bankTokFin = finOut.find((t) => t.targetSurface === "bæŋk")!;
    expect(bankTokFin.englishLemma).toBe("bank.financial");
    expect(bankTokFin.glossNote).toContain("bank.river");
    // Sentence with "water" → bank.river picked.
    const rivOut = reverseParseToTokens(lang, "bæŋk wɔtə");
    const bankTokRiv = rivOut.find((t) => t.targetSurface === "bæŋk")!;
    expect(bankTokRiv.englishLemma).toBe("bank.river");
    expect(bankTokRiv.glossNote).toContain("bank.financial");
  });

  it("an unknown surface is tagged fallback", () => {
    const lang = makeLang({ lexicon: { dog: ["d", "ɔ", "g"] } });
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    const out = reverseParseToTokens(lang, "xyzzy");
    expect(out[0]!.englishLemma).toBe("?");
    expect(out[0]!.resolution).toBe("fallback");
  });
});

describe("Phase 21b — reverseLookupForm exposes alternateLemmas", () => {
  it("a multi-meaning form reports the picked lemma + alternates", () => {
    const lang = makeLang({
      lexicon: {
        "bank.financial": ["b", "æ", "ŋ", "k"],
        "bank.river": ["b", "æ", "ŋ", "k"],
      },
      wordFrequencyHints: { "bank.financial": 0.8, "bank.river": 0.2 },
    });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    const tok = reverseLookupForm(lang, "bæŋk");
    expect(tok.lemma).toBe("bank.financial"); // higher frequency wins
    expect(tok.alternateLemmas).toEqual(["bank.river"]);
  });

  it("a single-sense form has no alternateLemmas field", () => {
    const lang = makeLang({ lexicon: { dog: ["d", "ɔ", "g"] } });
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    const tok = reverseLookupForm(lang, "dɔg");
    expect(tok.lemma).toBe("dog");
    expect(tok.alternateLemmas).toBeUndefined();
  });
});

describe("Phase 21b — reverseTranslate gathers two-pass context", () => {
  it("an unambiguous neighbor in the same sentence drives disambiguation of a polysemous form", () => {
    const lang = makeLang({
      lexicon: {
        "bank.financial": ["b", "æ", "ŋ", "k"],
        "bank.river": ["b", "æ", "ŋ", "k"],
        money: ["m", "ʌ", "n", "i"],
      },
      localNeighbors: { "bank.financial": ["money"] },
    });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    addWord(lang, ["m", "ʌ", "n", "i"], "money", { bornGeneration: 0 });
    const out = reverseTranslate(lang, "bæŋk mʌni");
    const bankTok = out.tokens.find((t) => t.target === "bæŋk")!;
    expect(bankTok.lemma).toBe("bank.financial");
    expect(bankTok.alternateLemmas).toEqual(["bank.river"]);
  });
});
