import { describe, it, expect } from "vitest";
import { DEFAULT_LLM_CONFIG, validateModelAvailable } from "../semantics/llm";

describe("llm config", () => {
  it("defaults to a Ministral 3B id", () => {
    expect(DEFAULT_LLM_CONFIG.modelId).toContain("Ministral");
    expect(DEFAULT_LLM_CONFIG.modelId).toContain("3B");
  });

  it("is a quantized MLC model id", () => {
    // WebLLM model ids end with the quantization + "-MLC" suffix.
    expect(DEFAULT_LLM_CONFIG.modelId).toMatch(/-MLC$/);
  });

  it("validateModelAvailable accepts the shipped default", async () => {
    // The configured default must actually exist in the installed
    // WebLLM's prebuiltAppConfig. If this test fails, the UI will error
    // with "Cannot find model record in appConfig" on download.
    const result = await validateModelAvailable();
    expect(result).toBeNull();
  });

  it("validateModelAvailable rejects an unknown id", async () => {
    const result = await validateModelAvailable({
      modelId: "NotAModel-BogusId-xyz-MLC",
    });
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });
});
