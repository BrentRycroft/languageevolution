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
import { rekeyLexiconToLexemeIds } from "../lexicon/lexemeIdentity";
import { lexGet, lexHas } from "../lexicon/access";

/**
 * concepts.test.ts
 *
 * Test suite for: "concept dictionary".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function testLang(overrides: Partial<Language> = {}): Language {
  const lang: Language = {
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
  rekeyLexiconToLexemeIds(lang);
  return lang;
}

describe("concept dictionary", () => {
  it("populates one Concept per BASIC_240 meaning", () => {
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
      expect(ev.winner).toBe("hand");
      expect(ev.loser).toBe("arm");
      expect(lexGet(lang, "hand")).toBeDefined();
      expect(lexHas(lang, "arm")).toBe(false);
      expect(lang.colexifiedAs?.["hand"]).toContain("arm");
    } else {
      expect(["arm", "hand"]).toContain(ev.source);
    }
  });

  it("splits a slot into a colex target the language lacks", () => {
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
      expect(lexGet(lang, ev.newTarget!)).toEqual(["t", "o", "n"]);
    }
  });

  it("returns null when no colex candidates exist", () => {
    const lang = testLang({ lexicon: {} });
    const rng = makeRng("empty-seed");
    const ev = maybeRecarve(lang, rng, 1);
    expect(ev).toBeNull();
  });

  it("Phase 3e: a recently-recarved pair is skipped (cooldown)", () => {
    // Same setup as the merge test above, where arm↔hand merges and arm is
    // deleted. Here the pair is pre-stamped as recarved at gen 0; within the
    // RECARVE_COOLDOWN window the same pair must NOT recarve again, so arm
    // survives instead of being merged away. This locks the anti-oscillation
    // guard (cold→cool→cold flip-flop) at the unit level.
    const lang = testLang({
      lexicon: { arm: ["a", "r", "m"], hand: ["h", "a", "n", "d"] },
      wordFrequencyHints: { arm: 0.6, hand: 0.85 },
      recarveHistory: { "arm|hand": 0 }, // key is sorted: arm < hand
    });
    const rng = makeRng("merge-seed");
    const ev = maybeRecarve(lang, rng, 1, 10); // 10 - 0 = 10 < cooldown (50)
    // The arm↔hand merge is blocked — both survive.
    expect(lexHas(lang, "arm")).toBe(true);
    expect(lexHas(lang, "hand")).toBe(true);
    // If anything fired, it cannot be the arm/hand merge.
    if (ev && ev.kind === "merge") {
      expect([ev.winner, ev.loser]).not.toContain("arm");
    }
  });
});
