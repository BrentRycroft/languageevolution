import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * downloadAiModel unit-tests the state-machine only. The actual WebLLM
 * loader can't run in the test environment (no WebGPU / no large cache),
 * so we mock the llm module.
 */
vi.mock("../../engine/semantics/llm", () => ({
  DEFAULT_LLM_CONFIG: { modelId: "mock" },
  validateModelAvailable: vi.fn(async () => null),
  loadEngine: vi.fn(async (_cfg, onProgress) => {
    if (onProgress) {
      onProgress({ text: "Loading", progress: 0.5 });
      onProgress({ text: "Loading", progress: 1 });
    }
    return { chat: { completions: { create: async () => ({ choices: [] }) } } };
  }),
}));

describe("downloadAiModel", () => {
  beforeEach(async () => {
    const mod = await import("../store");
    mod.useSimStore.getState().reset();
  });

  it("transitions from idle → progress → ready", async () => {
    const mod = await import("../store");
    const store = mod.useSimStore;
    expect(store.getState().aiStatus.ready).toBe(false);
    await store.getState().downloadAiModel();
    expect(store.getState().aiStatus.ready).toBe(true);
    expect(store.getState().aiStatus.progress).toBe(1);
    expect(store.getState().aiStatus.error).toBeNull();
  });

  it("captures errors into aiStatus.error", async () => {
    vi.doMock("../../engine/semantics/llm", () => ({
      DEFAULT_LLM_CONFIG: { modelId: "mock" },
      validateModelAvailable: vi.fn(async () => null),
      loadEngine: vi.fn(async () => {
        throw new Error("offline");
      }),
    }));
    vi.resetModules();
    const mod = await import("../store");
    const store = mod.useSimStore;
    store.getState().reset();
    await store.getState().downloadAiModel();
    expect(store.getState().aiStatus.ready).toBe(false);
    expect(store.getState().aiStatus.error).toBe("offline");
  });
});
