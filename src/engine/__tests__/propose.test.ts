import { describe, it, expect } from "vitest";
import { proposeOneRule, ageAndRetire, reinforce } from "../phonology/propose";
import { makeRng } from "../rng";
import type { Language } from "../types";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { DEFAULT_OT_RANKING } from "../phonology/ot";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";

function sampleLang(): Language {
  const inv = ["p", "t", "k", "b", "d", "g", "a", "e", "i", "o", "u", "s", "n", "m", "h"];
  return {
    id: "L-0",
    name: "Sample",
    lexicon: {
      water: ["p", "a", "t", "a"],
      fire: ["k", "i", "s"],
      stone: ["t", "o", "n"],
      tree: ["b", "e", "d"],
      sun: ["a", "g", "a"],
    },
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: inv, tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    ruleBias: { ...DEFAULT_RULE_BIAS },
    registerOf: {},
    orthography: {},
    otRanking: DEFAULT_OT_RANKING.slice(),
    lastChangeGeneration: {},
  };
}

describe("phonology/propose", () => {
  it("proposeOneRule produces a valid rule against a rich inventory", () => {
    const rng = makeRng("prop");
    const lang = sampleLang();
    const rule = proposeOneRule(lang, rng, 10);
    expect(rule).not.toBeNull();
    if (!rule) return;
    expect(rule.birthGeneration).toBe(10);
    expect(rule.strength).toBeGreaterThan(0);
    expect(rule.strength).toBeLessThan(1);
    expect(Object.keys(rule.outputMap).length).toBeGreaterThan(0);
  });

  it("ageAndRetire decays dormant rules until they retire", () => {
    const lang = sampleLang();
    const rng = makeRng("age");
    const rule = proposeOneRule(lang, rng, 0);
    if (!rule) return;
    lang.activeRules = [{ ...rule, strength: 0.06, lastFireGeneration: 0 }];
    // Empty the lexicon so the rule has no matches -> strength decays fast.
    lang.lexicon = {};
    const { retired } = ageAndRetire(lang, 10);
    expect(retired.length).toBe(1);
    expect(lang.activeRules.length).toBe(0);
    expect((lang.retiredRules ?? []).length).toBe(1);
  });

  it("reinforce increases strength and updates lastFire", () => {
    const lang = sampleLang();
    const rng = makeRng("rein");
    const rule = proposeOneRule(lang, rng, 0);
    if (!rule) return;
    const grown = reinforce(rule, 5);
    expect(grown.strength).toBeGreaterThan(rule.strength);
    expect(grown.lastFireGeneration).toBe(5);
  });

  it("proposeOneRule returns null when activeRules is saturated", () => {
    const rng = makeRng("sat");
    const lang = sampleLang();
    // Fill the active-rules buffer with junk.
    lang.activeRules = Array.from({ length: 9 }, (_v, i) => ({
      id: `x.${i}`,
      family: "lenition",
      templateId: "x",
      description: "x",
      birthGeneration: 0,
      strength: 0.5,
      lastFireGeneration: 0,
      from: { type: "consonant" },
      context: {},
      outputMap: {},
    }));
    expect(proposeOneRule(lang, rng, 1)).toBeNull();
  });
});
