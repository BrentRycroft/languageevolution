import { describe, it, expect } from "vitest";
import { migrateSavedRun } from "../migrate";
import { defaultConfig } from "../../engine/config";

describe("migrateSavedRun", () => {
  it("upgrades a v1 run (no genesis/grammar/etc) to latest (v4)", () => {
    const v1 = {
      version: 1,
      id: "run-old",
      label: "old run",
      createdAt: 1000,
      config: {
        seed: "hello",
        modes: { phonology: true, tree: true },
        phonology: {
          globalRate: 1,
          enabledChangeIds: ["lenition.p_to_f"],
          changeWeights: { "lenition.p_to_f": 1 },
        },
        tree: {
          splitProbabilityPerGeneration: 0.05,
          maxLeaves: 6,
          minGenerationsBetweenSplits: 12,
        },
        seedLexicon: { water: ["w", "a"] },
      },
      generationsRun: 42,
    };
    const migrated = migrateSavedRun(v1);
    expect(migrated).not.toBeNull();
    if (!migrated) return;
    expect(migrated.version).toBe(5);
    expect(migrated.id).toBe("run-old");
    expect(migrated.generationsRun).toBe(42);
    expect(migrated.config.genesis).toBeDefined();
    expect(migrated.config.grammar).toBeDefined();
    expect(migrated.config.semantics).toBeDefined();
    expect(migrated.config.modes.genesis).toBeDefined();
    expect(migrated.config.modes.death).toBeDefined();
    expect(migrated.config.tree.deathProbabilityPerGeneration).toBeDefined();
    expect(migrated.config.seed).toBe("hello");
  });

  it("passes a current-version run through unchanged in shape", () => {
    const cfg = defaultConfig();
    const latest = {
      version: 4,
      id: "run-new",
      label: "new run",
      createdAt: 2000,
      config: cfg,
      generationsRun: 0,
    };
    const migrated = migrateSavedRun(latest);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(5);
    expect(migrated?.config.modes.grammar).toBe(cfg.modes.grammar);
  });

  it("rejects garbage", () => {
    expect(migrateSavedRun(null)).toBeNull();
    expect(migrateSavedRun(42)).toBeNull();
    expect(migrateSavedRun({ version: 99, config: {} })).toBeNull();
    expect(migrateSavedRun({ version: 1 /* no config */ })).toBeNull();
  });
});
