import { describe, it, expect } from "vitest";
import {
  recordHistory,
  formAtGeneration,
  allHistoricalMeanings,
  type HistoryByLangMeaning,
} from "../history";
import type { SimulationState } from "../../engine/types";

function stateOf(langId: string, lex: Record<string, string[]>, generation: number): SimulationState {
  return {
    generation,
    rootId: langId,
    rngState: 0,
    tree: {
      [langId]: {
        parentId: null,
        childrenIds: [],
        language: {
          id: langId,
          name: langId,
          lexicon: lex,
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
          phonemeInventory: { segmental: [], tones: [], usesTones: false },
          morphology: { paradigms: {} },
          localNeighbors: {},
          conservatism: 1,
          wordOrigin: {},
          customRules: [],
          orthography: {},
          otRanking: [],
          lastChangeGeneration: {},
        },
      },
    },
  };
}

describe("history helpers", () => {
  it("records every form change, skipping unchanged gens", () => {
    let h: HistoryByLangMeaning = {};
    h = recordHistory(h, stateOf("L", { water: ["w", "a"] }, 0)).next;
    h = recordHistory(h, stateOf("L", { water: ["w", "a"] }, 1)).next;
    h = recordHistory(h, stateOf("L", { water: ["v", "a"] }, 2)).next;
    const entries = h.L?.water ?? [];
    expect(entries.map((e) => e.formKey)).toEqual(["wa", "va"]);
  });

  it("formAtGeneration returns the form valid at or before the query gen", () => {
    let h: HistoryByLangMeaning = {};
    h = recordHistory(h, stateOf("L", { water: ["w", "a"] }, 0)).next;
    h = recordHistory(h, stateOf("L", { water: ["v", "a"] }, 5)).next;
    h = recordHistory(h, stateOf("L", { water: ["β", "a"] }, 12)).next;

    expect(formAtGeneration(h, "L", "water", 0)).toEqual(["w", "a"]);
    expect(formAtGeneration(h, "L", "water", 4)).toEqual(["w", "a"]);
    expect(formAtGeneration(h, "L", "water", 5)).toEqual(["v", "a"]);
    expect(formAtGeneration(h, "L", "water", 11)).toEqual(["v", "a"]);
    expect(formAtGeneration(h, "L", "water", 99)).toEqual(["β", "a"]);
  });

  it("formAtGeneration returns undefined when no data for that meaning", () => {
    const h: HistoryByLangMeaning = {};
    expect(formAtGeneration(h, "L", "water", 0)).toBeUndefined();
  });

  it("allHistoricalMeanings unions meanings across languages", () => {
    let h: HistoryByLangMeaning = {};
    h = recordHistory(h, stateOf("A", { water: ["w"], fire: ["f"] }, 0)).next;
    h = recordHistory(h, stateOf("B", { fire: ["p"], stone: ["s"] }, 0)).next;
    const all = allHistoricalMeanings(h);
    expect(Array.from(all).sort()).toEqual(["fire", "stone", "water"]);
  });
});
