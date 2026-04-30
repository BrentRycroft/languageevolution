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

  it("returns ok=false / reason=empty when nothing has been saved", () => {
    const result = loadAutosave();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("empty");
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
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.payload.state.generation).toBe(state.generation);
    expect(Object.keys(loaded.payload.state.tree).length).toBe(
      Object.keys(state.tree).length,
    );
    expect(loaded.payload.config.seed).toBe("autosave-round");
  });

  it("throttles rapid repeat saves", () => {
    const config = { ...defaultConfig(), seed: "throttle" };
    const sim = createSimulation(config);
    sim.step();
    const first = sim.getState();
    saveAutosave({ config, state: first, generationsRun: 1 });
    const a = loadAutosave();
    expect(a.ok && a.payload.state.generation).toBe(1);
    // A second save within the throttle window should NOT overwrite the
    // first (no `force`). So loading still shows gen=1 even though we
    // passed a higher-generation state.
    sim.step();
    const second = sim.getState();
    saveAutosave({ config, state: second, generationsRun: 2 });
    const b = loadAutosave();
    expect(b.ok && b.payload.state.generation).toBe(1);
    // But `force: true` always writes.
    saveAutosave(
      { config, state: second, generationsRun: 2 },
      { force: true },
    );
    const c = loadAutosave();
    expect(c.ok && c.payload.state.generation).toBe(2);
  });

  it("clearAutosave empties the slot", () => {
    const config = { ...defaultConfig(), seed: "clear" };
    const sim = createSimulation(config);
    sim.step();
    saveAutosave(
      { config, state: sim.getState(), generationsRun: 1 },
      { force: true },
    );
    expect(loadAutosave().ok).toBe(true);
    clearAutosave();
    const result = loadAutosave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("returns reason=corrupt on an invalid JSON payload", () => {
    try {
      localStorage.setItem("lev.autosave.v2", "{not valid json");
    } catch {
      // ignore
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = loadAutosave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("corrupt");
    spy.mockRestore();
  });

  it("returns reason=future-version on a payload from a newer build", () => {
    try {
      localStorage.setItem(
        "lev.autosave.v2",
        JSON.stringify({
          version: 99,
          savedAt: 1234,
          config: defaultConfig(),
          generationsRun: 0,
          stateSnapshot: {},
        }),
      );
    } catch {
      // ignore
    }
    const result = loadAutosave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("future-version");
  });

  it("saveAutosave returns ok=true on success", () => {
    const config = { ...defaultConfig(), seed: "result-shape" };
    const sim = createSimulation(config);
    sim.step();
    const result = saveAutosave(
      { config, state: sim.getState(), generationsRun: 1 },
      { force: true },
    );
    expect(result.ok).toBe(true);
  });
});
