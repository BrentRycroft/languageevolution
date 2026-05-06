import { describe, it, expect } from "vitest";
import { SEMANTIC_MODULE_IDS } from "../modules/semantic";
import { getModule, modulesByKind } from "../modules/registry";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";

/**
 * Phase 45g: semantic-module verification.
 *
 * - All 10 semantic modules registered at boot
 *   (lexicon / clusters / frequency / synonymy / colexification /
 *    borrowing / calque / reborrow / taboo / coinage)
 * - modulesByKind('semantic') returns those 10 modules
 * - Activating the full semantic stack on English doesn't crash a
 *   30-gen run
 * - A minimal-vocabulary language (lexicon-only) skips the other
 *   9 modules entirely (perf gain target ≥ 2× per-gen at Phase 46)
 * - Daughters inherit semantic activeModules at split, so vocab
 *   commitment carries forward
 *
 * Modules are scaffold-stubs — legacy paths still run today.
 * Phase 46a inverts the default and migrates the actual logic
 * (steps/lexicon, lexicon/frequencyDynamics, contact/borrow,
 * contact/calque, contact/structuralBorrow, steps/taboo,
 * steps/genesis, semantics/colexification) into the module hooks.
 */

describe("Phase 45g — semantic modules", () => {
  it("registers all 10 semantic modules at boot", () => {
    for (const id of SEMANTIC_MODULE_IDS) {
      expect(getModule(id), `module ${id} not registered`).toBeDefined();
    }
  });

  it("modulesByKind('semantic') returns the 10 semantic modules", () => {
    const semantic = modulesByKind("semantic");
    const ids = semantic.map((m) => m.id).sort();
    expect(ids).toEqual([...SEMANTIC_MODULE_IDS].sort());
  });

  it("module ids cover lexicon + clusters + frequency", () => {
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:lexicon");
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:clusters");
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:frequency");
  });

  it("module ids cover synonymy + colexification", () => {
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:synonymy");
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:colexification");
  });

  it("module ids cover borrowing + calque + reborrow", () => {
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:borrowing");
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:calque");
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:reborrow");
  });

  it("module ids cover taboo + coinage", () => {
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:taboo");
    expect(SEMANTIC_MODULE_IDS).toContain("semantic:coinage");
  });

  it("frequency requires lexicon; synonymy requires lexicon + frequency", () => {
    const frequency = getModule("semantic:frequency");
    const synonymy = getModule("semantic:synonymy");
    expect(frequency?.requires).toContain("semantic:lexicon");
    expect(synonymy?.requires).toContain("semantic:lexicon");
    expect(synonymy?.requires).toContain("semantic:frequency");
  });

  it("colexification + taboo require lexicon + clusters", () => {
    const colex = getModule("semantic:colexification");
    const taboo = getModule("semantic:taboo");
    expect(colex?.requires).toContain("semantic:lexicon");
    expect(colex?.requires).toContain("semantic:clusters");
    expect(taboo?.requires).toContain("semantic:lexicon");
    expect(taboo?.requires).toContain("semantic:clusters");
  });

  it("borrowing, calque, reborrow each require lexicon", () => {
    const borrowing = getModule("semantic:borrowing");
    const calque = getModule("semantic:calque");
    const reborrow = getModule("semantic:reborrow");
    expect(borrowing?.requires).toContain("semantic:lexicon");
    expect(calque?.requires).toContain("semantic:lexicon");
    expect(reborrow?.requires).toContain("semantic:lexicon");
  });

  it("coinage requires lexicon + clusters + frequency", () => {
    const coinage = getModule("semantic:coinage");
    expect(coinage?.requires).toContain("semantic:lexicon");
    expect(coinage?.requires).toContain("semantic:clusters");
    expect(coinage?.requires).toContain("semantic:frequency");
  });

  it("activating full semantic stack doesn't crash a 30-gen run", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase45-full",
      seedActiveModules: [
        "semantic:lexicon",
        "semantic:clusters",
        "semantic:frequency",
        "semantic:synonymy",
        "semantic:colexification",
        "semantic:borrowing",
        "semantic:calque",
        "semantic:reborrow",
        "semantic:taboo",
        "semantic:coinage",
      ],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 30; i++) sim.step();
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    expect(root.activeModules).toBeDefined();
    expect(root.activeModules!.size).toBe(10);
    expect(root.activeModules!.has("semantic:lexicon")).toBe(true);
    expect(root.activeModules!.has("semantic:coinage")).toBe(true);
  });

  it("lexicon-only — minimal semantic activation works", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase45-minimal",
      seedActiveModules: ["semantic:lexicon"],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 10; i++) sim.step();
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    expect(root.activeModules!.size).toBe(1);
    expect(root.activeModules!.has("semantic:lexicon")).toBe(true);
  });

  it("daughters inherit semantic activeModules at split", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase45-split",
      seedActiveModules: [
        "semantic:lexicon",
        "semantic:frequency",
        "semantic:synonymy",
      ],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 80; i++) sim.step();
    const state = sim.getState();
    const leaves = Object.keys(state.tree)
      .filter((id) => state.tree[id]!.childrenIds.length === 0 && !state.tree[id]!.language.extinct);
    expect(leaves.length).toBeGreaterThanOrEqual(1);
    for (const id of leaves) {
      const am = state.tree[id]!.language.activeModules;
      expect(am?.has("semantic:lexicon")).toBe(true);
      expect(am?.has("semantic:frequency")).toBe(true);
      expect(am?.has("semantic:synonymy")).toBe(true);
    }
  });
});
