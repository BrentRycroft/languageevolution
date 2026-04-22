import { describe, it, expect } from "vitest";
import {
  applyGeneratedRule,
  matchSites,
  generatedToSoundChange,
  type GeneratedRule,
} from "../phonology/generated";
import { makeRng } from "../rng";

function rule(overrides: Partial<GeneratedRule> = {}): GeneratedRule {
  return {
    id: "L-0.g0.lenition.stops_to_fricatives_intervocalic",
    family: "lenition",
    templateId: "lenition.stops_to_fricatives_intervocalic",
    description: "Stops lenite between vowels",
    birthGeneration: 0,
    lastFireGeneration: 0,
    strength: 1,
    from: { type: "consonant", manner: "stop" },
    context: { locus: "intervocalic" },
    outputMap: { p: "f", t: "θ", k: "x" },
    ...overrides,
  };
}

describe("phonology/generated", () => {
  it("matchSites finds intervocalic stops", () => {
    const r = rule();
    expect(matchSites(r, ["p", "a", "t", "a"])).toEqual([2]); // /p/ is word-initial.
    expect(matchSites(r, ["a", "p", "a", "t", "a"])).toEqual([1, 3]);
    expect(matchSites(r, ["p"])).toEqual([]);
  });

  it("applyGeneratedRule rewrites matched sites", () => {
    const r = rule();
    const rng = makeRng("apply");
    const out = applyGeneratedRule(r, ["a", "p", "a", "t", "a"], rng);
    expect(out).toEqual(["a", "f", "a", "θ", "a"]);
  });

  it("applyGeneratedRule deletes empty-string outputs", () => {
    const r = rule({
      templateId: "deletion.final_consonant",
      family: "deletion",
      outputMap: { t: "" },
      context: { position: "final" },
    });
    const rng = makeRng("del");
    expect(applyGeneratedRule(r, ["k", "a", "t"], rng)).toEqual(["k", "a"]);
  });

  it("zero strength means no firings regardless of sites", () => {
    const r = rule({ strength: 0 });
    const rng = makeRng("z");
    expect(applyGeneratedRule(r, ["a", "p", "a"], rng)).toEqual(["a", "p", "a"]);
  });

  it("generatedToSoundChange gives a SoundChange whose probabilityFor > 0 when sites exist", () => {
    const r = rule();
    const sc = generatedToSoundChange(r);
    expect(sc.id).toBe(r.id);
    expect(sc.probabilityFor(["a", "p", "a"])).toBeGreaterThan(0);
    expect(sc.probabilityFor(["k"])).toBe(0);
  });
});
