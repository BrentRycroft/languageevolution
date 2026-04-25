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

/**
 * Cross-feature integration: every recently-added mechanic must work
 * with every other recently-added mechanic. These tests catch the
 * "feature A and feature B are each fine in isolation but neither
 * knows the other exists" failure mode.
 */
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
      // With an "initial" pattern, vowel index 0 is stressed and the
      // last vowel index is unstressed. Run a probe word of 3 syllables.
      const probe = ["k", "a", "l", "e", "t", "i"]; // 3 vowels: 1,3,5
      const rng = makeRng("stress-probe");
      // Force apply repeatedly. With initial stress, the unstressed
      // sites are vowels at indices 3 and 5 (`e`, `i`); never 1 (`a`).
      // We don't assert exact output (rng-dependent) but verify the
      // first vowel is never the reduction target.
      let after = probe.slice();
      let reduced = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const next = reduction!.apply(after, rng);
        if (next !== after) {
          // Find which index changed.
          for (let i = 0; i < next.length; i++) {
            if (next[i] !== after[i]) {
              expect(i).not.toBe(1); // vowel idx 1 is initial-stressed
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
      // Should be the same object as the catalog version (no specialisation).
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
      // Force-mutate every phoneme by replacing `a` with `e`.
      applyPhonologyToAffixes(lang.morphology, (form) => form.map((p) => (p === "a" ? "e" : p)));
      const after = lang.morphology.paradigms["verb.tense.past"]!;
      expect(after.affix).toEqual(["e", "n"]);
      expect(after.variants).toBeDefined();
      expect(after.variants![0]!.affix).toEqual(["e", "t"]);
    });

    it("inflect picks the right variant after the language has split classes", () => {
      // Build a lang with a base paradigm + run maybeSplitParadigm.
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
      // Now `inflect` should pick the variant for stems that match.
      const goInflected = inflect(["g", "o"], lang.morphology.paradigms["verb.tense.past"], lang, "go");
      const runInflected = inflect(["r", "u", "n"], lang.morphology.paradigms["verb.tense.past"], lang, "run");
      // The two stems end in different shapes, so they should NOT
      // produce the same affix. (Exact affixes depend on rng, so we
      // just compare structural difference.)
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
        // Enable the simplest sound change so we can observe drift.
        enabledChangeIds: ["lenition.p_to_f"],
      });
      // Plant a suppletive entry directly so we don't depend on
      // maybeSuppletion's randomness for the setup.
      lang.suppletion = {
        go: { "verb.tense.past": ["w", "p", "n", "t"] }, // contains a `p` we can lenite
      };
      // Step phonology many times — the `p` should eventually flip to `f`.
      const config = defaultConfig();
      const state: SimulationState = {
        generation: 0, rootId: lang.id, rngState: 0,
        tree: { [lang.id]: { language: lang, parentId: null, childrenIds: [] } },
      };
      const rng = makeRng("supp-evol");
      // Crank weight up so the change actually fires often.
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
      // Suppletive form wins despite the vowel-final variant matching.
      expect(result).toEqual(["w", "e", "n", "t"]);
    });
  });

  describe("genesis × derivational suffixes", () => {
    it("stays stable when a language has no suffixes (falls back to catalog)", () => {
      // Just confirms the genesis.derivation rule doesn't crash on
      // an empty derivationalSuffixes list — the global fallback
      // kicks in. We probe the rule directly.
      const lang = testLang({
        lexicon: { water: ["w", "a", "t", "e", "r"] },
        derivationalSuffixes: [],
      });
      const rule = GENESIS_BY_ID["genesis.derivation"]!;
      const rng = makeRng("genesis-empty-suffixes");
      // Try multiple times because rng can hit a phonotactically
      // illegal coinage and bail. We only need it to not throw.
      for (let i = 0; i < 10; i++) {
        rule.tryCoin(lang, rng);
      }
      // No exception → pass.
      expect(true).toBe(true);
    });
  });
});
