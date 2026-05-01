import { describe, it, expect } from "vitest";
import { defaultConfig } from "../../engine/config";
import { useSimStore } from "../../state/store";

describe("PR C — sidebar + dictionary refactor", () => {
  it("default config: unlimitedLeaves is false (soft cap engages)", () => {
    const cfg = defaultConfig();
    expect(cfg.tree.unlimitedLeaves).toBe(false);
  });

  it("default config: maxLeaves is the soft-cap target (≥ 8)", () => {
    const cfg = defaultConfig();
    expect(cfg.tree.maxLeaves).toBeGreaterThanOrEqual(8);
  });

  it("reset() rolls a fresh seed each call", () => {
    const before = useSimStore.getState().config.seed;
    useSimStore.getState().reset();
    const after = useSimStore.getState().config.seed;
    expect(after).not.toBe(before);
  });

  it("reset() leaves the rest of the config (preset, modes, rates) intact", () => {
    const beforeCfg = useSimStore.getState().config;
    useSimStore.getState().reset();
    const afterCfg = useSimStore.getState().config;
    expect(afterCfg.preset).toBe(beforeCfg.preset);
    expect(afterCfg.modes).toEqual(beforeCfg.modes);
    expect(afterCfg.phonology.globalRate).toBe(beforeCfg.phonology.globalRate);
  });
});
