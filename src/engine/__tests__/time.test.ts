import { describe, it, expect } from "vitest";
import {
  generationToYears,
  formatElapsed,
  formatGenWithElapsed,
} from "../time";
import { defaultConfig } from "../config";

describe("§3 — generation → real-time anchor", () => {
  it("default config exposes yearsPerGeneration = 25", () => {
    expect(defaultConfig().yearsPerGeneration).toBe(25);
  });

  it("generationToYears multiplies by the anchor", () => {
    expect(generationToYears(0)).toBe(0);
    expect(generationToYears(1)).toBe(25);
    expect(generationToYears(80)).toBe(2000);
    expect(generationToYears(40, 30)).toBe(1200);
  });

  it("formatElapsed renders sensible scales", () => {
    expect(formatElapsed(0)).toBe("0 yr");
    expect(formatElapsed(1)).toBe("25 yr");
    expect(formatElapsed(40)).toBe("1 ky");
    expect(formatElapsed(400)).toBe("10 ky");
    expect(formatElapsed(4000)).toBe("100 ky");
    expect(formatElapsed(40000)).toBe("1 my");
  });

  it("formatElapsed shows fractional ky / my for non-round values", () => {
    expect(formatElapsed(50)).toBe("1.3 ky");
    expect(formatElapsed(45000)).toBe("1.13 my");
  });

  it("formatElapsed honours a custom yearsPerGen", () => {
    expect(formatElapsed(40, 100)).toBe("4 ky");
    expect(formatElapsed(40, 5)).toBe("200 yr");
  });

  it("formatGenWithElapsed combines gen + elapsed in one label", () => {
    expect(formatGenWithElapsed(80)).toBe("gen 80 · 2 ky");
    expect(formatGenWithElapsed(0)).toBe("gen 0 · 0 yr");
  });
});
