import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { prunePhonemes } from "../phonology/pruning";
import { makeRng } from "../rng";
import type { Language, Lexicon } from "../types";

describe("Phase 18a — quick fixes", () => {
  describe("A4/A5: English preset tier 3 + suppletion seed", () => {
    it("presetEnglish carries seedCulturalTier=3", () => {
      const cfg = presetEnglish();
      expect(cfg.seedCulturalTier).toBe(3);
    });

    it("presetEnglish carries suppletion for be / go / mouse / child / good", () => {
      const cfg = presetEnglish();
      expect(cfg.seedSuppletion).toBeDefined();
      expect(cfg.seedSuppletion!.be).toBeDefined();
      expect(cfg.seedSuppletion!.be!["verb.tense.past"]?.join("")).toBe("waz");
      expect(cfg.seedSuppletion!.go!["verb.tense.past"]?.join("")).toBe("wɛnt");
      expect(cfg.seedSuppletion!.mouse!["noun.num.pl"]?.join("")).toBe("majs");
      expect(cfg.seedSuppletion!.child!["noun.num.pl"]?.join("")).toBe("tʃɪldrən");
      expect(cfg.seedSuppletion!.good!["adj.degree.cmp"]?.join("")).toBe("bɛtər");
    });

    it("createSimulation(presetEnglish()) gives the proto language tier 3 + suppletion", () => {
      const sim = createSimulation(presetEnglish());
      const proto = sim.getState().tree["L-0"]!.language;
      expect(proto.culturalTier).toBe(3);
      expect(proto.suppletion?.be).toBeDefined();
      expect(proto.suppletion?.go).toBeDefined();
    });
  });

  describe("A4: seedCulturalTier on default config", () => {
    it("respects seedCulturalTier when overridden", () => {
      const cfg = { ...defaultConfig(), seedCulturalTier: 2 as const };
      const sim = createSimulation(cfg);
      const proto = sim.getState().tree["L-0"]!.language;
      expect(proto.culturalTier).toBe(2);
    });

    it("default config still starts at tier 0 when no override", () => {
      const sim = createSimulation(defaultConfig());
      const proto = sim.getState().tree["L-0"]!.language;
      expect(proto.culturalTier).toBe(0);
    });
  });

  describe("A3: phoneme pruning", () => {
    it("drops a rare phoneme that has a featural neighbour", () => {
      const lex: Lexicon = {
        a: ["p", "a", "t", "i", "u"],
        b: ["t", "a", "p", "e", "o"],
        c: ["k", "a", "t", "i", "e"],
        d: ["k", "a", "p", "u", "o"],
        e: ["p", "a", "k", "i", "e"],
        f: ["t", "a", "k", "u", "o"],
        g: ["m", "a", "n", "i", "e"],
        h: ["n", "a", "m", "u", "o"],
        i: ["s", "a", "t", "i", "e"],
        j: ["t", "a", "s", "u", "o"],
        k: ["m", "i", "p", "e", "n"],
        l: ["s", "u", "k", "e", "n"],
        rare: ["q", "a", "t"],
      };
      const lang: Language = {
        id: "L0",
        name: "L",
        lexicon: lex,
        enabledChangeIds: [],
        changeWeights: {},
        birthGeneration: 0,
        grammar: {
          wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
          tenseMarking: "none", hasCase: false, genderCount: 0,
        },
        events: [],
        wordFrequencyHints: {},
        phonemeInventory: {
          segmental: ["p", "t", "k", "m", "n", "s", "q", "a", "i", "u", "e", "o"],
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
      };
      const rng = makeRng("prune-1");
      let merger = null;
      for (let i = 0; i < 30 && !merger; i++) {
        merger = prunePhonemes(lang, rng);
      }
      expect(merger, "rare /q/ should be dropped").not.toBeNull();
      expect(merger!.from).toBe("q");
      expect(["k", "p", "t"]).toContain(merger!.to);
      expect(lang.phonemeInventory.segmental.includes("q")).toBe(false);
      expect(lang.lexicon.rare!.includes("q")).toBe(false);
    });

    it("does not prune when inventory is too small", () => {
      const lang: Language = {
        id: "L0",
        name: "L",
        lexicon: { a: ["p", "a"], b: ["q", "a"] },
        enabledChangeIds: [],
        changeWeights: {},
        birthGeneration: 0,
        grammar: {
          wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
          tenseMarking: "none", hasCase: false, genderCount: 0,
        },
        events: [],
        wordFrequencyHints: {},
        phonemeInventory: { segmental: ["p", "q", "a"], tones: [], usesTones: false },
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
      const rng = makeRng("prune-2");
      const merger = prunePhonemes(lang, rng);
      expect(merger).toBeNull();
    });
  });
});
