import { describe, it, expect } from "vitest";
import { DEFAULT_LLM_CONFIG } from "../semantics/llm";

describe("llm config", () => {
  it("defaults to Ministral 3B", () => {
    expect(DEFAULT_LLM_CONFIG.modelId).toContain("Ministral");
    expect(DEFAULT_LLM_CONFIG.modelId).toContain("3B");
  });

  it("is a quantized MLC model id", () => {
    // WebLLM model ids end with the quantization + "-MLC" suffix.
    expect(DEFAULT_LLM_CONFIG.modelId).toMatch(/-MLC$/);
  });
});
