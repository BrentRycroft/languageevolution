import { describe, it, expect } from "vitest";
import { proposePushChain } from "../phonology/propose";
import type { GeneratedRule } from "../phonology/generated";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";

describe("chain shift pairing", () => {
  it("returns null for non-single-raise rules", () => {
    const sim = createSimulation(defaultConfig());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    const fakeRule: GeneratedRule = {
      id: "x",
      family: "lenition",
      templateId: "lenition.something",
      description: "not a vowel shift",
      from: { type: "vowel" },
      context: { locus: "any" },
      outputMap: { a: "e" },
      birthGeneration: 0,
      lastFireGeneration: 0,
      strength: 0.3,
    };
    expect(proposePushChain(lang, fakeRule, 0)).toBeNull();
  });

  it("returns null when the target vowel is NOT already in the inventory", () => {
    const sim = createSimulation(defaultConfig());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.phonemeInventory.segmental = ["a", "i", "o", "u", "p", "t", "k"];
    const seed: GeneratedRule = {
      id: "y",
      family: "vowel_shift",
      templateId: "vowel_shift.single_raise",
      description: "/a/ raises to /e/",
      from: { type: "vowel" },
      context: { locus: "any" },
      outputMap: { a: "e" },
      birthGeneration: 0,
      lastFireGeneration: 0,
      strength: 0.3,
    };
    expect(proposePushChain(lang, seed, 0)).toBeNull();
  });

  it("pairs a push rule when the target vowel already exists", () => {
    const sim = createSimulation(defaultConfig());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    // Phase 48 T7: inventory deliberately omits the next-up height
    // target ("i") so the push chain can introduce it. With "i" in
    // inventory, shiftHeight("e", 1) → "i" already present → null.
    lang.phonemeInventory.segmental = ["a", "e", "o", "u", "p", "t", "k"];
    const seed: GeneratedRule = {
      id: "z",
      family: "vowel_shift",
      templateId: "vowel_shift.single_raise",
      description: "/a/ raises to /e/",
      from: { type: "vowel" },
      context: { locus: "any" },
      outputMap: { a: "e" },
      birthGeneration: 0,
      lastFireGeneration: 0,
      strength: 0.3,
    };
    const push = proposePushChain(lang, seed, 5);
    expect(push).not.toBeNull();
    if (!push) return;
    expect(push.outputMap.e).toBeDefined();
    expect(push.outputMap.e).not.toBe("e");
    expect(push.id).toBe("z.push");
    expect(push.birthGeneration).toBe(5);
  });
});
