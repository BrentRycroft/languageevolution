import { describe, it, expect } from "vitest";
import { satGet } from "../lexicon/satellites";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

/**
 * lexicogenesis_e2e.test.ts
 *
 * Test suite for: "lexicogenesis e2e".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("lexicogenesis e2e", () => {
  it("coinages are fully tagged and trackable", () => {
    const sim = createSimulation({
      ...defaultConfig(),
      seed: "lexicogenesis-e2e",
      genesis: { ...defaultConfig().genesis, globalRate: 0.3 },
    });
    for (let i = 0; i < 300; i++) sim.step();
    const state = sim.getState();
    for (const id of leafIds(state.tree)) {
      const lang = state.tree[id]!.language;
      for (const m of Object.keys(lang.lexemes)) {
        expect(lang.lexemes[m]!.form.length, `empty form for ${m}`).toBeGreaterThan(0);
      }
      const coined = Object.keys(lang.wordOrigin);
      for (const m of coined) {
        if (!lang.lexemes[m]) continue;
        // Coined words must be TRACKABLE (non-empty provenance) and have
        // a legal form (asserted above). A frequency hint is OPTIONAL by
        // contract: `frequencyFor` falls back to DEFAULT_FREQUENCY when a
        // meaning has no explicit hint, and some coinage paths (e.g. a
        // primary loan dropped then restored via sense churn) legitimately
        // leave it unset. If a hint IS present it must be a valid [0,1].
        expect(lang.wordOrigin[m]!.length).toBeGreaterThan(0);
        const f = satGet(lang, "wordFrequencyHints", m);
        if (f !== undefined) {
          expect(f, `freq range for coined ${m}`).toBeGreaterThanOrEqual(0);
          expect(f, `freq range for coined ${m}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("events log emits at least one non-default origin tag", () => {
    const sim = createSimulation({
      ...defaultConfig(),
      seed: "lexicogenesis-origins",
      genesis: { ...defaultConfig().genesis, globalRate: 0.4 },
      tree: { ...defaultConfig().tree, splitProbabilityPerGeneration: 0.15 },
    });
    for (let i = 0; i < 200; i++) sim.step();
    const state = sim.getState();
    const tags = new Set<string>();
    for (const id of Object.keys(state.tree)) {
      for (const e of state.tree[id]!.language.events) {
        if (e.kind !== "coinage") continue;
        const tag = e.description.split(":")[0]!;
        tags.add(tag);
      }
    }
    expect(tags.size).toBeGreaterThanOrEqual(2);
  });
});
