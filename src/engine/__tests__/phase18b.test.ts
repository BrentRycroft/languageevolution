import { describe, it, expect } from "vitest";
import { glossToEnglish } from "../translator/glossToEnglish";
import { translateSentence } from "../translator/sentence";
import { classifyShift } from "../semantics/drift";
import { stepSemanticBleaching } from "../semantics/bleaching";
import { recomputeMorphologicalType, stepTypologyDrift } from "../grammar/typology_drift";
import { maybeVowelMutationIrregular } from "../morphology/evolve";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import type { GrammarFeatures, Language, Lexicon } from "../types";
import type { TranslatedToken } from "../translator/sentence";

function makeLang(overrides: Partial<Language> = {}, lexicon: Lexicon = {}): Language {
  return {
    id: "L-b",
    name: "Test",
    lexicon,
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
      tenseMarking: "none", hasCase: false, genderCount: 0,
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

describe("Phase 18b — deeper engine work", () => {
  describe("B1: glossToEnglish reverse translation", () => {
    it("reorders into SVO English with present 3sg", () => {
      const cfg = presetEnglish();
      const sim = createSimulation(cfg);
      const lang = sim.getState().tree["L-0"]!.language;
      const out = translateSentence(lang, "the dog sees the cat");
      const reversed = glossToEnglish(out.targetTokens);
      expect(reversed.toLowerCase()).toContain("dog");
      expect(reversed.toLowerCase()).toContain("cat");
      expect(reversed.toLowerCase()).toContain("see");
    });

    it("plural noun gloss → -s suffix", () => {
      const tokens: TranslatedToken[] = [
        { englishLemma: "dog", englishTag: "N", targetForm: [], targetSurface: "x", glossNote: "num.pl", resolution: "direct" },
        { englishLemma: "run", englishTag: "V", targetForm: [], targetSurface: "y", glossNote: "", resolution: "direct" },
      ];
      const out = glossToEnglish(tokens);
      expect(out).toContain("dogs");
    });

    it("past tense gloss → irregular pasts", () => {
      const tokens: TranslatedToken[] = [
        { englishLemma: "i", englishTag: "PRON", targetForm: [], targetSurface: "x", glossNote: "", resolution: "direct" },
        { englishLemma: "go", englishTag: "V", targetForm: [], targetSurface: "y", glossNote: "tense.past", resolution: "direct" },
      ];
      const out = glossToEnglish(tokens);
      expect(out).toContain("went");
    });

    it("irregular plural lookup (mouse → mice)", () => {
      const tokens: TranslatedToken[] = [
        { englishLemma: "mouse", englishTag: "N", targetForm: [], targetSurface: "x", glossNote: "num.pl", resolution: "direct" },
      ];
      expect(glossToEnglish(tokens)).toBe("mice");
    });
  });

  describe("B2: typology drift", () => {
    it("recomputeMorphologicalType returns 'isolating' for low synthesis", () => {
      const g = { synthesisIndex: 1.0, fusionIndex: 0.4 } as Partial<GrammarFeatures>;
      expect(recomputeMorphologicalType(g as GrammarFeatures)).toBe("isolating");
    });

    it("recomputeMorphologicalType returns 'polysynthetic' for synthesis >= 3", () => {
      const g = { synthesisIndex: 3.5, fusionIndex: 0.4 } as Partial<GrammarFeatures>;
      expect(recomputeMorphologicalType(g as GrammarFeatures)).toBe("polysynthetic");
    });

    it("recomputeMorphologicalType distinguishes agglutinating vs fusional", () => {
      const aggl = { synthesisIndex: 2.0, fusionIndex: 0.2 } as Partial<GrammarFeatures>;
      const fus = { synthesisIndex: 2.0, fusionIndex: 0.6 } as Partial<GrammarFeatures>;
      expect(recomputeMorphologicalType(aggl as GrammarFeatures)).toBe("agglutinating");
      expect(recomputeMorphologicalType(fus as GrammarFeatures)).toBe("fusional");
    });

    it("stepTypologyDrift sets morphologicalType on a fresh language", () => {
      const lang = makeLang();
      stepTypologyDrift(lang, 10);
      expect(lang.grammar.morphologicalType).toBeDefined();
    });
  });

  describe("B2: vowel-mutation irregulars", () => {
    it("maybeVowelMutationIrregular creates an ablauted plural for a high-frequency noun", () => {
      const lang = makeLang(
        {
          morphology: {
            paradigms: {
              "noun.num.pl": { affix: ["s"], position: "suffix", category: "noun.num.pl" },
            },
          },
          wordFrequencyHints: { foot: 0.95 },
        },
        { foot: ["f", "u", "t"] },
      );
      const rng = makeRng("vm-1");
      let result = null;
      for (let i = 0; i < 20 && !result; i++) {
        result = maybeVowelMutationIrregular(lang, rng, 1.0);
      }
      expect(result).not.toBeNull();
      expect(result!.meaning).toBe("foot");
      expect(lang.suppletion?.foot?.["noun.num.pl"]).toBeDefined();
    });
  });

  describe("B3: probabilistic semantic shift classification", () => {
    it("classifyShift without rng is deterministic (highest weight wins)", () => {
      const a = classifyShift("water", "fire");
      const b = classifyShift("water", "fire");
      expect(a).toBe(b);
    });

    it("classifyShift with rng can return amelioration / pejoration when register is set", () => {
      const rng = makeRng("shift-1");
      const seen = new Set<string>();
      for (let i = 0; i < 50; i++) {
        seen.add(classifyShift("water", "fire", rng, "high"));
      }
      expect(seen.size).toBeGreaterThan(1);
    });
  });

  describe("B3: semantic bleaching", () => {
    it("does nothing when no source meaning is present", () => {
      const lang = makeLang(
        {
          morphology: { paradigms: {} },
        },
        { water: ["w", "a", "t"] },
      );
      const rng = makeRng("bleach-1");
      const result = stepSemanticBleaching(lang, 12, rng);
      expect(result).toBeNull();
    });

    it("reduces frequency of grammaticalized source meaning when present", () => {
      const lang = makeLang(
        {
          morphology: {
            paradigms: {
              "verb.tense.fut": {
                affix: ["g"],
                position: "suffix",
                category: "verb.tense.fut",
                source: { meaning: "go", pathway: "motion" },
              },
            },
          },
          wordFrequencyHints: { go: 0.85 },
        },
        { go: ["g", "o"] },
      );
      const rng = makeRng("bleach-2");
      let result = null;
      for (let i = 0; i < 30 && !result; i++) {
        result = stepSemanticBleaching(lang, 6 * (i + 1), rng);
      }
      expect(result).not.toBeNull();
      expect(result!.meaning).toBe("go");
      expect(lang.wordFrequencyHints.go ?? 1).toBeLessThan(0.85);
    });
  });
});

void defaultConfig;
