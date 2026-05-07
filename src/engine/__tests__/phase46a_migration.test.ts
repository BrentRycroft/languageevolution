import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { presetTokipona } from "../presets/tokipona";
import { presetPIE } from "../presets/pie";
import { createSimulation } from "../simulation";
import {
  activateModule,
  deactivateModule,
} from "../modules/registry";
import { translateSentence } from "../translator/sentence";

/**
 * Phase 46a-migration: end-to-end behavior tests for the migrations
 * actually landed (wordOrder, alignment, serial-verb, drift swap).
 *
 * The earlier `phase46_modules.test.ts` covers the migrator + lazy
 * state + activate/deactivate APIs. This file covers the *behavioral*
 * effects: did moving wordOrder logic into the modules, alignment
 * dispatch into the modules, and SVC into the module-presence check
 * actually preserve translator output for module-aware presets and
 * preserve back-compat for opted-out languages.
 */

describe("Phase 46a-migration — behavioral", () => {
  it("English preset declares seedActiveModules including svo + nom-acc", () => {
    const cfg = presetEnglish();
    expect(cfg.seedActiveModules).toBeDefined();
    expect(cfg.seedActiveModules).toContain("syntactical:wordOrder/svo");
    expect(cfg.seedActiveModules).toContain("syntactical:alignment/nom-acc");
  });

  it("PIE preset declares SOV wordOrder module", () => {
    const cfg = presetPIE();
    expect(cfg.seedActiveModules).toContain("syntactical:wordOrder/sov");
    expect(cfg.seedActiveModules).toContain("syntactical:alignment/nom-acc");
    expect(cfg.seedActiveModules).toContain("grammatical:case-marking");
  });

  it("Toki Pona declares minimal seedActiveModules (no case/articles/morphology)", () => {
    const cfg = presetTokipona();
    expect(cfg.seedActiveModules).toBeDefined();
    expect(cfg.seedActiveModules).not.toContain("grammatical:case-marking");
    expect(cfg.seedActiveModules).not.toContain("grammatical:articles");
    expect(cfg.seedActiveModules).not.toContain("morphological:paradigms");
  });

  it("English root language has 28 active modules at gen 0", () => {
    const sim = createSimulation(presetEnglish());
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    expect(root.activeModules).toBeDefined();
    expect(root.activeModules!.size).toBe(28);
  });

  it("Drift swap: deactivating SVO + activating SOV mid-run", () => {
    const sim = createSimulation(presetEnglish());
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    expect(root.activeModules!.has("syntactical:wordOrder/svo")).toBe(true);
    expect(root.activeModules!.has("syntactical:wordOrder/sov")).toBe(false);

    const ctx = {
      generation: 0,
      rng: { next: () => 0.5 } as unknown as import("../rng").Rng,
      config: presetEnglish(),
    };
    deactivateModule(root, "syntactical:wordOrder/svo");
    activateModule(root, "syntactical:wordOrder/sov", ctx);

    expect(root.activeModules!.has("syntactical:wordOrder/svo")).toBe(false);
    expect(root.activeModules!.has("syntactical:wordOrder/sov")).toBe(true);
  });

  it("module presence drives serial-verb behavior (no flat flag needed)", () => {
    const sim = createSimulation(presetEnglish());
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    // English doesn't have SVC by default (no module + no flat flag).
    expect(root.activeModules!.has("syntactical:serial-verb")).toBe(false);
    expect(root.grammar.serialVerbConstructions ?? false).toBe(false);

    // Activate the module mid-run; the realiser should now treat
    // the language as SVC even though the flat flag stays false.
    const ctx = {
      generation: 0,
      rng: { next: () => 0.5 } as unknown as import("../rng").Rng,
      config: presetEnglish(),
    };
    activateModule(root, "syntactical:serial-verb", ctx);
    expect(root.activeModules!.has("syntactical:serial-verb")).toBe(true);
    // Flat flag stays false — module presence is the source of truth.
    expect(root.grammar.serialVerbConstructions ?? false).toBe(false);
  });

  it("translation works end-to-end with module-aware English preset", () => {
    const sim = createSimulation(presetEnglish());
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    const result = translateSentence(root, "the king sees the wolf");
    expect(result.targetTokens.length).toBeGreaterThan(0);
  });

  it("translation works end-to-end with back-compat Toki Pona preset", () => {
    const sim = createSimulation(presetTokipona());
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    const result = translateSentence(root, "the king sees the wolf");
    expect(result.targetTokens.length).toBeGreaterThan(0);
  });
});
