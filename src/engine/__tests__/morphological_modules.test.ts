import { describe, it, expect } from "vitest";
import { MORPHOLOGICAL_MODULE_IDS } from "../modules/morphological";
import { getModule, modulesByKind } from "../modules/registry";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";

/**
 * Phase 44f: morphological-module verification.
 *
 * - All 6 morphological modules registered at boot
 *   (paradigms / derivation / inflection-class / agreement /
 *    analogy / templatic)
 * - modulesByKind('morphological') returns those 6 modules
 * - Activating the standard English-typology subset
 *   (paradigms + derivation + inflection-class + agreement +
 *    analogy) doesn't crash a 30-gen run
 * - A minimal-morphology language (paradigms only) skips the other
 *   5 modules entirely (perf gain target for Toki Pona-style
 *   isolating languages)
 * - Daughters inherit morphological activeModules at split, so
 *   typological commitment carries forward.
 *
 * The modules are scaffold-stubs — legacy paths still run today.
 * Phase 46a inverts the default and migrates the actual logic
 * into the module hooks; these tests guard the scaffold so the
 * migration has a clean target.
 */

describe("Phase 44f — morphological modules", () => {
  it("registers all 6 morphological modules at boot", () => {
    for (const id of MORPHOLOGICAL_MODULE_IDS) {
      expect(getModule(id), `module ${id} not registered`).toBeDefined();
    }
  });

  it("modulesByKind('morphological') returns the 6 morphological modules", () => {
    const morphological = modulesByKind("morphological");
    const ids = morphological.map((m) => m.id).sort();
    expect(ids).toEqual([...MORPHOLOGICAL_MODULE_IDS].sort());
  });

  it("module ids cover paradigms + derivation + inflection-class", () => {
    expect(MORPHOLOGICAL_MODULE_IDS).toContain("morphological:paradigms");
    expect(MORPHOLOGICAL_MODULE_IDS).toContain("morphological:derivation");
    expect(MORPHOLOGICAL_MODULE_IDS).toContain("morphological:inflection-class");
  });

  it("module ids cover agreement + analogy + templatic", () => {
    expect(MORPHOLOGICAL_MODULE_IDS).toContain("morphological:agreement");
    expect(MORPHOLOGICAL_MODULE_IDS).toContain("morphological:analogy");
    expect(MORPHOLOGICAL_MODULE_IDS).toContain("morphological:templatic");
  });

  it("derivation, inflection-class, agreement, templatic require paradigms", () => {
    const derivation = getModule("morphological:derivation");
    const inflectionClass = getModule("morphological:inflection-class");
    const agreement = getModule("morphological:agreement");
    const templatic = getModule("morphological:templatic");
    expect(derivation?.requires).toContain("morphological:paradigms");
    expect(inflectionClass?.requires).toContain("morphological:paradigms");
    expect(agreement?.requires).toContain("morphological:paradigms");
    expect(templatic?.requires).toContain("morphological:paradigms");
  });

  it("analogy requires both paradigms and inflection-class", () => {
    const analogy = getModule("morphological:analogy");
    expect(analogy?.requires).toContain("morphological:paradigms");
    expect(analogy?.requires).toContain("morphological:inflection-class");
  });

  it("activating English-typology subset doesn't crash a 30-gen run", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase44-eng",
      seedActiveModules: [
        "morphological:paradigms",
        "morphological:derivation",
        "morphological:inflection-class",
        "morphological:agreement",
        "morphological:analogy",
      ],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 30; i++) sim.step();
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    expect(root.activeModules).toBeDefined();
    expect(root.activeModules!.has("morphological:paradigms")).toBe(true);
    expect(root.activeModules!.has("morphological:analogy")).toBe(true);
  });

  it("paradigms-only — minimal morphological activation works", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase44-minimal",
      seedActiveModules: ["morphological:paradigms"],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 10; i++) sim.step();
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    expect(root.activeModules!.size).toBe(1);
    expect(root.activeModules!.has("morphological:paradigms")).toBe(true);
  });

  it("daughters inherit morphological activeModules at split", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase44-split",
      seedActiveModules: [
        "morphological:paradigms",
        "morphological:agreement",
      ],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 80; i++) sim.step();
    const state = sim.getState();
    const leaves = Object.keys(state.tree)
      .filter((id) => state.tree[id]!.childrenIds.length === 0 && !state.tree[id]!.language.extinct);
    expect(leaves.length).toBeGreaterThanOrEqual(1);
    for (const id of leaves) {
      expect(state.tree[id]!.language.activeModules?.has("morphological:paradigms")).toBe(true);
      expect(state.tree[id]!.language.activeModules?.has("morphological:agreement")).toBe(true);
    }
  });
});
