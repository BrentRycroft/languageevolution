import { describe, it, expect } from "vitest";
import { buildGrammarBrief } from "../export";
import { createSimulation } from "../../engine/simulation";
import { defaultConfig } from "../../engine/config";

describe("buildGrammarBrief", () => {
  it("produces a Markdown document with required sections", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "brief" });
    for (let i = 0; i < 40; i++) sim.step();
    const state = sim.getState();
    const md = buildGrammarBrief(state, state.rootId);
    expect(md.length).toBeGreaterThan(100);
    expect(md).toContain("# ");
    expect(md).toContain("## Grammar features");
    expect(md).toContain("## Phoneme inventory");
    expect(md).toContain("## Active sound laws");
    expect(md).toContain("## OT ranking");
  });

  it("returns empty string for unknown language id", () => {
    const sim = createSimulation(defaultConfig());
    expect(buildGrammarBrief(sim.getState(), "L-nope")).toBe("");
  });
});
