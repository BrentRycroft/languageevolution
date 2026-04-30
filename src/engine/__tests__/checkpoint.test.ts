import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";

function stableKey(state: ReturnType<ReturnType<typeof createSimulation>["getState"]>) {
  const tree = state.tree;
  return Object.keys(tree)
    .sort()
    .map((id) => {
      const lang = tree[id]!.language;
      const lex = Object.keys(lang.lexicon).sort();
      return (
        `${id}:${lang.name}:ext=${lang.extinct ?? false}:` +
        lex.map((m) => `${m}=${lang.lexicon[m]!.join("")}`).join(",")
      );
    })
    .join("|");
}

describe("checkpoint save/restore", () => {
  it("restoreState produces identical continuing behaviour", () => {
    const cfg = { ...defaultConfig(), seed: "checkpoint-test" };
    const simA = createSimulation(cfg);
    for (let i = 0; i < 80; i++) simA.step();
    const snapshot = JSON.parse(JSON.stringify(simA.getState()));

    const simB = createSimulation(cfg);
    simB.restoreState(snapshot);
    expect(stableKey(simB.getState())).toBe(stableKey(simA.getState()));

    for (let i = 0; i < 30; i++) {
      simA.step();
      simB.step();
    }
    expect(stableKey(simB.getState())).toBe(stableKey(simA.getState()));
  });
});
