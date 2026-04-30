import { describe, expect, it } from "vitest";
import { changesForLang } from "../steps/helpers";
import { applyPhonologyToAffixes, maybeSplitParadigm, inflect } from "../morphology/evolve";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { GENESIS_BY_ID } from "../genesis/catalog";
import { stepPhonology } from "../steps/phonology";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import type { Language, SimulationState } from "../types";
import type { Paradigm } from "../morphology/types";

function testLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L-int",
    name: "Test",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none",
      tenseMarking: "none", hasCase: false, genderCount: 0,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["p", "t", "k", "m", "n", "a", "e", "i", "o", "u"], tones: [], usesTones: false },
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

describe("cross-feature integration", () => {
  describe("stress pattern × unstressed reduction", () => {
    it("changesForLang specialises UNSTRESSED_REDUCTION to the language's pattern", () => {
      const lang = testLang({
        stressPattern: "initial",
        enabledChangeIds: ["stress.unstressed_reduction"],
      });
      const changes = changesForLang(lang);
      const reduction = changes.find((c) => c.id === "stress.unstressed_reduction");
      expect(reduction).toBeDefined();
      const probe = ["k", "a", "l", "e", "t", "i"];
      const rng = makeRng("stress-probe");
      let after = probe.slice();
      let reduced = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const next = reduction!.apply(after, rng);
        if (next !== after) {
          for (let i = 0; i < next.length; i++) {
            if (next[i] !== after[i]) {
              expect(i).not.toBe(1);
              reduced = true;
            }
          }
          after = next;
        }
      }
      expect(reduced).toBe(true);
    });

    it("falls through to the catalog default for `penult` (back-compat)", () => {
      const lang = testLang({
        stressPattern: "penult",
        enabledChangeIds: ["stress.unstressed_reduction"],
      });
      const changes = changesForLang(lang);
      const reduction = changes.find((c) => c.id === "stress.unstressed_reduction");
      expect(reduction).toBe(CATALOG_BY_ID["stress.unstressed_reduction"]);
    });
  });

  describe("conjugation classes × phonology evolution", () => {
    it("paradigm variants evolve in lockstep with the base affix", () => {
      const paradigm: Paradigm = {
        affix: ["a", "n"],
        position: "suffix",
        category: "verb.tense.past",
        variants: [{ when: "vowel-final", affix: ["a", "t"] }],
      };
      const lang = testLang({
        morphology: { paradigms: { "verb.tense.past": paradigm } },
      });
      applyPhonologyToAffixes(lang.morphology, (form) => form.map((p) => (p === "a" ? "e" : p)));
      const after = lang.morphology.paradigms["verb.tense.past"]!;
      expect(after.affix).toEqual(["e", "n"]);
      expect(after.variants).toBeDefined();
      expect(after.variants![0]!.affix).toEqual(["e", "t"]);
    });

    it("inflect picks the right variant after the language has split classes", () => {
      const paradigm: Paradigm = {
        affix: ["a", "n"], position: "suffix", category: "verb.tense.past",
      };
      const lang = testLang({
        lexicon: {
          go: ["g", "o"], walk: ["w", "a", "l", "k"], run: ["r", "u", "n"],
        },
        morphology: { paradigms: { "verb.tense.past": paradigm } },
      });
      const rng = makeRng("class-split");
      const result = maybeSplitParadigm(lang, rng, 1);
      expect(result).not.toBeNull();
      if (!result) return;
      const goInflected = inflect(["g", "o"], lang.morphology.paradigms["verb.tense.past"], lang, "go");
      const runInflected = inflect(["r", "u", "n"], lang.morphology.paradigms["verb.tense.past"], lang, "run");
      expect(goInflected.slice(2).join("")).not.toBe(runInflected.slice(3).join(""));
    });
  });

  describe("suppletion × phonology evolution", () => {
    it("suppletive forms drift over many generations", () => {
      const paradigm: Paradigm = {
        affix: ["e", "d"], position: "suffix", category: "verb.tense.past",
      };
      const lang = testLang({
        lexicon: { go: ["g", "o"], walk: ["w", "a", "l", "k"] },
        wordFrequencyHints: { go: 0.9, walk: 0.4 },
        morphology: { paradigms: { "verb.tense.past": paradigm } },
        enabledChangeIds: ["lenition.p_to_f"],
      });
      lang.suppletion = {
        go: { "verb.tense.past": ["w", "p", "n", "t"] },
      };
      const config = defaultConfig();
      const state: SimulationState = {
        generation: 0, rootId: lang.id, rngState: 0,
        tree: { [lang.id]: { language: lang, parentId: null, childrenIds: [] } },
      };
      const rng = makeRng("supp-evol");
      lang.changeWeights = { "lenition.p_to_f": 5 };
      let mutated = false;
      for (let i = 0; i < 200 && !mutated; i++) {
        stepPhonology(lang, config, rng, i + 1, state);
        const supp = lang.suppletion?.["go"]?.["verb.tense.past"];
        if (supp && !supp.includes("p")) mutated = true;
      }
      expect(mutated).toBe(true);
    });
  });

  describe("derivational suffixes × phonology evolution", () => {
    it("language-specific suffixes drift along with the rest of the phonology", () => {
      const lang = testLang({
        lexicon: { water: ["w", "a", "t", "e", "r"] },
        derivationalSuffixes: [
          { affix: ["p", "i"], tag: "-er" },
        ],
        enabledChangeIds: ["lenition.p_to_f"],
        changeWeights: { "lenition.p_to_f": 5 },
      });
      const config = defaultConfig();
      const state: SimulationState = {
        generation: 0, rootId: lang.id, rngState: 0,
        tree: { [lang.id]: { language: lang, parentId: null, childrenIds: [] } },
      };
      const rng = makeRng("suff-evol");
      let mutated = false;
      for (let i = 0; i < 200 && !mutated; i++) {
        stepPhonology(lang, config, rng, i + 1, state);
        if (lang.derivationalSuffixes![0]!.affix[0] === "f") mutated = true;
      }
      expect(mutated).toBe(true);
    });
  });

  describe("suppletion × inflect", () => {
    it("inflect's suppletion check beats the variant check", () => {
      const paradigm: Paradigm = {
        affix: ["e", "d"], position: "suffix", category: "verb.tense.past",
        variants: [{ when: "vowel-final", affix: ["t"] }],
      };
      const lang = testLang({
        lexicon: { go: ["g", "o"] },
        wordFrequencyHints: { go: 0.9 },
        morphology: { paradigms: { "verb.tense.past": paradigm } },
        suppletion: { go: { "verb.tense.past": ["w", "e", "n", "t"] } },
      });
      const result = inflect(["g", "o"], paradigm, lang, "go");
      expect(result).toEqual(["w", "e", "n", "t"]);
    });
  });

  describe("genesis × derivational suffixes", () => {
    it("stays stable when a language has no suffixes (falls back to catalog)", () => {
      const lang = testLang({
        lexicon: { water: ["w", "a", "t", "e", "r"] },
        derivationalSuffixes: [],
      });
      const rule = GENESIS_BY_ID["genesis.derivation"]!;
      const rng = makeRng("genesis-empty-suffixes");
      for (let i = 0; i < 10; i++) {
        rule.tryCoin(lang, rng);
      }
      expect(true).toBe(true);
    });
  });
});
