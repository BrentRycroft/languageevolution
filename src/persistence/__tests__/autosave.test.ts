import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveAutosave, loadAutosave, clearAutosave } from "../autosave";
import { createSimulation } from "../../engine/simulation";
import { defaultConfig } from "../../engine/config";
import { idbSet, _resetIdbHandle } from "../idb";

describe("autosave", () => {
  beforeEach(async () => {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    // Phase 38+: with IDB, clear by deleting the autosave key.
    await clearAutosave();
  });

  it("returns ok=false / reason=empty when nothing has been saved", async () => {
    const result = await loadAutosave();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("empty");
  });

  it("round-trips a real simulation state", async () => {
    const config = { ...defaultConfig(), seed: "autosave-round" };
    const sim = createSimulation(config);
    for (let i = 0; i < 15; i++) sim.step();
    const state = sim.getState();
    await saveAutosave(
      { config, state, generationsRun: state.generation },
      { force: true },
    );
    const loaded = await loadAutosave();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.payload.state.generation).toBe(state.generation);
    expect(Object.keys(loaded.payload.state.tree).length).toBe(
      Object.keys(state.tree).length,
    );
    expect(loaded.payload.config.seed).toBe("autosave-round");
  });

  it("throttles rapid repeat saves", async () => {
    const config = { ...defaultConfig(), seed: "throttle" };
    const sim = createSimulation(config);
    sim.step();
    const first = sim.getState();
    await saveAutosave({ config, state: first, generationsRun: 1 }, { force: true });
    const a = await loadAutosave();
    expect(a.ok && a.payload.state.generation).toBe(1);
    sim.step();
    const second = sim.getState();
    // Throttled (no force, less than MIN_SAVE_INTERVAL_MS since previous).
    await saveAutosave({ config, state: second, generationsRun: 2 });
    const b = await loadAutosave();
    expect(b.ok && b.payload.state.generation).toBe(1);
    await saveAutosave(
      { config, state: second, generationsRun: 2 },
      { force: true },
    );
    const c = await loadAutosave();
    expect(c.ok && c.payload.state.generation).toBe(2);
  });

  it("clearAutosave empties the slot", async () => {
    const config = { ...defaultConfig(), seed: "clear" };
    const sim = createSimulation(config);
    sim.step();
    await saveAutosave(
      { config, state: sim.getState(), generationsRun: 1 },
      { force: true },
    );
    expect((await loadAutosave()).ok).toBe(true);
    await clearAutosave();
    const result = await loadAutosave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("returns reason=future-version on a payload from a newer build", async () => {
    // Phase 38+: payload lives in IDB now, write directly via idbSet.
    await idbSet("lev.autosave.v2", {
      version: 99,
      savedAt: 1234,
      config: defaultConfig(),
      generationsRun: 0,
      stateSnapshot: {},
    });
    const result = await loadAutosave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("future-version");
  });

  it("saveAutosave returns ok=true on success", async () => {
    const config = { ...defaultConfig(), seed: "result-shape" };
    const sim = createSimulation(config);
    sim.step();
    const result = await saveAutosave(
      { config, state: sim.getState(), generationsRun: 1 },
      { force: true },
    );
    expect(result.ok).toBe(true);
  });

  it("migrates a legacy localStorage autosave on first load", async () => {
    // Simulate a pre-Phase-38 user with autosave in localStorage.
    const config = { ...defaultConfig(), seed: "legacy-migrate" };
    const sim = createSimulation(config);
    sim.step();
    const state = sim.getState();
    const legacyPayload = {
      version: 8,
      savedAt: Date.now(),
      config,
      generationsRun: 1,
      stateSnapshot: state,
    };
    localStorage.setItem("lev.autosave.v2", JSON.stringify(legacyPayload));
    // First load should pick up the localStorage entry, copy it to
    // IDB, and free the localStorage slot.
    const loaded = await loadAutosave();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.payload.state.generation).toBe(1);
    expect(localStorage.getItem("lev.autosave.v2")).toBeNull();
  });

  void vi;
  void _resetIdbHandle;
});
