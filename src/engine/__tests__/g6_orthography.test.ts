import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { romanize } from "../phonology/orthography";
import type { Language } from "../types";

/**
 * G6 — evolving orthography. Per-preset spelling conventions, seeded at birth via
 * `config.seedOrthography` and surfaced through the existing `romanize` path.
 */

function protoOf(seed: string, seedOrthography?: Record<string, string>): Language {
  const sim = createSimulation({ ...defaultConfig(), seed, ...(seedOrthography ? { seedOrthography } : {}) });
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("G6 — seedOrthography config hook", () => {
  it("threads config.seedOrthography into lang.orthography so romanize uses it", () => {
    const lang = protoOf("g6-hook", { k: "c", "ʃ": "x" });
    expect(lang.orthography["k"]).toBe("c");
    // Seed override beats the default romanization (default: k→"k", ʃ→"sh").
    expect(romanize(["k", "a"], lang)).toBe("ca");
    expect(romanize(["ʃ", "a"], lang)).toBe("xa");
  });

  it("falls back to DEFAULT_ORTHOGRAPHY when no seed is given", () => {
    const lang = protoOf("g6-default");
    expect(Object.keys(lang.orthography).length).toBe(0);
    expect(romanize(["ʃ", "a"], lang)).toBe("sha"); // DEFAULT_ORTHOGRAPHY ʃ→"sh"
  });
});
