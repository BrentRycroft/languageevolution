import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";
import { applyChangesToWord } from "../phonology/apply";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";
import { driftOneMeaning } from "../semantics/drift";
import type { Language, WordForm } from "../types";

function makeTestLang(forms: Record<string, WordForm>): Language {
  return {
    id: "L-prop",
    name: "Prop",
    lexicon: { ...forms },
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
  } as Language;
}

function stringifyLeafLexicons(tree: ReturnType<ReturnType<typeof createSimulation>["getState"]>["tree"]) {
  return Object.keys(tree)
    .filter((id) => tree[id]!.childrenIds.length === 0)
    .sort()
    .map((id) => {
      const lex = tree[id]!.language.lexicon;
      return Object.keys(lex)
        .sort()
        .map((m) => `${m}=${lex[m]!.join("")}`)
        .join(",");
    })
    .join("|");
}

describe("engine property tests", () => {
  it("same seed + same generations ⇒ identical lexicons (determinism)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.integer({ min: 10, max: 80 }),
        (seed, gens) => {
          const cfg = { ...defaultConfig(), seed };
          const a = createSimulation(cfg);
          const b = createSimulation(cfg);
          for (let i = 0; i < gens; i++) {
            a.step();
            b.step();
          }
          expect(stringifyLeafLexicons(a.getState().tree)).toBe(
            stringifyLeafLexicons(b.getState().tree),
          );
        },
      ),
      { numRuns: 12 },
    );
  });

  it("generation counter is monotonic after N steps", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.integer({ min: 5, max: 60 }),
        (seed, gens) => {
          const sim = createSimulation({ ...defaultConfig(), seed });
          let last = -1;
          for (let i = 0; i < gens; i++) {
            sim.step();
            const g = sim.getState().generation;
            expect(g).toBeGreaterThan(last);
            last = g;
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("tree never shrinks (nodes are never removed, only added)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.integer({ min: 50, max: 200 }),
        (seed, gens) => {
          const sim = createSimulation({ ...defaultConfig(), seed });
          let last = 1;
          for (let i = 0; i < gens; i++) {
            sim.step();
            const size = Object.keys(sim.getState().tree).length;
            expect(size).toBeGreaterThanOrEqual(last);
            last = size;
          }
        },
      ),
      { numRuns: 8 },
    );
  });

  it("at least one alive leaf remains through long runs", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        (seed) => {
          const sim = createSimulation({ ...defaultConfig(), seed });
          for (let i = 0; i < 500; i++) sim.step();
          const tree = sim.getState().tree;
          const alive = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
          expect(alive.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("driftOneMeaning on empty lexicon returns null", () => {
    const lang = makeTestLang({});
    const rng = makeRng("empty");
    expect(driftOneMeaning(lang, rng)).toBeNull();
  });

  it("driftOneMeaning result has from !== to and form moved correctly", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.constantFrom(
            "water", "fire", "mother", "father", "child", "dog", "see",
            "go", "eat", "hand", "foot", "head", "stone", "tree",
          ),
          { minLength: 4, maxLength: 8 },
        ),
        fc.string({ minLength: 1, maxLength: 8 }),
        (meanings, seed) => {
          const forms: Record<string, WordForm> = {};
          for (let i = 0; i < meanings.length; i++) {
            forms[meanings[i]!] = ["p", "a", "t", "i"].slice(0, 2 + (i % 3));
          }
          const lang = makeTestLang(forms);
          const beforeSize = Object.keys(lang.lexicon).length;
          const result = driftOneMeaning(lang, makeRng(seed));
          if (result === null) return;
          expect(result.from).not.toBe(result.to);
          expect(result.from.length).toBeGreaterThan(0);
          expect(result.to.length).toBeGreaterThan(0);
          const afterSize = Object.keys(lang.lexicon).length;
          expect(afterSize).toBeGreaterThanOrEqual(beforeSize - 1);
          expect(afterSize).toBeLessThanOrEqual(beforeSize + 1);
          expect(lang.lexicon[result.to]).toBeDefined();
          if (!result.polysemous) {
            expect(lang.lexicon[result.from]).toBeUndefined();
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it("driftOneMeaning is deterministic for same seed + same lang", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        (seed) => {
          const meanings = ["water", "fire", "mother", "child", "dog", "see"];
          const forms: Record<string, WordForm> = {};
          for (let i = 0; i < meanings.length; i++) {
            forms[meanings[i]!] = ["p", "a", "t", "i"].slice(0, 2 + (i % 3));
          }
          const a = makeTestLang(forms);
          const b = makeTestLang(forms);
          const ra = driftOneMeaning(a, makeRng(seed));
          const rb = driftOneMeaning(b, makeRng(seed));
          expect(JSON.stringify(ra)).toBe(JSON.stringify(rb));
          expect(JSON.stringify(a.lexicon)).toBe(JSON.stringify(b.lexicon));
        },
      ),
      { numRuns: 12 },
    );
  });

  it("applyChangesToWord with probability≈0 leaves the form unchanged", () => {
    const rule = CATALOG_BY_ID["lenition.p_to_f"]!;
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("p", "a", "t", "i", "k", "e"), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 1000 }),
        (form, seed) => {
          const rng = makeRng(seed);
          const out = applyChangesToWord(form, [rule], rng, {
            globalRate: 0,
            weights: { [rule.id]: 0 },
          });
          expect(out.join("")).toBe(form.join(""));
        },
      ),
      { numRuns: 30 },
    );
  });
});
