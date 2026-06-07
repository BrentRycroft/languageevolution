import { describe, it, expect } from "vitest";
import { inflectCascade } from "../morphology/evolve";
import type { Language } from "../types";
import type { MorphCategory } from "../morphology/types";

/**
 * inflect_cascade.test.ts
 *
 * Test suite for: "inflectCascade".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function makeLang(opts: Partial<Language> = {}): Language {
  return {
    id: "L-c",
    name: "Test",
    lexemes: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO",
      affixPosition: "suffix",
      pluralMarking: "affix",
      tenseMarking: "past",
      hasCase: false,
      genderCount: 0,
      synthesisIndex: 1.0,
      fusionIndex: 0.3,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: {
      paradigms: {
        "verb.tense.past": { affix: ["d"], position: "suffix", category: "verb.tense.past" },
        "verb.person.3sg": { affix: ["s"], position: "suffix", category: "verb.person.3sg" },
        "verb.aspect.prog": { affix: ["i", "ŋ"], position: "suffix", category: "verb.aspect.prog" },
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
    ...opts,
  };
}

describe("inflectCascade", () => {
  it("analytic language (synth=1.0) applies only the first available paradigm", () => {
    const lang = makeLang({ grammar: { ...makeLang().grammar, synthesisIndex: 1.0 } });
    const order: MorphCategory[] = ["verb.tense.past", "verb.person.3sg"];
    const result = inflectCascade(["s", "i"], order, lang, "see");
    expect(result.applied).toEqual(["verb.tense.past"]);
    expect(result.form).toEqual(["s", "i", "d"]);
  });

  it("synthetic language (synth=2.5) cascades multiple paradigms", () => {
    const lang = makeLang({ grammar: { ...makeLang().grammar, synthesisIndex: 2.5 } });
    const order: MorphCategory[] = ["verb.tense.past", "verb.person.3sg"];
    const result = inflectCascade(["s", "i"], order, lang, "see");
    expect(result.applied).toEqual(["verb.tense.past", "verb.person.3sg"]);
    expect(result.form).toEqual(["s", "i", "d", "s"]);
  });

  it("polysynthetic language (synth=3.5) cascades three paradigms", () => {
    const lang = makeLang({ grammar: { ...makeLang().grammar, synthesisIndex: 3.5 } });
    const order: MorphCategory[] = [
      "verb.tense.past",
      "verb.aspect.prog",
      "verb.person.3sg",
    ];
    const result = inflectCascade(["s", "i"], order, lang, "see");
    expect(result.applied).toEqual([
      "verb.tense.past",
      "verb.aspect.prog",
      "verb.person.3sg",
    ]);
    expect(result.form).toEqual(["s", "i", "d", "i", "ŋ", "s"]);
  });

  it("skips categories without paradigms", () => {
    const lang = makeLang({ grammar: { ...makeLang().grammar, synthesisIndex: 2.0 } });
    const order: MorphCategory[] = [
      "verb.mood.subj",
      "verb.tense.past",
      "verb.person.3sg",
    ];
    const result = inflectCascade(["s", "i"], order, lang, "see");
    expect(result.applied).toEqual(["verb.tense.past", "verb.person.3sg"]);
  });

  it("respects suppletion: irregular past replaces stem entirely", () => {
    const lang = makeLang({
      grammar: { ...makeLang().grammar, synthesisIndex: 2.0 },
      suppletion: {
        see: { "verb.tense.past": ["s", "ɔ"] },
      } as Language["suppletion"],
    });
    const order: MorphCategory[] = ["verb.tense.past", "verb.person.3sg"];
    const result = inflectCascade(["s", "i"], order, lang, "see");
    expect(result.applied[0]).toBe("verb.tense.past");
    expect(result.form.slice(0, 2)).toEqual(["s", "ɔ"]);
  });

  it("fusion (fusionIndex>=0.7) collapses a doubled phoneme at the seam", () => {
    const lang = makeLang({
      grammar: { ...makeLang().grammar, synthesisIndex: 1.0, fusionIndex: 0.8 },
    });
    // Stem ends in /d/; past affix is /d/ → seam doubling /dd/ collapses.
    const result = inflectCascade(["b", "a", "d"], ["verb.tense.past"], lang, "x");
    expect(result.applied).toEqual(["verb.tense.past"]);
    expect(result.form).toEqual(["b", "a", "d"]);
  });

  it("fusion leaves a non-doubled seam untouched", () => {
    const lang = makeLang({
      grammar: { ...makeLang().grammar, synthesisIndex: 1.0, fusionIndex: 0.8 },
    });
    const result = inflectCascade(["b", "a", "t"], ["verb.tense.past"], lang, "x");
    expect(result.form).toEqual(["b", "a", "t", "d"]);
  });

  it("returns empty applied when no paradigms exist", () => {
    const lang = makeLang({
      morphology: { paradigms: {} },
    });
    const result = inflectCascade(["s", "i"], ["verb.tense.past"], lang, "see");
    expect(result.applied).toEqual([]);
    expect(result.form).toEqual(["s", "i"]);
  });
});
