import { describe, expect, it } from "vitest";
import type { LexemeStore } from "../types";
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
import { migrateSatelliteMaps } from "../lexicon/store";
import { tForm as lexGet, tHas as lexHas } from "../lexicon/__tests__/glossSeam";
import { satGet } from "../lexicon/satellites";

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
    lexemes: {},
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
  // S2a: satellite maps supplied via overrides (e.g. wordFrequencyHints) are
  // authored gloss-keyed; re-key them to LexemeId so seam reads (recarve's
  // frequency-based winner pick) resolve, matching production storage.
  migrateSatelliteMaps(lang);
  return lang;
}

describe("concept dictionary", () => {
  it("populates one Concept per registered concept", () => {
    expect(CONCEPT_IDS.length).toBeGreaterThan(500);
    for (const id of CONCEPT_IDS) {
      const c = conceptFor(id);
      expect(c).toBeDefined();
      expect(c!.id).toBe(id);
      expect(c!.tier).toBeGreaterThanOrEqual(0);
      expect(c!.tier).toBeLessThanOrEqual(3);
    }
  });

  it("assigns coreness tiers by corpus-frequency rank (G1: geometry-derived)", () => {
    // Tiers are now corpus-rank percentile bands (top decile → 0 … rarest → 3),
    // not hand cultural-era assignment. Ultra-frequent core stays tier 0; rarer
    // material words climb. These are the derived values (re-baked for G1).
    expect(tierOf("water")).toBe(0); // ultra-core
    expect(tierOf("write")).toBe(1);
    expect(tierOf("iron")).toBe(2);
    expect(tierOf("cow")).toBe(2);
    expect(tierOf("plow")).toBe(3); // rare in the modern corpus
  });

  it("exposes geometric colexification neighbours", () => {
    // G1: colexWith is now the geometric nearest-neighbour set (replacing the
    // hand-curated cross-linguistic pairs). Neighbours are semantically near —
    // body parts cluster with body parts, astronomy with astronomy. (The set is
    // directional: a's neighbours need not list a back.)
    expect(colexWith("arm")).toContain("hand");
    expect(colexWith("tongue")).toContain("mouth");
    expect(colexWith("moon")).toContain("sun");
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
      lexemes: { arm: ["a", "r", "m"], hand: ["h", "a", "n", "d"] } as unknown as LexemeStore,
      wordFrequencyHints: { arm: 0.6, hand: 0.85 } as Record<string, number>,
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
      expect(satGet(lang, "colexifiedAs", "hand")).toContain("arm");
    } else {
      expect(["arm", "hand"]).toContain(ev.source);
    }
  });

  it("splits a slot into a colex target the language lacks", () => {
    const lang = testLang({
      lexemes: { tongue: ["t", "o", "n"] } as unknown as LexemeStore,
      wordFrequencyHints: { tongue: 0.8 } as Record<string, number>,
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
    const lang = testLang({ lexemes: {} });
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
      lexemes: { arm: ["a", "r", "m"], hand: ["h", "a", "n", "d"] } as unknown as LexemeStore,
      wordFrequencyHints: { arm: 0.6, hand: 0.85 } as Record<string, number>,
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
