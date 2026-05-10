import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";
import { deleteMeaning } from "../lexicon/mutate";
import {
  PER_MEANING_FIELDS,
  BESPOKE_PER_MEANING_FIELDS,
  purgeMeaningFromRegistry,
} from "../perMeaningFields";

/**
 * phase72d_field_registry.test.ts — Phase 72d T1.
 */

describe("Phase 72d-1 — per-meaning field registry", () => {
  it("PER_MEANING_FIELDS has at least the Phase 64 / Phase 71 fields", () => {
    const keys = PER_MEANING_FIELDS.map((s) => s.key);
    expect(keys).toContain("inflectionClass");
    expect(keys).toContain("nounDeclensionClass");
    expect(keys).toContain("ablautClassAssignment");
    expect(keys).toContain("grammaticalizationStage");
    expect(keys).toContain("suppletion");
    expect(keys).toContain("wordFrequencyHints");
    expect(keys).toContain("lastChangeGeneration");
    expect(keys).toContain("wordOrigin");
  });

  it("purgeMeaningFromRegistry removes every per-meaning entry for a meaning", () => {
    const cfg = presetRomance();
    cfg.seed = "p72d-purge";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    // Seed the meaning into multiple registered fields.
    const meaning = "test-meaning";
    if (!lang.wordFrequencyHints) lang.wordFrequencyHints = {};
    lang.wordFrequencyHints[meaning] = 0.5;
    if (!lang.wordOrigin) lang.wordOrigin = {};
    lang.wordOrigin[meaning] = "test";
    if (!lang.lastChangeGeneration) lang.lastChangeGeneration = {};
    lang.lastChangeGeneration[meaning] = 0;
    if (!lang.inflectionClass) lang.inflectionClass = {};
    lang.inflectionClass[meaning] = 1;
    if (!lang.nounDeclensionClass) lang.nounDeclensionClass = {};
    lang.nounDeclensionClass[meaning] = 1;

    const purged = purgeMeaningFromRegistry(lang, meaning);
    expect(purged).toBeGreaterThanOrEqual(5);
    expect(lang.wordFrequencyHints[meaning]).toBeUndefined();
    expect(lang.wordOrigin[meaning]).toBeUndefined();
    expect(lang.lastChangeGeneration[meaning]).toBeUndefined();
    expect(lang.inflectionClass[meaning]).toBeUndefined();
    expect(lang.nounDeclensionClass[meaning]).toBeUndefined();
  });

  it("deleteMeaning routes through the registry; bespoke fields (lexicon) handled separately", () => {
    const cfg = presetRomance();
    cfg.seed = "p72d-delete";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    const meaning = "tail"; // a content word; not in PROTECTED_MEANINGS
    expect(lang.lexicon[meaning]).toBeDefined();
    deleteMeaning(lang, meaning);
    expect(lang.lexicon[meaning]).toBeUndefined();
    expect(lang.wordOrigin[meaning]).toBeUndefined();
    expect(lang.wordFrequencyHints[meaning]).toBeUndefined();
  });

  it("BESPOKE_PER_MEANING_FIELDS lists fields not in the registry", () => {
    expect(BESPOKE_PER_MEANING_FIELDS.has("lexicon")).toBe(true);
    expect(BESPOKE_PER_MEANING_FIELDS.has("words")).toBe(true);
    // Registered fields should NOT be in the bespoke set.
    for (const spec of PER_MEANING_FIELDS) {
      expect(BESPOKE_PER_MEANING_FIELDS.has(spec.key as string)).toBe(false);
    }
  });
});

describe("Phase 72d-2 — meaning merger pathway tracker", () => {
  it("deleteMeaning with mergedInto records to lang.meaningHistory", () => {
    const cfg = presetRomance();
    cfg.seed = "p72d-merger";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    expect(lang.lexicon.tail).toBeDefined();
    deleteMeaning(lang, "tail", {
      mergedInto: "back",
      generation: 5,
      reason: "homonym-collision",
    });
    expect(lang.lexicon.tail).toBeUndefined();
    expect(lang.meaningHistory).toBeDefined();
    expect(lang.meaningHistory!.tail).toBeDefined();
    expect(lang.meaningHistory!.tail.mergedInto).toBe("back");
    expect(lang.meaningHistory!.tail.generation).toBe(5);
    expect(lang.meaningHistory!.tail.reason).toBe("homonym-collision");
  });

  it("deleteMeaning without options does NOT record history (back-compat)", () => {
    const cfg = presetRomance();
    cfg.seed = "p72d-no-merger";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    deleteMeaning(lang, "tail");
    expect(lang.lexicon.tail).toBeUndefined();
    // meaningHistory should remain undefined or not contain "tail".
    expect(lang.meaningHistory?.tail).toBeUndefined();
  });

  it("PROTECTED_MEANINGS still resist deletion even with mergedInto", () => {
    const cfg = presetRomance();
    cfg.seed = "p72d-protected";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    // "be" is in PROTECTED_MEANINGS
    expect(lang.lexicon.be).toBeDefined();
    deleteMeaning(lang, "be", {
      mergedInto: "exist",
      generation: 5,
      reason: "test",
    });
    // refused
    expect(lang.lexicon.be).toBeDefined();
    // and meaningHistory should NOT have been written
    expect(lang.meaningHistory?.be).toBeUndefined();
  });
});
