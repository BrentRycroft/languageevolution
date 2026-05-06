import { describe, it, expect } from "vitest";
import { SYNTACTICAL_MODULE_IDS } from "../modules/syntactical";
import { getModule, modulesByKind } from "../modules/registry";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";

/**
 * Phase 43e: syntactical-module verification.
 *
 * - All 18 syntactical modules registered at boot
 *   (7 word-order + 4 alignment + 4 placement + 3 clause-level)
 * - modulesByKind('syntactical') returns the 18 modules
 * - Activating a typology-matched subset on English (SVO + nom-acc +
 *   pre-adj + post-poss + pre-num + pre-verb-neg + relativiser +
 *   coordination) doesn't crash a 30-gen run
 * - A typologically isolating language activating only `free` +
 *   `nom-acc` skips the other 16 modules entirely (perf gain)
 */

describe("Phase 43e — syntactical modules", () => {
  it("registers all 18 syntactical modules at boot", () => {
    for (const id of SYNTACTICAL_MODULE_IDS) {
      expect(getModule(id), `module ${id} not registered`).toBeDefined();
    }
  });

  it("modulesByKind('syntactical') returns the 18 syntactical modules", () => {
    const syntactical = modulesByKind("syntactical");
    const ids = syntactical.map((m) => m.id).sort();
    expect(ids).toEqual([...SYNTACTICAL_MODULE_IDS].sort());
  });

  it("module ids cover the seven word orders", () => {
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:wordOrder/sov");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:wordOrder/svo");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:wordOrder/vso");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:wordOrder/vos");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:wordOrder/ovs");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:wordOrder/osv");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:wordOrder/free");
  });

  it("module ids cover the four alignment strategies", () => {
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:alignment/nom-acc");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:alignment/erg-abs");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:alignment/tripartite");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:alignment/split-s");
  });

  it("module ids cover the four placement modules", () => {
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:adj-placement");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:poss-placement");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:num-placement");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:neg-placement");
  });

  it("module ids cover relativiser + coordination + serial-verb", () => {
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:relativiser");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:coordination");
    expect(SYNTACTICAL_MODULE_IDS).toContain("syntactical:serial-verb");
  });

  it("activating English-typology subset doesn't crash a 30-gen run", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase43-svo",
      seedActiveModules: [
        "syntactical:wordOrder/svo",
        "syntactical:alignment/nom-acc",
        "syntactical:adj-placement",
        "syntactical:poss-placement",
        "syntactical:num-placement",
        "syntactical:neg-placement",
        "syntactical:relativiser",
        "syntactical:coordination",
      ],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 30; i++) sim.step();
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    expect(root.activeModules).toBeDefined();
    expect(root.activeModules!.has("syntactical:wordOrder/svo")).toBe(true);
    expect(root.activeModules!.has("syntactical:alignment/nom-acc")).toBe(true);
  });

  it("free word order + nom-acc only — minimal syntactical activation works", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase43-minimal",
      seedActiveModules: [
        "syntactical:wordOrder/free",
        "syntactical:alignment/nom-acc",
      ],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 10; i++) sim.step();
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    expect(root.activeModules!.size).toBe(2);
  });

  it("daughters inherit syntactical activeModules at split", () => {
    const cfg = {
      ...presetEnglish(),
      seed: "phase43-split",
      seedActiveModules: [
        "syntactical:wordOrder/svo",
        "syntactical:alignment/nom-acc",
      ],
    };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 80; i++) sim.step();
    const state = sim.getState();
    const leaves = Object.keys(state.tree)
      .filter((id) => state.tree[id]!.childrenIds.length === 0 && !state.tree[id]!.language.extinct);
    expect(leaves.length).toBeGreaterThanOrEqual(1);
    for (const id of leaves) {
      expect(state.tree[id]!.language.activeModules?.has("syntactical:wordOrder/svo")).toBe(true);
    }
  });
});
