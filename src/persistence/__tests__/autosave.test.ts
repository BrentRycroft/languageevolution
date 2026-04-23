import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveAutosave, loadAutosave, clearAutosave } from "../autosave";
import { createSimulation } from "../../engine/simulation";
import { defaultConfig } from "../../engine/config";

describe("autosave", () => {
  beforeEach(() => {
    // jsdom provides a real localStorage; reset it between tests.
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    clearAutosave();
  });

  it("returns null when nothing has been saved", () => {
    expect(loadAutosave()).toBeNull();
  });

  it("round-trips a real simulation state", () => {
    const config = { ...defaultConfig(), seed: "autosave-round" };
    const sim = createSimulation(config);
    for (let i = 0; i < 15; i++) sim.step();
    const state = sim.getState();
    saveAutosave(
      { config, state, generationsRun: state.generation },
      { force: true },
    );
    const loaded = loadAutosave();
    expect(loaded).not.toBeNull();
    if (!loaded) return;
    expect(loaded.state.generation).toBe(state.generation);
    expect(Object.keys(loaded.state.tree).length).toBe(
      Object.keys(state.tree).length,
    );
    expect(loaded.config.seed).toBe("autosave-round");
  });

  it("throttles rapid repeat saves", () => {
    const config = { ...defaultConfig(), seed: "throttle" };
    const sim = createSimulation(config);
    sim.step();
    const first = sim.getState();
    saveAutosave({ config, state: first, generationsRun: 1 });
    const a = loadAutosave();
    expect(a?.state.generation).toBe(1);
    // A second save within the throttle window should NOT overwrite the
    // first (no `force`). So loading still shows gen=1 even though we
    // passed a higher-generation state.
    sim.step();
    const second = sim.getState();
    saveAutosave({ config, state: second, generationsRun: 2 });
    const b = loadAutosave();
    expect(b?.state.generation).toBe(1);
    // But `force: true` always writes.
    saveAutosave(
      { config, state: second, generationsRun: 2 },
      { force: true },
    );
    const c = loadAutosave();
    expect(c?.state.generation).toBe(2);
  });

  it("clearAutosave empties the slot", () => {
    const config = { ...defaultConfig(), seed: "clear" };
    const sim = createSimulation(config);
    sim.step();
    saveAutosave(
      { config, state: sim.getState(), generationsRun: 1 },
      { force: true },
    );
    expect(loadAutosave()).not.toBeNull();
    clearAutosave();
    expect(loadAutosave()).toBeNull();
  });

  it("survives a corrupt payload without throwing", () => {
    try {
      localStorage.setItem("lev.autosave.v1", "{not valid json");
    } catch {
      // ignore
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(loadAutosave()).toBeNull();
    spy.mockRestore();
  });
});
