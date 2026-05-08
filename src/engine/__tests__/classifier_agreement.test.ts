import { describe, it, expect } from "vitest";
import {
  classifierKeyFor,
  classifierMeaningFor,
  classifierFormFor,
  DEFAULT_CLASSIFIER_TABLE,
} from "../translator/classifiers";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";

/**
 * classifier_agreement.test.ts
 *
 * Test suite for: "Phase 64 T3 — classifier agreement on counted nouns".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("Phase 64 T3 — classifier agreement on counted nouns", () => {
  it("classifierKeyFor maps nouns to semantic classes", () => {
    expect(classifierKeyFor("mother")).toBe("human");
    expect(classifierKeyFor("dog")).toBe("animal");
    expect(classifierKeyFor("stick")).toBe("long_thin");
    expect(classifierKeyFor("water")).toBe("liquid");
    expect(classifierKeyFor("boat")).toBe("vehicle");
    expect(classifierKeyFor("knife")).toBe("default");
  });

  it("classifierMeaningFor returns class meanings via the default table", () => {
    expect(classifierMeaningFor("mother")).toBe("person");
    expect(classifierMeaningFor("dog")).toBe("creature");
    expect(classifierMeaningFor("water")).toBe("drop");
  });

  it("classifierMeaningFor honours an override table with strings", () => {
    const custom = { human: "ren", animal: "tier", default: "ding" };
    expect(classifierMeaningFor("mother", custom)).toBe("ren");
    expect(classifierMeaningFor("knife", custom)).toBe("ding");
  });

  it("classifierFormFor reads direct Phoneme[] entries from the table", () => {
    const formTable: Record<string, string | string[]> = {
      human: ["m", "i"],
      animal: ["k", "a"],
      default: ["p", "u"],
    };
    expect(classifierFormFor("mother", formTable)).toEqual(["m", "i"]);
    expect(classifierFormFor("dog", formTable)).toEqual(["k", "a"]);
    expect(classifierFormFor("knife", formTable)).toEqual(["p", "u"]);
    expect(classifierFormFor("mother", { human: "person" })).toBeNull();
  });

  it("classifierTable is auto-populated with distinct CV forms when classifierSystem is true", () => {
    const config = presetEnglish();
    config.seedGrammar = { ...config.seedGrammar!, classifierSystem: true };
    const sim = createSimulation({ ...config, seed: "clf-init" });
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    expect(lang.grammar.classifierSystem).toBe(true);
    expect(lang.grammar.classifierTable).toBeDefined();
    const table = lang.grammar.classifierTable!;
    // Every key from DEFAULT_CLASSIFIER_TABLE has a Phoneme[] entry.
    for (const k of Object.keys(DEFAULT_CLASSIFIER_TABLE)) {
      const v = table[k];
      expect(Array.isArray(v) || typeof v === "string").toBe(true);
      if (Array.isArray(v)) expect(v.length).toBeGreaterThan(0);
    }
    // At least 5 distinct surface forms across the 9 classes.
    const surfaces = new Set<string>();
    for (const v of Object.values(table)) {
      if (Array.isArray(v)) surfaces.add(v.join(""));
    }
    expect(surfaces.size).toBeGreaterThanOrEqual(5);
  });

  it("languages without classifierSystem do not get a default table", () => {
    const sim = createSimulation({ ...presetEnglish(), seed: "no-clf" });
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    expect(lang.grammar.classifierSystem).toBeFalsy();
    expect(lang.grammar.classifierTable).toBeUndefined();
  });
});
