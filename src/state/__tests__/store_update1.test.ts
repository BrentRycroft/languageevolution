import { describe, it, expect, beforeEach } from "vitest";
import { useSimStore } from "../store";

describe("store Update 1 actions", () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it("randomiseSeed swaps the seed and resets state to gen 0", () => {
    const before = useSimStore.getState().config.seed;
    useSimStore.getState().step();
    expect(useSimStore.getState().state.generation).toBeGreaterThan(0);
    useSimStore.getState().randomiseSeed();
    const after = useSimStore.getState().config.seed;
    expect(after).not.toEqual(before);
    expect(after.length).toBeGreaterThanOrEqual(4);
    // A new seed rebuilds from gen 0 like a reset.
    expect(useSimStore.getState().state.generation).toBe(0);
  });

  it("setTimelineScrubGeneration stores a past gen and null clears it", () => {
    useSimStore.getState().setTimelineScrubGeneration(7);
    expect(useSimStore.getState().timelineScrubGeneration).toBe(7);
    useSimStore.getState().setTimelineScrubGeneration(null);
    expect(useSimStore.getState().timelineScrubGeneration).toBeNull();
  });

  it("reset clears an active scrub generation", () => {
    useSimStore.getState().setTimelineScrubGeneration(9);
    expect(useSimStore.getState().timelineScrubGeneration).toBe(9);
    useSimStore.getState().reset();
    expect(useSimStore.getState().timelineScrubGeneration).toBeNull();
  });
});
