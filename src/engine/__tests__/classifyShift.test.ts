import { describe, it, expect } from "vitest";
import { classifyShift } from "../semantics/drift";

describe("classifyShift (review fix)", () => {
  it("same-cluster high-similarity pairs → metonymy", () => {
    expect(classifyShift("hand", "foot")).toBe("metonymy");
  });

  it("dog → wolf is metonymy (same cluster, close embedding)", () => {
    expect(classifyShift("dog", "wolf")).toBe("metonymy");
  });

  it("complexity jump → broadening / narrowing", () => {
    expect(classifyShift("water", "meaning")).toBe("broadening");
    expect(classifyShift("meaning", "water")).toBe("narrowing");
  });

  it("always returns one of the four taxonomy labels", () => {
    const labels = new Set(["metonymy", "metaphor", "narrowing", "broadening"]);
    for (const a of ["stone", "fire", "dog", "hand", "good", "name"]) {
      for (const b of ["water", "wolf", "heart", "know", "word", "spirit"]) {
        expect(labels.has(classifyShift(a, b))).toBe(true);
      }
    }
  });
});
