import { describe, expect, it } from "vitest";
import {
  CONCEPT_IDS,
  conceptsAtOrBelow,
  tierOf,
} from "../lexicon/concepts";
import { lexicalNeed } from "../genesis/need";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";

/**
 * sprint5_dictionary_expansion.test.ts
 *
 * Test suite for: "§H.1 — concept dictionary breadth + tier gating".
 *
 * G1: the inventory is now geometry-derived (the embedding vocabulary), so the
 * tier of each concept comes from its corpus-frequency rank rather than a hand
 * cultural-era table. The breadth + tier-gating behaviour these tests lock is
 * unchanged; the specific concept→tier assignments are re-baked to the derived
 * values.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("§H.1 — concept dictionary breadth + tier gating", () => {
  it("CONCEPT_IDS spans a broad inventory", () => {
    expect(CONCEPT_IDS.length).toBeGreaterThan(1000);
  });

  it("coreness tiers nest and high tiers carry rare concepts", () => {
    const tier0 = conceptsAtOrBelow(0);
    const tier1 = conceptsAtOrBelow(1);
    const tier2 = conceptsAtOrBelow(2);
    const tier3 = conceptsAtOrBelow(3);
    expect(tier0.length).toBeLessThan(tier1.length);
    expect(tier1.length).toBeLessThan(tier2.length);
    expect(tier2.length).toBeLessThan(tier3.length);
    // Rare/technical material words land in the top (rarest) tier.
    expect(tierOf("plow")).toBe(3);
    expect(tierOf("smelter")).toBe(3);
    expect(tierOf("scribe")).toBe(3);
  });

  it("mid-frequency material concepts are tier 2", () => {
    expect(tierOf("iron")).toBe(2);
    expect(tierOf("merchant")).toBe(2);
    expect(tierOf("vaccine")).toBe(2);
  });

  it("lexicalNeed gates expansion concepts by the language's tier", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "need-tier-gate" });
    sim.step();
    const state = sim.getState();
    const proto = state.tree["L-0"]!.language;
    proto.culturalTier = 0;
    const need = lexicalNeed(proto, state.tree);
    expect(need["computer"] ?? 0).toBe(0);
    expect(need["democracy"] ?? 0).toBe(0);
    expect(need["vaccine"] ?? 0).toBe(0);
  });

  it("lexicalNeed includes tier-3 expansion concepts when the language is tier 3", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "need-tier3" });
    sim.step();
    const state = sim.getState();
    const proto = state.tree["L-0"]!.language;
    proto.culturalTier = 3;
    const need = lexicalNeed(proto, state.tree);
    let positive = 0;
    for (const id of CONCEPT_IDS) {
      if (tierOf(id) === 3 && (need[id] ?? 0) > 0) positive++;
    }
    expect(positive).toBeGreaterThan(0);
  });
});
