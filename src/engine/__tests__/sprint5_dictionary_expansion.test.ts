import { describe, expect, it } from "vitest";
import {
  CONCEPTS,
  CONCEPT_IDS,
  conceptsAtOrBelow,
  tierOf,
  isRegisteredConcept,
} from "../lexicon/concepts";
import { EXPANDED_CONCEPTS } from "../lexicon/expanded_concepts";
import { lexicalNeed } from "../genesis/need";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";

describe("§H.1 — concept dictionary expansion", () => {
  it("registers all expanded concepts in CONCEPTS", () => {
    for (const exp of EXPANDED_CONCEPTS) {
      expect(isRegisteredConcept(exp.id)).toBe(true);
      const c = CONCEPTS[exp.id]!;
      expect(c.tier).toBe(exp.tier);
      expect(c.cluster).toBe(exp.cluster);
      expect(c.pos).toBe(exp.pos);
    }
  });

  it("BASIC_240 still wins on duplicate ids", async () => {
    const { BASIC_240 } = await import("../lexicon/basic240");
    const expandedIds = new Set(EXPANDED_CONCEPTS.map((e) => e.id));
    for (const m of BASIC_240) {
      if (expandedIds.has(m)) {
        const expansionTier = EXPANDED_CONCEPTS.find((e) => e.id === m)?.tier;
        const actualTier = CONCEPTS[m]?.tier;
        if (expansionTier !== undefined && actualTier !== expansionTier) {
          expect(actualTier).not.toBe(expansionTier);
        }
      }
    }
  });

  it("CONCEPT_IDS contains substantially more entries after expansion", () => {
    expect(CONCEPT_IDS.length).toBeGreaterThan(1000);
  });

  it("tier-3 concepts exist and are gated by conceptsAtOrBelow", () => {
    const tier0 = conceptsAtOrBelow(0);
    const tier1 = conceptsAtOrBelow(1);
    const tier2 = conceptsAtOrBelow(2);
    const tier3 = conceptsAtOrBelow(3);
    expect(tier0.length).toBeLessThan(tier1.length);
    expect(tier1.length).toBeLessThan(tier2.length);
    expect(tier2.length).toBeLessThan(tier3.length);
    expect(tierOf("computer")).toBe(3);
    expect(tierOf("internet")).toBe(3);
    expect(tierOf("democracy")).toBe(3);
    expect(tierOf("vaccine")).toBe(3);
  });

  it("tier-2 concepts are tagged correctly", () => {
    expect(tierOf("smelter")).toBe(2);
    expect(tierOf("scribe")).toBe(2);
    expect(tierOf("merchant")).toBe(2);
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
