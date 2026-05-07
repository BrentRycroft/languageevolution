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
    // Phase 50 T1: structuredClone preserves Set-valued state
    // (activeModules, boundMorphemes). JSON.parse(JSON.stringify(...))
    // coerces Sets to {}, which silently broke determinism on resume —
    // the module step()s became no-ops post-restore. Real persistence
    // (idbSet) goes through structured-clone, so this matches the
    // production path. restoreState also rehydrates any non-Set Set
    // fields it finds (defensive guard for the JSON-only path).
    const snapshot = structuredClone(simA.getState());

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
