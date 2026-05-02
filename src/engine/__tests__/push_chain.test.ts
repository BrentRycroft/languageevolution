import { describe, it, expect } from "vitest";
import { proposePushChain } from "../phonology/propose";
import type { GeneratedRule } from "../phonology/generated";
import type { Language } from "../types";

function makeLang(segmental: string[]): Language {
  return {
    id: "L",
    name: "T",
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
    phonemeInventory: { segmental, tones: [], usesTones: false },
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

function vowelRaise(from: string, to: string): GeneratedRule {
  return {
    id: "vowel_shift.single_raise.test",
    family: "vowel_shift",
    templateId: "vowel_shift.single_raise",
    description: `${from} → ${to}`,
    from: { type: "vowel" },
    context: { locus: "any" },
    outputMap: { [from]: to },
    birthGeneration: 0,
    lastFireGeneration: 0,
    strength: 0.3,
  };
}

function devoicing(): GeneratedRule {
  return {
    id: "devoicing.bdg.test",
    family: "fortition",
    templateId: "devoicing.bdg",
    description: "b/d/g → p/t/k",
    from: { type: "consonant" },
    context: { locus: "any" },
    outputMap: { b: "p", d: "t", g: "k" },
    birthGeneration: 0,
    lastFireGeneration: 0,
    strength: 0.3,
  };
}

describe("proposePushChain", () => {
  it("vowel chain: a→e pushes existing /e/ further up if its target is free", () => {
    // Inventory has e but not i, and the rule is a → e — push e up to i.
    const lang = makeLang(["e", "a"]);
    const seed = vowelRaise("a", "e");
    const out = proposePushChain(lang, seed, 1);
    expect(out).not.toBeNull();
    expect(out!.outputMap["e"]).toBeDefined();
    expect(out!.family).toBe("vowel_shift");
  });

  it("vowel chain: returns null when push target already in inventory (collision)", () => {
    // Inventory has e AND its push target i — no room to chain.
    const lang = makeLang(["i", "e", "a"]);
    const seed = vowelRaise("a", "e");
    const out = proposePushChain(lang, seed, 1);
    expect(out).toBeNull();
  });

  it("consonant chain: devoicing b→p pushes existing /p/ to /f/ (lenition)", () => {
    const lang = makeLang(["p", "t", "k", "b", "d", "g", "a", "i"]);
    const out = proposePushChain(lang, devoicing(), 5);
    expect(out).not.toBeNull();
    // One of p/t/k should push to its lenition target.
    const map = out!.outputMap;
    const keys = Object.keys(map);
    expect(keys.length).toBe(1);
    const k = keys[0]!;
    expect(["p", "t", "k"]).toContain(k);
    // Their lenition steps:
    const expected: Record<string, string> = { p: "f", t: "θ", k: "h" };
    expect(map[k]).toBe(expected[k]);
  });

  it("consonant chain: returns null if the lenition target is already in inventory", () => {
    // Inventory already has /f/ /θ/ /h/ — every push collides.
    const lang = makeLang(["p", "t", "k", "f", "θ", "h", "a"]);
    const out = proposePushChain(lang, devoicing(), 5);
    expect(out).toBeNull();
  });

  it("returns null for an unrelated rule family (e.g. metathesis)", () => {
    const lang = makeLang(["p", "t", "k", "a"]);
    const seed: GeneratedRule = {
      id: "metathesis.test",
      family: "metathesis",
      templateId: "metathesis.x",
      description: "metathesis test",
      from: { type: "consonant" },
      context: { locus: "any" },
      outputMap: {},
      birthGeneration: 0,
      lastFireGeneration: 0,
      strength: 0.3,
    };
    expect(proposePushChain(lang, seed, 1)).toBeNull();
  });
});
