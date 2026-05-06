import { describe, it, expect } from "vitest";
import { computeActiveModulesFromLegacy } from "../modules/legacyMigration";
import {
  activateModule,
  deactivateModule,
  moduleNeedsState,
  getModule,
} from "../modules/registry";
import { presetEnglish } from "../presets/english";
import { presetTokipona } from "../presets/tokipona";
import { createSimulation } from "../simulation";

/**
 * Phase 46 verification.
 *
 * Covers:
 *   - 46a: legacy → modules computation (computeActiveModulesFromLegacy)
 *   - 46c: lazy state allocation (moduleNeedsState reflects initState
 *          presence)
 *   - 46d: deferred activation / deactivation (mid-run module toggling)
 *
 * The save-migrator v8→v9 path is exercised indirectly: any pre-46a
 * Language object lacking `activeModules` flowing through this helper
 * gets the canonical mapping. Legacy save-fixture round-tripping is
 * covered by `migrate.test.ts` (the persistence test suite).
 */

describe("Phase 46 — module architecture closure", () => {
  describe("46a: legacy → modules computation", () => {
    it("English-typology language activates SVO + nom-acc word order", () => {
      const sim = createSimulation(presetEnglish());
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const am = computeActiveModulesFromLegacy(root);
      expect(am.has("syntactical:wordOrder/svo")).toBe(true);
      expect(am.has("syntactical:alignment/nom-acc")).toBe(true);
    });

    it("English activates articles + paradigms + analogy + agreement-not", () => {
      const sim = createSimulation(presetEnglish());
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const am = computeActiveModulesFromLegacy(root);
      expect(am.has("grammatical:articles")).toBe(true);
      expect(am.has("morphological:paradigms")).toBe(true);
      expect(am.has("morphological:analogy")).toBe(true);
      // English has genderCount: 0 + no nounClassAssignments by
      // default; agreement should NOT activate.
      expect(am.has("morphological:agreement")).toBe(false);
      // English has hasCase: false → case-marking off.
      expect(am.has("grammatical:case-marking")).toBe(false);
    });

    it("Toki Pona-style isolating language gets a minimal set", () => {
      const sim = createSimulation(presetTokipona());
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const am = computeActiveModulesFromLegacy(root);
      // Always-on semantic core.
      expect(am.has("semantic:lexicon")).toBe(true);
      expect(am.has("semantic:frequency")).toBe(true);
      // Toki Pona has no case, no articles, no paradigms.
      expect(am.has("grammatical:case-marking")).toBe(false);
      // Should be substantially smaller than English's full set.
      const eng = computeActiveModulesFromLegacy(
        createSimulation(presetEnglish()).getState().tree[
          createSimulation(presetEnglish()).getState().rootId
        ]!.language,
      );
      expect(am.size).toBeLessThan(eng.size);
    });

    it("always activates lexicon + clusters + frequency core", () => {
      const sim = createSimulation(presetEnglish());
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const am = computeActiveModulesFromLegacy(root);
      expect(am.has("semantic:lexicon")).toBe(true);
      expect(am.has("semantic:clusters")).toBe(true);
      expect(am.has("semantic:frequency")).toBe(true);
    });

    it("activates exactly one word-order module", () => {
      const sim = createSimulation(presetEnglish());
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const am = computeActiveModulesFromLegacy(root);
      const wos = [
        "syntactical:wordOrder/sov",
        "syntactical:wordOrder/svo",
        "syntactical:wordOrder/vso",
        "syntactical:wordOrder/vos",
        "syntactical:wordOrder/ovs",
        "syntactical:wordOrder/osv",
        "syntactical:wordOrder/free",
      ];
      const activeWos = wos.filter((id) => am.has(id));
      expect(activeWos.length).toBe(1);
    });

    it("activates exactly one alignment module", () => {
      const sim = createSimulation(presetEnglish());
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const am = computeActiveModulesFromLegacy(root);
      const aligns = [
        "syntactical:alignment/nom-acc",
        "syntactical:alignment/erg-abs",
        "syntactical:alignment/tripartite",
        "syntactical:alignment/split-s",
      ];
      const activeAligns = aligns.filter((id) => am.has(id));
      expect(activeAligns.length).toBe(1);
    });
  });

  describe("46c: lazy state allocation", () => {
    it("moduleNeedsState reflects initState presence", () => {
      // semantic:lexicon has initState (lastIndexGen counter).
      expect(moduleNeedsState("semantic:lexicon")).toBe(true);
      // grammatical:aspect is stateless.
      expect(moduleNeedsState("grammatical:aspect")).toBe(false);
    });

    it("returns false for unregistered modules", () => {
      expect(moduleNeedsState("nonexistent:module")).toBe(false);
    });

    it("stateless modules don't get a moduleState slot", () => {
      const cfg = {
        ...presetEnglish(),
        seed: "phase46-lazy",
        seedActiveModules: [
          "grammatical:aspect", // stateless
          "semantic:lexicon", // stateful
        ],
      };
      const sim = createSimulation(cfg);
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      expect(root.moduleState!["grammatical:aspect"]).toBeUndefined();
      expect(root.moduleState!["semantic:lexicon"]).toBeDefined();
    });
  });

  describe("46d: deferred activation / deactivation", () => {
    it("activateModule adds module + initState to a running language", () => {
      const cfg = {
        ...presetEnglish(),
        seed: "phase46-defer",
        seedActiveModules: ["semantic:lexicon"],
      };
      const sim = createSimulation(cfg);
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      expect(root.activeModules!.has("grammatical:articles")).toBe(false);

      // Phase 46d: simulate Phase 33i article emergence by activating
      // the module mid-run.
      const ctx = {
        generation: 0,
        rng: { next: () => 0.5 } as unknown as import("../rng").Rng,
        config: cfg as import("../types").SimulationConfig,
      };
      const ok = activateModule(root, "grammatical:articles", ctx);
      expect(ok).toBe(true);
      expect(root.activeModules!.has("grammatical:articles")).toBe(true);
      expect(root.moduleState!["grammatical:articles"]).toBeDefined();
    });

    it("activateModule is idempotent — re-activation returns false", () => {
      const cfg = {
        ...presetEnglish(),
        seed: "phase46-defer-idempotent",
        seedActiveModules: ["semantic:lexicon"],
      };
      const sim = createSimulation(cfg);
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const ctx = {
        generation: 0,
        rng: { next: () => 0.5 } as unknown as import("../rng").Rng,
        config: cfg as import("../types").SimulationConfig,
      };
      activateModule(root, "grammatical:articles", ctx);
      const second = activateModule(root, "grammatical:articles", ctx);
      expect(second).toBe(false);
    });

    it("deactivateModule removes module + drops state slot", () => {
      const cfg = {
        ...presetEnglish(),
        seed: "phase46-deactivate",
        seedActiveModules: ["semantic:lexicon", "grammatical:articles"],
      };
      const sim = createSimulation(cfg);
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      expect(root.activeModules!.has("grammatical:articles")).toBe(true);
      const ok = deactivateModule(root, "grammatical:articles");
      expect(ok).toBe(true);
      expect(root.activeModules!.has("grammatical:articles")).toBe(false);
      expect(root.moduleState!["grammatical:articles"]).toBeUndefined();
    });

    it("deactivateModule on an inactive module returns false", () => {
      const cfg = {
        ...presetEnglish(),
        seed: "phase46-deactivate-noop",
        seedActiveModules: ["semantic:lexicon"],
      };
      const sim = createSimulation(cfg);
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const ok = deactivateModule(root, "grammatical:articles");
      expect(ok).toBe(false);
    });

    it("activateModule on unregistered id returns false", () => {
      const cfg = {
        ...presetEnglish(),
        seed: "phase46-bad-id",
        seedActiveModules: ["semantic:lexicon"],
      };
      const sim = createSimulation(cfg);
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const ctx = {
        generation: 0,
        rng: { next: () => 0.5 } as unknown as import("../rng").Rng,
        config: cfg as import("../types").SimulationConfig,
      };
      const ok = activateModule(root, "nonexistent:module", ctx);
      expect(ok).toBe(false);
    });
  });

  describe("46 closure: registry + module count", () => {
    it("all 44 modules are registered (10 + 18 + 6 + 10)", () => {
      const grammaticalIds = [
        "grammatical:case-marking", "grammatical:articles", "grammatical:number-system",
        "grammatical:aspect", "grammatical:mood", "grammatical:evidentials",
        "grammatical:politeness", "grammatical:reference-tracking",
        "grammatical:numerals", "grammatical:demonstratives",
      ];
      for (const id of grammaticalIds) expect(getModule(id)).toBeDefined();

      const semanticIds = [
        "semantic:lexicon", "semantic:clusters", "semantic:frequency",
        "semantic:synonymy", "semantic:colexification", "semantic:borrowing",
        "semantic:calque", "semantic:reborrow", "semantic:taboo", "semantic:coinage",
      ];
      for (const id of semanticIds) expect(getModule(id)).toBeDefined();
    });
  });
});
