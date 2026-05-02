import { describe, it, expect } from "vitest";
import { migrateSavedRun, LATEST_SAVE_VERSION } from "../migrate";
import { defaultConfig } from "../../engine/config";

describe("migrateSavedRun", () => {
  it("upgrades a v1 run (no genesis/grammar/etc) to latest", () => {
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
    expect(migrated.version).toBe(LATEST_SAVE_VERSION);
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

  it("upgrades intermediate versions through every step", () => {
    for (let v = 1; v <= LATEST_SAVE_VERSION; v++) {
      const cfg = defaultConfig();
      const payload = {
        version: v,
        id: `at-v${v}`,
        label: `at v${v}`,
        createdAt: 100 * v,
        config: cfg,
        generationsRun: v,
      };
      const migrated = migrateSavedRun(payload);
      expect(migrated, `version ${v} migration`).not.toBeNull();
      expect(migrated?.version).toBe(LATEST_SAVE_VERSION);
      expect(migrated?.id).toBe(`at-v${v}`);
      expect(migrated?.generationsRun).toBe(v);
    }
  });

  it("passes a current-version run through unchanged in shape", () => {
    const cfg = defaultConfig();
    const latest = {
      version: LATEST_SAVE_VERSION,
      id: "run-new",
      label: "new run",
      createdAt: 2000,
      config: cfg,
      generationsRun: 0,
    };
    const migrated = migrateSavedRun(latest);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(LATEST_SAVE_VERSION);
    expect(migrated?.config.modes.grammar).toBe(cfg.modes.grammar);
  });

  it("rejects payloads from a future version", () => {
    expect(
      migrateSavedRun({ version: LATEST_SAVE_VERSION + 1, config: {} }),
    ).toBeNull();
  });

  it("rejects garbage", () => {
    expect(migrateSavedRun(null)).toBeNull();
    expect(migrateSavedRun(42)).toBeNull();
    expect(migrateSavedRun({ version: 99, config: {} })).toBeNull();
    expect(migrateSavedRun({ version: 1 })).toBeNull();
  });
});
