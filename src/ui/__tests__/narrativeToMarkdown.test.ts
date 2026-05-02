import { describe, it, expect } from "vitest";
import { narrativeToMarkdown } from "../CompareView";
import type { Language } from "../../engine/types";

function makeLang(): Language {
  return {
    id: "L",
    name: "Old Englisc",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SOV",
      affixPosition: "suffix",
      pluralMarking: "affix",
      tenseMarking: "past",
      hasCase: true,
      genderCount: 3,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: {
      paradigms: {
        "noun.num.pl": { affix: ["s"], position: "suffix", category: "noun.num.pl" },
        "verb.tense.past": { affix: ["d"], position: "suffix", category: "verb.tense.past" },
      },
    },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    culturalTier: 1,
  };
}

describe("narrativeToMarkdown", () => {
  it("emits a header with metadata + blockquoted lines", () => {
    const md = narrativeToMarkdown({
      lang: makeLang(),
      lines: [
        { text: "se hund seah þone cat", gloss: "the dog saw the cat" },
        { text: "se cyning slæpð", gloss: "the king sleeps" },
      ],
      genre: "myth",
      seed: "test-seed",
      generation: 42,
    });
    expect(md).toContain("# Old Englisc");
    expect(md).toContain("- generation: 42");
    expect(md).toContain("- genre: myth");
    expect(md).toContain("- seed: test-seed");
    expect(md).toContain("- word order: SOV");
    expect(md).toContain("- paradigms: 2");
    expect(md).toContain("- tier: 1");
    expect(md).toContain("**se hund seah þone cat**");
    expect(md).toContain("*the dog saw the cat*");
    expect(md).toContain("**se cyning slæpð**");
  });

  it("handles empty narrative gracefully", () => {
    const md = narrativeToMarkdown({
      lang: makeLang(),
      lines: [],
      genre: "daily",
      seed: "empty",
      generation: 0,
    });
    expect(md).toContain("# Old Englisc");
    expect(md).toContain("- genre: daily");
    // No body content, but the header separator should still be there.
    expect(md).toContain("---");
  });

  it("includes the genre 'skeleton' when comparing legacy mode", () => {
    const md = narrativeToMarkdown({
      lang: makeLang(),
      lines: [{ text: "x y z", gloss: "a b c" }],
      genre: "skeleton",
      seed: "s",
      generation: 1,
    });
    expect(md).toContain("- genre: skeleton");
  });
});
