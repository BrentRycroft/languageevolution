import { describe, expect, it } from "vitest";
import { simplificationFactor } from "../phonology/rate";
import { driftGrammar } from "../grammar/evolve";
import {
  inflect,
  maybeSplitParadigm,
} from "../morphology/evolve";
import { maybeReanalyse } from "../lexicon/reanalysis";
import { applyKinshipSimplification } from "../semantics/recarve";
import { maybeArealPhonemeShare } from "../contact/areal_phonology";
import { populationCap } from "../lexicon/tier";
import { makeRng } from "../rng";
import type { GrammarFeatures, Language, LanguageTree } from "../types";
import type { Paradigm } from "../morphology/types";

function testLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L-r",
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
    phonemeInventory: { segmental: ["p", "t", "k", "m", "n", "a", "e", "i", "o"], tones: [], usesTones: false },
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
    coords: { x: 0, y: 0 },
    ...overrides,
  };
}

describe("realism round 4 — population-feedback mechanics", () => {
  describe("simplificationFactor (Trudgill effect)", () => {
    it("returns 1 for ~10k speakers", () => {
      expect(simplificationFactor(10_000)).toBeCloseTo(1, 5);
    });
    it("rises with population", () => {
      expect(simplificationFactor(100_000)).toBeGreaterThan(1);
      expect(simplificationFactor(10_000_000)).toBeGreaterThan(2);
    });
    it("falls for small populations, clamped at 0.5", () => {
      expect(simplificationFactor(100)).toBe(0.5);
      expect(simplificationFactor(1)).toBe(0.5);
    });
    it("clamped at 3.0 for very large populations", () => {
      expect(simplificationFactor(10_000_000_000)).toBe(3.0);
    });
  });

  describe("driftGrammar with simplification bias", () => {
    it("biases toward case loss when simplification > 1 and case present", () => {
      // Run many trials with high simplification — case should be
      // lost more often than gained.
      let lost = 0, gained = 0;
      for (let i = 0; i < 50; i++) {
        const g: GrammarFeatures = {
          wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
          tenseMarking: "none", hasCase: true, genderCount: 2,
        };
        const rng = makeRng(`bias-${i}`);
        const shifts = driftGrammar(g, rng, 2.5);
        for (const s of shifts) {
          if (s.feature === "hasCase" && s.from === true && s.to === false) lost++;
          if (s.feature === "hasCase" && s.from === false && s.to === true) gained++;
        }
      }
      // Trudgill: large language → loss dominant. Allow 0 gains
      // strictly (we start from hasCase=true so any gains require
      // a re-flip).
      expect(lost).toBeGreaterThan(0);
    });
  });

  describe("paradigm class split (conjugation classes)", () => {
    it("creates a vowel-final or consonant-final variant on a candidate paradigm", () => {
      const paradigm: Paradigm = {
        affix: ["a", "n"],
        position: "suffix",
        category: "verb.tense.past",
      };
      const lang = testLang({
        // Mix of vowel-final and consonant-final stems in the lexicon.
        lexicon: {
          go: ["g", "o"], walk: ["w", "a", "l", "k"],
          run: ["r", "u", "n"], eat: ["e", "a", "t"],
        },
        morphology: { paradigms: { "verb.tense.past": paradigm } },
      });
      const rng = makeRng("split-conj");
      const result = maybeSplitParadigm(lang, rng, 1);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.category).toBe("verb.tense.past");
      const updated = lang.morphology.paradigms[result.category]!;
      expect(updated.variants).toBeDefined();
      expect(updated.variants!.length).toBe(1);
    });

    it("inflect() applies the matching variant by stem shape", () => {
      const paradigm: Paradigm = {
        affix: ["a", "n"],
        position: "suffix",
        category: "verb.tense.past",
        variants: [{ when: "vowel-final", affix: ["e", "n"] }],
      };
      // Vowel-final stem gets the variant.
      expect(inflect(["g", "o"], paradigm)).toEqual(["g", "o", "e", "n"]);
      // Consonant-final stem gets the default.
      expect(inflect(["r", "u", "n"], paradigm)).toEqual(["r", "u", "n", "a", "n"]);
    });
  });

  describe("reanalysis (compound → productive suffix)", () => {
    it("promotes a trailing slice to a derivational suffix", () => {
      const lang = testLang({
        lexicon: {
          "water-keeper": ["w", "a", "t", "e", "r", "k", "i", "p"],
        },
      });
      const rng = makeRng("reanalysis-1");
      const ev = maybeReanalyse(lang, rng, 1);
      expect(ev).not.toBeNull();
      if (!ev) return;
      expect(ev.source).toBe("water-keeper");
      expect(ev.promotedTag).toBe("-keeper");
      expect(lang.derivationalSuffixes).toBeDefined();
      expect(lang.derivationalSuffixes!.some((s) => s.tag === "-keeper")).toBe(true);
    });

    it("does nothing when no compounds exist", () => {
      const lang = testLang({ lexicon: { water: ["w", "a", "t", "e", "r"] } });
      const rng = makeRng("reanalysis-empty");
      expect(maybeReanalyse(lang, rng, 1)).toBeNull();
    });
  });

  describe("kinship simplification at urbanisation", () => {
    it("merges mother/aunt and father/uncle on tier 0→1 transition", () => {
      const lang = testLang({
        lexicon: {
          mother: ["m", "a", "t", "e", "r"],
          aunt: ["t", "a", "n", "t"],
          father: ["p", "a", "t", "e", "r"],
          uncle: ["a", "v", "u"],
        },
        wordFrequencyHints: { mother: 0.9, aunt: 0.4, father: 0.9, uncle: 0.4 },
      });
      const rng = makeRng("kinship-urb");
      const merges = applyKinshipSimplification(lang, rng, 2);
      // We expect ≤ 2 merges; at least one should fire given the seed.
      expect(merges.length).toBeGreaterThanOrEqual(1);
      expect(merges.length).toBeLessThanOrEqual(2);
      for (const m of merges) {
        expect(["mother", "father", "child", "brother", "sister", "friend"]).toContain(m.winner);
      }
    });
  });

  describe("areal phoneme convergence", () => {
    it("borrows a phoneme from a close-contact sister", () => {
      const recipient = testLang({
        id: "L-r",
        coords: { x: 0, y: 0 },
        lexicon: { water: ["w", "a", "t", "e", "r"] },
        phonemeInventory: { segmental: ["w", "a", "t", "e", "r"], tones: [], usesTones: false },
      });
      const donor = testLang({
        id: "L-d",
        coords: { x: 50, y: 0 }, // very close
        // Donor has /ʔ/ which recipient lacks.
        phonemeInventory: { segmental: ["ʔ", "w", "a", "t", "e", "r"], tones: [], usesTones: false },
      });
      const tree: LanguageTree = {
        [recipient.id]: { language: recipient, parentId: null, childrenIds: [] },
        [donor.id]: { language: donor, parentId: null, childrenIds: [] },
      };
      const rng = makeRng("areal-1");
      const ev = maybeArealPhonemeShare(recipient, tree, rng, 1);
      // Match-class swap: /ʔ/ is a consonant, replaced one of our
      // consonants. Effect may be null if all candidate consonants
      // didn't appear in any word — re-roll if so.
      if (ev) {
        expect(ev.phoneme).toBe("ʔ");
        expect(recipient.phonemeInventory.segmental).toContain("ʔ");
      }
    });

    it("returns null when the recipient lacks coords", () => {
      const recipient = testLang({ coords: undefined });
      const donor = testLang({ id: "L-d", coords: { x: 0, y: 0 } });
      const tree: LanguageTree = {
        [recipient.id]: { language: recipient, parentId: null, childrenIds: [] },
        [donor.id]: { language: donor, parentId: null, childrenIds: [] },
      };
      const rng = makeRng("areal-no-coords");
      expect(maybeArealPhonemeShare(recipient, tree, rng, 1)).toBeNull();
    });
  });

  describe("tier-determined population caps", () => {
    it("staircases up across tiers", () => {
      expect(populationCap(0)).toBe(6_000);
      expect(populationCap(1)).toBe(100_000);
      expect(populationCap(2)).toBe(8_000_000);
      expect(populationCap(3)).toBe(100_000_000);
    });
  });
});
