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
    position: "suffix",
    usageCount: productive ? 5 : 0,
    productive,
  };
}

function prefix(tag: string, affix: string[], productive = true): DerivationalSuffix {
  return {
    affix,
    tag,
    category: "agentive",
    position: "prefix",
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

  // Phase 47 T2: prefix synthesis
  it("synthesises 'rebuild' from productive 're-' prefix + 'build'", () => {
    const lang = makeLang({
      lexicon: { build: ["b", "ɪ", "l", "d"] },
      derivationalSuffixes: [prefix("re-", ["r", "iː"])],
    });
    const result = attemptMorphologicalSynthesis(lang, "rebuild");
    expect(result).not.toBeNull();
    expect(result!.form).toEqual(["r", "iː", "b", "ɪ", "l", "d"]);
    expect(result!.parts).toHaveLength(2);
    expect(result!.parts[0]!.meaning).toBe("re-");
    expect(result!.parts[1]!.meaning).toBe("build");
    expect(result!.glossNote).toBe("re- + build");
  });

  it("synthesises 'preview' from 'pre-' + 'view'", () => {
    const lang = makeLang({
      lexicon: { view: ["v", "j", "u"] },
      derivationalSuffixes: [prefix("pre-", ["p", "r", "iː"])],
    });
    const result = attemptMorphologicalSynthesis(lang, "preview");
    expect(result).not.toBeNull();
    expect(result!.form).toEqual(["p", "r", "iː", "v", "j", "u"]);
  });

  it("rejects prefix synthesis when prefix is non-productive", () => {
    const lang = makeLang({
      lexicon: { build: ["b", "ɪ", "l", "d"] },
      derivationalSuffixes: [prefix("re-", ["r", "iː"], false)],
    });
    const result = attemptMorphologicalSynthesis(lang, "rebuild");
    expect(result).toBeNull();
  });

  it("position auto-detected from tag shape ('re-' → prefix without explicit position)", () => {
    const lang = makeLang({
      lexicon: { build: ["b", "ɪ", "l", "d"] },
      // Note: no `position` field — should be inferred from "re-" trailing hyphen.
      derivationalSuffixes: [{
        affix: ["r", "iː"],
        tag: "re-",
        category: "agentive",
        usageCount: 5,
        productive: true,
      }],
    });
    const result = attemptMorphologicalSynthesis(lang, "rebuild");
    expect(result).not.toBeNull();
    expect(result!.form).toEqual(["r", "iː", "b", "ɪ", "l", "d"]);
  });

  it("position auto-detected: '-er.agt' (leading hyphen) → suffix", () => {
    const lang = makeLang({
      lexicon: { light: ["l", "a", "j", "t"] },
      derivationalSuffixes: [{
        affix: ["ə", "r"],
        tag: "-er.agt",
        category: "agentive",
        usageCount: 5,
        productive: true,
      }],
    });
    const result = attemptMorphologicalSynthesis(lang, "lighter");
    expect(result).not.toBeNull();
    expect(result!.form).toEqual(["l", "a", "j", "t", "ə", "r"]);
  });

  it("prefix and suffix can coexist; longest-match still wins", () => {
    const lang = makeLang({
      lexicon: { build: ["b", "ɪ", "l", "d"] },
      derivationalSuffixes: [
        prefix("re-", ["r", "iː"]),
        suffix("-er.agt", ["ə", "r"]),
      ],
    });
    // "rebuilder" — both could match, but longest wins; "-er" (2 chars)
    // and "re-" (2 chars) are tied; sort is stable so first wins.
    // More important: "rebuild" picks the prefix; "builder" picks the suffix.
    const re = attemptMorphologicalSynthesis(lang, "rebuild");
    expect(re).not.toBeNull();
    expect(re!.parts[0]!.meaning).toBe("re-");
    const er = attemptMorphologicalSynthesis(lang, "builder");
    expect(er).not.toBeNull();
    expect(er!.parts[1]!.meaning).toBe("-er.agt");
  });

  // Phase 47 T3: negational rare path
  it("negational synthesis: 'unhappy' from 'un-' + 'happy' in neg mode", () => {
    const lang = makeLang({
      lexicon: { happy: ["h", "æ", "p", "i"] },
      derivationalSuffixes: [prefix("un-", ["ʌ", "n"])],
    });
    // Default mode (non-neg): "un-" excluded, returns null.
    expect(attemptMorphologicalSynthesis(lang, "unhappy")).toBeNull();
    // Explicit neg mode: "un-" eligible, fires.
    const result = attemptMorphologicalSynthesis(lang, "unhappy", "neg");
    expect(result).not.toBeNull();
    expect(result!.form).toEqual(["ʌ", "n", "h", "æ", "p", "i"]);
    expect(result!.resolution).toBe("synth-neg-affix");
  });

  it("non-neg mode excludes negational tags (un-, dis-, non-, in-, anti-, de-)", () => {
    const lang = makeLang({
      lexicon: { happy: ["h", "æ", "p", "i"] },
      derivationalSuffixes: [
        prefix("un-", ["ʌ", "n"]),
        prefix("dis-", ["d", "ɪ", "s"]),
        prefix("non-", ["n", "ɑ", "n"]),
        prefix("in-", ["ɪ", "n"]),
        prefix("anti-", ["æ", "n", "t", "i"]),
        prefix("de-", ["d", "iː"]),
      ],
    });
    expect(attemptMorphologicalSynthesis(lang, "unhappy", "non-neg")).toBeNull();
    expect(attemptMorphologicalSynthesis(lang, "dishappy", "non-neg")).toBeNull();
    expect(attemptMorphologicalSynthesis(lang, "nonhappy", "non-neg")).toBeNull();
    expect(attemptMorphologicalSynthesis(lang, "inhappy", "non-neg")).toBeNull();
    expect(attemptMorphologicalSynthesis(lang, "antihappy", "non-neg")).toBeNull();
    expect(attemptMorphologicalSynthesis(lang, "dehappy", "non-neg")).toBeNull();
  });

  it("neg mode INCLUDES negational tags but excludes ordinary affixes", () => {
    const lang = makeLang({
      lexicon: { happy: ["h", "æ", "p", "i"], light: ["l", "a", "j", "t"] },
      derivationalSuffixes: [
        prefix("un-", ["ʌ", "n"]),                  // negational
        suffix("-er.agt", ["ə", "r"]),              // non-neg
      ],
    });
    // Neg mode: "un-" fires for "unhappy"; "-er" rejected.
    expect(attemptMorphologicalSynthesis(lang, "unhappy", "neg")).not.toBeNull();
    expect(attemptMorphologicalSynthesis(lang, "lighter", "neg")).toBeNull();
  });

  it("non-productive negational prefix is rejected even in neg mode", () => {
    const lang = makeLang({
      lexicon: { happy: ["h", "æ", "p", "i"] },
      derivationalSuffixes: [prefix("un-", ["ʌ", "n"], false)], // not productive
    });
    expect(attemptMorphologicalSynthesis(lang, "unhappy", "neg")).toBeNull();
  });
});
