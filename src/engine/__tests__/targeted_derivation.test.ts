import { describe, it, expect } from "vitest";
import {
  attemptTargetedDerivation,
  recordDerivationChain,
} from "../genesis/mechanisms/targetedDerivation";
import {
  categoriesForTier,
  seedDerivationalSuffixes,
  findSuffixByCategory,
} from "../lexicon/derivation";
import { derivationFor, DERIVATION_TARGETS } from "../lexicon/derivation_targets";
import { makeRng } from "../rng";
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
    phonemeInventory: {
      segmental: ["p", "t", "k", "m", "n", "a", "i", "o", "ə"],
      tones: [],
      usesTones: false,
    },
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

describe("derivation buckets", () => {
  it("categoriesForTier returns the right set for each tier", () => {
    expect(categoriesForTier(0)).toEqual(["diminutive", "adjectival"]);
    expect(categoriesForTier(1)).toContain("agentive");
    expect(categoriesForTier(2)).toContain("abstractNoun");
    expect(categoriesForTier(2)).toContain("dominionAbstract");
    expect(categoriesForTier(3)).toContain("nominalisation");
  });

  it("seedDerivationalSuffixes generates one per supported category", () => {
    const tier2 = makeLang({ culturalTier: 2 });
    const suffixes = seedDerivationalSuffixes(tier2, makeRng("seed-2"));
    const cats = new Set(suffixes.map((s) => s.category));
    expect(cats.has("abstractNoun")).toBe(true);
    expect(cats.has("dominionAbstract")).toBe(true);
    expect(cats.has("nominalisation")).toBe(true);
    expect(cats.has("agentive")).toBe(true);
  });

  it("tier 0 has no abstractNoun suffix", () => {
    const tier0 = makeLang({ culturalTier: 0 });
    const suffixes = seedDerivationalSuffixes(tier0, makeRng("seed-0"));
    const cats = new Set(suffixes.map((s) => s.category));
    expect(cats.has("abstractNoun")).toBe(false);
    expect(cats.has("dominionAbstract")).toBe(false);
  });

  it("findSuffixByCategory returns the matching entry", () => {
    const lang = makeLang({ culturalTier: 2 });
    lang.derivationalSuffixes = seedDerivationalSuffixes(lang, makeRng("find"));
    const abstr = findSuffixByCategory(lang, "abstractNoun");
    expect(abstr).not.toBeNull();
    expect(abstr!.category).toBe("abstractNoun");
  });

  it("findSuffixByCategory returns null when no match", () => {
    const lang = makeLang({ culturalTier: 0 });
    lang.derivationalSuffixes = seedDerivationalSuffixes(lang, makeRng("none"));
    expect(findSuffixByCategory(lang, "abstractNoun")).toBeNull();
  });
});

describe("DERIVATION_TARGETS table", () => {
  it("freedom ← free + dominionAbstract", () => {
    expect(derivationFor("freedom")).toEqual({
      root: "free",
      via: "dominionAbstract",
    });
  });

  it("happiness ← happy + abstractNoun", () => {
    expect(derivationFor("happiness")).toEqual({
      root: "happy",
      via: "abstractNoun",
    });
  });

  it("teacher ← teach + agentive", () => {
    expect(derivationFor("teacher")).toEqual({
      root: "teach",
      via: "agentive",
    });
  });

  it("returns null for non-derivable concepts", () => {
    expect(derivationFor("water")).toBeNull();
    expect(derivationFor("dog")).toBeNull();
  });

  it("table contains a healthy spread of categories", () => {
    const cats = new Set(Object.values(DERIVATION_TARGETS).map((d) => d.via));
    expect(cats.size).toBeGreaterThanOrEqual(5);
    expect(cats.has("dominionAbstract")).toBe(true);
    expect(cats.has("abstractNoun")).toBe(true);
    expect(cats.has("nominalisation")).toBe(true);
    expect(cats.has("agentive")).toBe(true);
  });
});

describe("attemptTargetedDerivation", () => {
  it("composes freedom from free + dominionAbstract suffix", () => {
    const lang = makeLang({
      culturalTier: 2,
      lexicon: { free: ["f", "r", "iː"] },
    });
    lang.derivationalSuffixes = [
      { affix: ["d", "o", "m"], tag: "-dom", category: "dominionAbstract" },
    ];
    const result = attemptTargetedDerivation(lang, "freedom", makeRng("td-1"));
    expect(result).not.toBeNull();
    expect(result!.meaning).toBe("freedom");
    expect(result!.rootMeaning).toBe("free");
    expect(result!.suffixTag).toBe("-dom");
    expect(result!.form).toEqual(["f", "r", "iː", "d", "o", "m"]);
  });

  it("returns null when the language doesn't have the root", () => {
    const lang = makeLang({ culturalTier: 2 });
    lang.derivationalSuffixes = [
      { affix: ["d", "o", "m"], tag: "-dom", category: "dominionAbstract" },
    ];
    const result = attemptTargetedDerivation(lang, "freedom", makeRng("td-2"));
    expect(result).toBeNull();
  });

  it("returns null when the language has no suffix in the required category", () => {
    const lang = makeLang({
      culturalTier: 1, // no abstractNoun bucket
      lexicon: { free: ["f", "r", "iː"] },
    });
    lang.derivationalSuffixes = []; // no suffixes at all
    const result = attemptTargetedDerivation(lang, "freedom", makeRng("td-3"));
    expect(result).toBeNull();
  });

  it("returns null for meanings not in DERIVATION_TARGETS", () => {
    const lang = makeLang({
      culturalTier: 3,
      lexicon: { water: ["w", "ɔ", "t", "ə", "r"] },
    });
    lang.derivationalSuffixes = [
      { affix: ["n", "ə", "s"], tag: "-ness", category: "abstractNoun" },
    ];
    expect(attemptTargetedDerivation(lang, "water", makeRng("td-4"))).toBeNull();
  });

  it("recordDerivationChain populates wordOriginChain with from/via", () => {
    const lang = makeLang();
    recordDerivationChain(lang, {
      meaning: "freedom",
      form: ["f", "r", "iː", "d", "o", "m"],
      rootMeaning: "free",
      suffixTag: "-dom",
    });
    expect(lang.wordOriginChain?.freedom).toEqual({
      tag: "derivation",
      from: "free",
      via: "-dom",
    });
  });
});
