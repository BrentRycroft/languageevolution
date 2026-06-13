import { describe, it, expect } from "vitest";
import { migrateSavedRun, LATEST_SAVE_VERSION } from "../migrate";
import { defaultConfig } from "../../engine/config";

/**
 * migrate.test.ts
 *
 * Test suite for: "migrateSavedRun".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

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

  it("v9→v10 (Phase 72 defer-3) initializes endangermentLevel for non-extinct leaves", () => {
    const cfg = defaultConfig();
    const v9Payload = {
      version: 9,
      id: "v9-test",
      label: "v9 test",
      createdAt: 0,
      config: cfg,
      generationsRun: 0,
      stateSnapshot: {
        generation: 0,
        rootId: "L-0",
        rngState: 1,
        tree: {
          "L-0": {
            language: {
              id: "L-0",
              name: "Proto",
              extinct: false,
              // Phase 72 fields intentionally absent — migration should init.
            },
            parentId: null,
            childrenIds: [],
          },
        },
      },
    };
    const migrated = migrateSavedRun(v9Payload);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(LATEST_SAVE_VERSION);
    const lang = (migrated!.stateSnapshot as any)?.tree["L-0"]?.language;
    expect(lang.endangermentLevel).toBe("vigorous");
  });
});

describe("S6 — v11 point-native store migration", () => {
  it("converts an old-shape v10 save (id-keyed form-only lexicon) to point-native records", () => {
    const raw = {
      version: 10,
      config: { preset: "english" },
      stateSnapshot: {
        tree: {
          "L-0": {
            language: {
              id: "L-0",
              lexemeIds: { water: "c_w" },
              lexicon: { c_w: [] }, // id-keyed form-only (pre-S1 shape)
            },
          },
        },
        generation: 0,
      },
    };
    const migrated = migrateSavedRun(raw as unknown);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(LATEST_SAVE_VERSION);
    const lang = (migrated!.stateSnapshot as any).tree["L-0"].language;
    expect(lang.lexemes).toBeDefined();         // records materialized
    expect(lang.lexemes.c_w).toBeDefined();
    expect(lang.lexemes.c_w.gloss).toBe("water");
    expect(lang.lexicon).toBeUndefined();       // old form-only map dropped
  });

  it("is a no-op for an already point-native save (idempotent round-trip)", () => {
    const raw = {
      version: 10,
      config: { preset: "english" },
      stateSnapshot: {
        tree: {
          "L-0": {
            language: {
              id: "L-0",
              lexemeIds: { water: "c_w" },
              lexemes: { c_w: { form: [], point: [0], gloss: "water" } },
            },
          },
        },
        generation: 0,
      },
    };
    const migrated = migrateSavedRun(raw as unknown);
    const lang = (migrated!.stateSnapshot as any).tree["L-0"].language;
    expect(lang.lexemes.c_w.gloss).toBe("water"); // unchanged
    expect(lang.lexicon).toBeUndefined();
  });
});
