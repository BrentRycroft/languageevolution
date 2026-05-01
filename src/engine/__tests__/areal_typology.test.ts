import { describe, it, expect } from "vitest";
import { stepArealTypology } from "../steps/arealTypology";
import { makeRng } from "../rng";
import type { Language, SimulationState } from "../types";

function makeLang(id: string, overrides: Partial<Language> = {}): Language {
  return {
    id,
    name: id,
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
    phonemeInventory: { segmental: ["p", "t", "a", "i"], tones: [], usesTones: false },
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

describe("areal typological diffusion (Sprachbund)", () => {
  it("a recipient with strong bilingual link adopts a neighbour's word order over time", () => {
    const recipient = makeLang("R", {
      grammar: {
        wordOrder: "SVO",
        affixPosition: "suffix",
        pluralMarking: "none",
        tenseMarking: "none",
        hasCase: false,
        genderCount: 0,
      },
      bilingualLinks: { N: 0.6 },
    });
    const neighbour = makeLang("N", {
      grammar: {
        wordOrder: "SOV",
        affixPosition: "suffix",
        pluralMarking: "none",
        tenseMarking: "none",
        hasCase: false,
        genderCount: 0,
      },
    });
    const state: SimulationState = {
      generation: 0,
      tree: {
        R: { language: recipient, parentId: null, childrenIds: [] },
        N: { language: neighbour, parentId: null, childrenIds: [] },
      },
      rootId: "R",
      rngState: 0,
    };
    const rng = makeRng("typology-1");

    let adopted = false;
    for (let g = 6; g <= 600; g += 6) {
      stepArealTypology(state, recipient, rng, g);
      if (recipient.grammar.wordOrder === "SOV") {
        adopted = true;
        break;
      }
    }
    expect(adopted, "recipient should adopt neighbour's wordOrder within 100 cadences").toBe(true);
  });

  it("does nothing on non-cadence generations", () => {
    const recipient = makeLang("R", { bilingualLinks: { N: 0.6 } });
    const neighbour = makeLang("N", {
      grammar: {
        wordOrder: "SOV",
        affixPosition: "suffix",
        pluralMarking: "none",
        tenseMarking: "none",
        hasCase: false,
        genderCount: 0,
      },
    });
    const state: SimulationState = {
      generation: 0,
      tree: {
        R: { language: recipient, parentId: null, childrenIds: [] },
        N: { language: neighbour, parentId: null, childrenIds: [] },
      },
      rootId: "R",
      rngState: 0,
    };
    const rng = makeRng("typology-2");
    for (let g = 1; g < 6; g++) stepArealTypology(state, recipient, rng, g);
    expect(recipient.grammar.wordOrder).toBe("SVO");
    expect(recipient.events.length).toBe(0);
  });

  it("does nothing without strong bilingual links", () => {
    const recipient = makeLang("R", { bilingualLinks: { N: 0.05 } });
    const neighbour = makeLang("N", {
      grammar: {
        wordOrder: "SOV",
        affixPosition: "suffix",
        pluralMarking: "none",
        tenseMarking: "none",
        hasCase: false,
        genderCount: 0,
      },
    });
    const state: SimulationState = {
      generation: 0,
      tree: {
        R: { language: recipient, parentId: null, childrenIds: [] },
        N: { language: neighbour, parentId: null, childrenIds: [] },
      },
      rootId: "R",
      rngState: 0,
    };
    const rng = makeRng("typology-3");
    for (let g = 6; g <= 600; g += 6) stepArealTypology(state, recipient, rng, g);
    expect(recipient.grammar.wordOrder).toBe("SVO");
  });

  it("two strong neighbours sharing a value pull harder than one", () => {
    const recipient = makeLang("R", { bilingualLinks: { N1: 0.4, N2: 0.4 } });
    const neighbour1 = makeLang("N1", {
      grammar: {
        wordOrder: "SOV",
        affixPosition: "suffix",
        pluralMarking: "none",
        tenseMarking: "none",
        hasCase: false,
        genderCount: 0,
      },
    });
    const neighbour2 = makeLang("N2", {
      grammar: {
        wordOrder: "SOV",
        affixPosition: "suffix",
        pluralMarking: "none",
        tenseMarking: "none",
        hasCase: false,
        genderCount: 0,
      },
    });
    const state: SimulationState = {
      generation: 0,
      tree: {
        R: { language: recipient, parentId: null, childrenIds: [] },
        N1: { language: neighbour1, parentId: null, childrenIds: [] },
        N2: { language: neighbour2, parentId: null, childrenIds: [] },
      },
      rootId: "R",
      rngState: 0,
    };
    const rng = makeRng("typology-4");
    let gensToAdopt = -1;
    for (let g = 6; g <= 600; g += 6) {
      stepArealTypology(state, recipient, rng, g);
      if (recipient.grammar.wordOrder === "SOV") {
        gensToAdopt = g;
        break;
      }
    }
    expect(gensToAdopt, "should adopt with two pulling neighbours").toBeGreaterThan(0);
    expect(gensToAdopt, "two-neighbour adoption should land within 200 gens").toBeLessThan(200);
  });
});
