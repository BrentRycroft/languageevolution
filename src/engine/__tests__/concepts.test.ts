import { describe, expect, it } from "vitest";
import {
  CONCEPT_IDS,
  conceptFor,
  tierOf,
  colexWith,
  conceptsAtOrBelow,
  isRegisteredConcept,
} from "../lexicon/concepts";
import { lexicalCapacity, computeTierCandidate } from "../lexicon/tier";
import { maybeRecarve } from "../semantics/recarve";
import { makeRng } from "../rng";
import type { Language, LanguageTree } from "../types";

function testLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L-c",
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
    phonemeInventory: { segmental: ["p", "t", "a", "e", "i"], tones: [], usesTones: false },
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

describe("concept dictionary", () => {
  it("populates one Concept per BASIC_240 meaning", () => {
    // Every key in BASIC_240 should have a matching Concept entry.
    expect(CONCEPT_IDS.length).toBeGreaterThan(500);
    for (const id of CONCEPT_IDS) {
      const c = conceptFor(id);
      expect(c).toBeDefined();
      expect(c!.id).toBe(id);
      expect(c!.tier).toBeGreaterThanOrEqual(0);
      expect(c!.tier).toBeLessThanOrEqual(3);
    }
  });

  it("places water at tier 0, iron at tier 2", () => {
    expect(tierOf("water")).toBe(0);
    expect(tierOf("iron")).toBe(2);
    expect(tierOf("write")).toBe(2);
    expect(tierOf("cow")).toBe(1);
    expect(tierOf("plow")).toBe(1);
  });

  it("exposes cross-linguistic colexification hints", () => {
    // Typologically-common pairs should be linked.
    expect(colexWith("arm")).toContain("hand");
    expect(colexWith("hand")).toContain("arm");
    expect(colexWith("moon")).toContain("month");
    expect(colexWith("tongue")).toContain("word");
  });

  it("filters concepts by tier", () => {
    const tier0 = conceptsAtOrBelow(0);
    const tier2 = conceptsAtOrBelow(2);
    expect(tier0.length).toBeLessThan(tier2.length);
    expect(tier0).toContain("water");
    expect(tier0).not.toContain("iron");
    expect(tier2).toContain("iron");
  });

  it("distinguishes registered concepts from private compounds", () => {
    expect(isRegisteredConcept("water")).toBe(true);
    expect(isRegisteredConcept("water-er")).toBe(false);
    expect(isRegisteredConcept("stone-foot")).toBe(false);
  });
});

describe("lexical capacity + tier advancement", () => {
  it("grows capacity with cultural tier", () => {
    const t0 = testLang({ culturalTier: 0 });
    const t2 = testLang({ culturalTier: 2 });
    expect(lexicalCapacity(t2, 0)).toBeGreaterThan(lexicalCapacity(t0, 0));
  });

  it("population floors nudge tier up", () => {
    const lang = testLang({ speakers: 500_000, culturalTier: 0 });
    const tree: LanguageTree = {
      [lang.id]: { language: lang, parentId: null, childrenIds: [] },
    };
    const rng = makeRng("pop-seed");
    const candidate = computeTierCandidate(lang, tree, 0, rng);
    // 500k speakers → tier 2 floor via POP_TIER_FLOORS.
    expect(candidate).toBeGreaterThanOrEqual(2);
  });

  it("tier never regresses", () => {
    const lang = testLang({ speakers: 100, culturalTier: 2 });
    const tree: LanguageTree = {
      [lang.id]: { language: lang, parentId: null, childrenIds: [] },
    };
    const rng = makeRng("regress-seed");
    const candidate = computeTierCandidate(lang, tree, 1000, rng);
    expect(candidate).toBe(2);
  });
});

describe("re-carving", () => {
  it("merges two colexified concepts when both have forms", () => {
    const lang = testLang({
      lexicon: { arm: ["a", "r", "m"], hand: ["h", "a", "n", "d"] },
      wordFrequencyHints: { arm: 0.6, hand: 0.85 },
    });
    const rng = makeRng("merge-seed");
    const ev = maybeRecarve(lang, rng, 1);
    expect(ev).not.toBeNull();
    if (!ev) return;
    if (ev.kind === "merge") {
      // "hand" is the higher-frequency slot so it absorbs "arm".
      expect(ev.winner).toBe("hand");
      expect(ev.loser).toBe("arm");
      expect(lang.lexicon["hand"]).toBeDefined();
      expect(lang.lexicon["arm"]).toBeUndefined();
      expect(lang.colexifiedAs?.["hand"]).toContain("arm");
    } else {
      // Split path also valid if pairs allow — just verify state.
      expect(["arm", "hand"]).toContain(ev.source);
    }
  });

  it("splits a slot into a colex target the language lacks", () => {
    // Only one of the pair exists in the lexicon, so merge is impossible —
    // the event must take the split path or return null.
    const lang = testLang({
      lexicon: { tongue: ["t", "o", "n"] },
      wordFrequencyHints: { tongue: 0.8 },
    });
    const rng = makeRng("split-seed");
    const ev = maybeRecarve(lang, rng, 1);
    if (!ev) return;
    expect(ev.kind).toBe("split");
    if (ev.kind === "split") {
      expect(ev.source).toBe("tongue");
      expect(colexWith("tongue")).toContain(ev.newTarget!);
      expect(lang.lexicon[ev.newTarget!]).toEqual(["t", "o", "n"]);
    }
  });

  it("returns null when no colex candidates exist", () => {
    const lang = testLang({ lexicon: {} });
    const rng = makeRng("empty-seed");
    const ev = maybeRecarve(lang, rng, 1);
    expect(ev).toBeNull();
  });
});
