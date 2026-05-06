import { describe, it, expect } from "vitest";
import { GRAMMATICAL_MODULE_IDS } from "../modules/grammatical";
import { getModule, modulesByKind } from "../modules/registry";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";

/**
 * Phase 42f: grammatical-module verification.
 *
 * - All 10 grammatical modules registered at boot.
 * - Activating a module on the proto language doesn't change behaviour
 *   (all hooks are stubs in Phase 42; legacy paths still run).
 * - `modulesByKind("grammatical")` returns the 10 modules.
 * - Module ids are stable strings (no accidental id drift).
 */

describe("Phase 42f — grammatical modules", () => {
  it("registers all 10 grammatical modules at boot", () => {
    for (const id of GRAMMATICAL_MODULE_IDS) {
      expect(getModule(id), `module ${id} not registered`).toBeDefined();
    }
  });

  it("modulesByKind('grammatical') returns the 10 grammatical modules", () => {
    const grammatical = modulesByKind("grammatical");
    const ids = grammatical.map((m) => m.id).sort();
    expect(ids).toEqual([...GRAMMATICAL_MODULE_IDS].sort());
  });

  it("module ids match expected stable strings", () => {
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:case-marking");
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:articles");
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:number-system");
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:aspect");
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:mood");
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:evidentials");
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:politeness");
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:reference-tracking");
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:numerals");
    expect(GRAMMATICAL_MODULE_IDS).toContain("grammatical:demonstratives");
  });

  it("activating all grammatical modules on a fresh English doesn't crash a 30-gen run", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase42-modules-on",
      seedActiveModules: [...GRAMMATICAL_MODULE_IDS],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 30; i++) sim.step();
    const state = sim.getState();
    const root = state.tree[state.rootId]!.language;
    // Active modules propagated to the runtime.
    expect(root.activeModules).toBeDefined();
    expect(root.activeModules!.size).toBeGreaterThan(0);
    // Module state allocated for each active module that declared
    // initState (case-marking, articles, number-system).
    expect(root.moduleState).toBeDefined();
    expect(root.moduleState!["grammatical:case-marking"]).toBeDefined();
    expect(root.moduleState!["grammatical:articles"]).toBeDefined();
    expect(root.moduleState!["grammatical:number-system"]).toBeDefined();
  });

  it("daughters inherit activeModules + moduleState at split", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase42-split-clone",
      seedActiveModules: [...GRAMMATICAL_MODULE_IDS],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 80; i++) sim.step();
    const state = sim.getState();
    const allLeaves = Object.keys(state.tree)
      .filter((id) => state.tree[id]!.childrenIds.length === 0 && !state.tree[id]!.language.extinct);
    expect(allLeaves.length).toBeGreaterThanOrEqual(1);
    for (const id of allLeaves) {
      const lang = state.tree[id]!.language;
      // Inheritance: daughter has the same active set as the proto.
      expect(lang.activeModules?.has("grammatical:case-marking")).toBe(true);
      expect(lang.moduleState?.["grammatical:case-marking"]).toBeDefined();
    }
  });

  it("a language with seedActiveModules explicitly cleared runs back-compat unchanged", () => {
    // Phase 46a-migration: presets now declare `seedActiveModules` by
    // default. Pass an empty array to opt out (back-compat path).
    const cfg = {
      ...presetEnglish(),
      seed: "phase42-back-compat",
      seedActiveModules: undefined,
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 10; i++) sim.step();
    const state = sim.getState();
    const root = state.tree[state.rootId]!.language;
    expect(root.activeModules).toBeUndefined();
    expect(root.moduleState).toBeUndefined();
  });
});
