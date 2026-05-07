import { describe, it, expect } from "vitest";
import { attemptMorphologicalSynthesis } from "../lexicon/synthesis";
import type { Language } from "../types";
import type { DerivationalSuffix } from "../lexicon/derivation";

/**
 * Phase 47 T1: morphological synthesis acceptance tests.
 *
 * The simulator should be able to compose unattested derived forms
 * on the fly when the language has the stem in lexicon and a
 * productive matching affix in `derivationalSuffixes`.
 */

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

function suffix(tag: string, affix: string[], productive = true): DerivationalSuffix {
  return {
    affix,
    tag,
    category: "agentive",
    usageCount: productive ? 5 : 0,
    productive,
  };
}

describe("Phase 47 T1 — morphological synthesis", () => {
  it("synthesises 'lighter' from 'light' + productive '-er.agt'", () => {
    const lang = makeLang({
      lexicon: { light: ["l", "a", "j", "t"] },
      derivationalSuffixes: [suffix("-er.agt", ["ə", "r"])],
    });
    const result = attemptMorphologicalSynthesis(lang, "lighter");
    expect(result).not.toBeNull();
    expect(result!.form).toEqual(["l", "a", "j", "t", "ə", "r"]);
    expect(result!.parts).toHaveLength(2);
    expect(result!.parts[0]!.meaning).toBe("light");
    expect(result!.parts[1]!.meaning).toBe("-er.agt");
    expect(result!.glossNote).toBe("light + -er.agt");
    expect(result!.resolution).toBe("synth-affix");
  });

  it("synthesises 'kindness' from 'kind' + productive '-ness'", () => {
    const lang = makeLang({
      lexicon: { kind: ["k", "a", "j", "n", "d"] },
      derivationalSuffixes: [suffix("-ness", ["n", "ə", "s"])],
    });
    const result = attemptMorphologicalSynthesis(lang, "kindness");
    expect(result).not.toBeNull();
    expect(result!.form).toEqual(["k", "a", "j", "n", "d", "n", "ə", "s"]);
    expect(result!.glossNote).toBe("kind + -ness");
  });

  it("returns null when stem is missing from lexicon", () => {
    const lang = makeLang({
      lexicon: {},
      derivationalSuffixes: [suffix("-er.agt", ["ə", "r"])],
    });
    const result = attemptMorphologicalSynthesis(lang, "lighter");
    expect(result).toBeNull();
  });

  it("returns null when no productive affix matches", () => {
    const lang = makeLang({
      lexicon: { light: ["l", "a", "j", "t"] },
      derivationalSuffixes: [suffix("-ness", ["n", "ə", "s"])], // wrong suffix
    });
    const result = attemptMorphologicalSynthesis(lang, "lighter");
    expect(result).toBeNull();
  });

  it("rejects non-productive affixes (productivity gate)", () => {
    const lang = makeLang({
      lexicon: { light: ["l", "a", "j", "t"] },
      derivationalSuffixes: [suffix("-er.agt", ["ə", "r"], false)], // not productive
    });
    const result = attemptMorphologicalSynthesis(lang, "lighter");
    expect(result).toBeNull();
  });

  it("returns null when language has no derivationalSuffixes", () => {
    const lang = makeLang({
      lexicon: { light: ["l", "a", "j", "t"] },
    });
    const result = attemptMorphologicalSynthesis(lang, "lighter");
    expect(result).toBeNull();
  });

  it("greedy longest-match: prefers longer suffix when both apply", () => {
    // "happiness" could match both "-ness" (stem "happi") and "-ess"
    // (stem "happin"). Longest-match should pick "-ness".
    const lang = makeLang({
      lexicon: { happi: ["h", "æ", "p", "i"] }, // synthetic stem
      derivationalSuffixes: [
        suffix("-ess", ["e", "s"]),
        suffix("-ness", ["n", "ə", "s"]),
      ],
    });
    const result = attemptMorphologicalSynthesis(lang, "happiness");
    expect(result).not.toBeNull();
    expect(result!.parts[0]!.meaning).toBe("happi");
    expect(result!.parts[1]!.meaning).toBe("-ness");
  });

  it("returns null when lemma equals the suffix (no stem)", () => {
    const lang = makeLang({
      lexicon: { er: ["ə", "r"] },
      derivationalSuffixes: [suffix("-er.agt", ["ə", "r"])],
    });
    const result = attemptMorphologicalSynthesis(lang, "er");
    expect(result).toBeNull();
  });

  it("returns null when affix has empty form", () => {
    const lang = makeLang({
      lexicon: { light: ["l", "a", "j", "t"] },
      derivationalSuffixes: [suffix("-er.agt", [])],
    });
    const result = attemptMorphologicalSynthesis(lang, "lighter");
    expect(result).toBeNull();
  });
});
