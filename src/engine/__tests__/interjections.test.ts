import { describe, it, expect } from "vitest";
import { translateSentence, tokeniseEnglish } from "../translator/sentence";
import type { Language, Lexicon } from "../types";

function makeLang(overrides: Partial<Language> = {}, lexicon: Lexicon = {}): Language {
  return {
    id: "L-i",
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
    phonemeInventory: { segmental: ["p", "t", "k", "a", "e", "i", "o", "u", "m", "n", "s"], tones: [], usesTones: false },
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

describe("interjection handling", () => {
  it("'yes' is tagged PUNCT, not as plural noun 'ye'", () => {
    const tokens = tokeniseEnglish("yes");
    expect(tokens.length).toBe(1);
    expect(tokens[0]!.tag).toBe("PUNCT");
    expect(tokens[0]!.lemma).toBe("yes");
  });

  it("'no' is tagged PUNCT (was previously DET-determiner conflict)", () => {
    const tokens = tokeniseEnglish("no");
    expect(tokens.length).toBe(1);
    expect(["PUNCT", "DET"]).toContain(tokens[0]!.tag);
  });

  it("translateSentence resolves 'yes' to a per-language form, not unresolved", () => {
    const lang = makeLang();
    const out = translateSentence(lang, "yes");
    expect(out.missing.length, "yes should not be flagged unresolved").toBe(0);
    expect(out.targetTokens.length).toBeGreaterThan(0);
    const tok = out.targetTokens[0]!;
    expect(tok.targetForm.length).toBeGreaterThan(0);
    expect(tok.glossNote).toBe("interj");
    expect(tok.resolution).toBe("concept");
  });

  it("uses lexicon entry for interjection if present", () => {
    const lang = makeLang({}, { yes: ["a", "j", "e"] });
    const out = translateSentence(lang, "yes");
    const tok = out.targetTokens[0]!;
    expect(tok.targetForm).toEqual(["a", "j", "e"]);
    expect(tok.resolution).toBe("direct");
  });

  it("'hello' resolves without flagging as missing", () => {
    const lang = makeLang();
    const out = translateSentence(lang, "hello");
    expect(out.missing.length).toBe(0);
  });

  it("interjection in a sentence does not break parse", () => {
    const lang = makeLang({}, { i: ["i"], speak: ["t", "a"] });
    const out = translateSentence(lang, "yes i speak");
    expect(out.missing.length).toBe(0);
    expect(out.targetTokens.some((t) => t.englishLemma === "yes")).toBe(true);
  });
});
