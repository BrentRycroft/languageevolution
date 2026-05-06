import { describe, it, expect, beforeEach } from "vitest";
import { registerModule, activeModulesOf, getModule, _resetRegistry } from "../modules/registry";
import type { Language } from "../types";

/**
 * Phase 41e: module spine smoke tests.
 *
 * - registry topo sort honours `requires`
 * - cycles throw at sort time
 * - activeModulesOf returns [] for languages with no activeModules
 *   (back-compat for pre-Phase-41 languages)
 * - registry rejects duplicate ids
 * - missing dep is permissive (module can `requires` an inactive id;
 *   the runtime simply doesn't call it)
 */

function fakeLang(active: string[] | null): Language {
  return {
    id: "test",
    name: "test",
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
    activeModules: active === null ? undefined : new Set(active),
  };
}

beforeEach(() => {
  _resetRegistry();
});

describe("Phase 41e — module spine", () => {
  it("registry rejects duplicate ids", () => {
    registerModule({ id: "A", kind: "grammatical" });
    expect(() => registerModule({ id: "A", kind: "grammatical" })).toThrow(/already/);
  });

  it("activeModulesOf returns [] for back-compat languages with undefined activeModules", () => {
    registerModule({ id: "A", kind: "grammatical" });
    const lang = fakeLang(null);
    expect(activeModulesOf(lang)).toEqual([]);
  });

  it("activeModulesOf honours requires (linear chain A → B → C)", () => {
    registerModule({ id: "A", kind: "grammatical" });
    registerModule({ id: "B", kind: "grammatical", requires: ["A"] });
    registerModule({ id: "C", kind: "grammatical", requires: ["B"] });
    const lang = fakeLang(["C", "B", "A"]);
    const order = activeModulesOf(lang).map((m) => m.id);
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("activeModulesOf honours requires (diamond A → {B,C} → D)", () => {
    registerModule({ id: "A", kind: "grammatical" });
    registerModule({ id: "B", kind: "grammatical", requires: ["A"] });
    registerModule({ id: "C", kind: "grammatical", requires: ["A"] });
    registerModule({ id: "D", kind: "grammatical", requires: ["B", "C"] });
    const lang = fakeLang(["D", "C", "B", "A"]);
    const order = activeModulesOf(lang).map((m) => m.id);
    expect(order[0]).toBe("A");
    expect(order[3]).toBe("D");
    // B and C can be in either order, both must come between A and D.
    expect(["B", "C"]).toContain(order[1]);
    expect(["B", "C"]).toContain(order[2]);
  });

  it("activeModulesOf throws on dependency cycle", () => {
    registerModule({ id: "X", kind: "grammatical", requires: ["Y"] });
    registerModule({ id: "Y", kind: "grammatical", requires: ["X"] });
    const lang = fakeLang(["X", "Y"]);
    expect(() => activeModulesOf(lang)).toThrow(/cycle/);
  });

  it("missing dep is permissive — module without registered dep still runs", () => {
    registerModule({ id: "A", kind: "grammatical", requires: ["nonexistent-dep"] });
    const lang = fakeLang(["A"]);
    const order = activeModulesOf(lang).map((m) => m.id);
    expect(order).toEqual(["A"]);
  });

  it("getModule returns the registered module", () => {
    registerModule({ id: "A", kind: "grammatical" });
    expect(getModule("A")?.id).toBe("A");
    expect(getModule("nope")).toBeUndefined();
  });

  it("activeModulesOf skips modules not in registry", () => {
    registerModule({ id: "A", kind: "grammatical" });
    const lang = fakeLang(["A", "ghost"]);
    const order = activeModulesOf(lang).map((m) => m.id);
    expect(order).toEqual(["A"]);
  });
});
