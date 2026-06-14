import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { romanize } from "../phonology/orthography";
import { presetEnglish } from "../presets/english";
import { presetRomance } from "../presets/romance";
import type { Language, SimulationConfig } from "../types";

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

function protoFromPreset(config: SimulationConfig): Language {
  const sim = createSimulation(config);
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("G6 — English orthography profile", () => {
  const eng = protoFromPreset(presetEnglish());
  it("uses English digraph conventions (sh/ch/th/ng) and <k> for /k/", () => {
    expect(romanize(["ʃ", "ɪ", "p"], eng)).toBe("ship");
    expect(romanize(["tʃ", "ɪ", "n"], eng)).toBe("chin");
    expect(romanize(["θ", "ɪ", "n"], eng)).toBe("thin");
    expect(romanize(["k", "ɪ", "ŋ"], eng)).toBe("king");
  });
});

describe("G6 — Latin/Romance orthography profile", () => {
  const lat = protoFromPreset(presetRomance());
  it("uses near-phonemic Latinate conventions (<c> for /k/, no Germanic digraphs)", () => {
    expect(romanize(["l", "a", "k", "u"], lat)).toBe("lacu");
    expect(romanize(["k", "a", "m", "p", "u"], lat)).toBe("campu");
    expect(romanize(["k", "ɔ", "ɾ"], lat)).toBe("cor");
    expect(romanize(["k", "ɔ", "ɾ"], lat)).not.toContain("k");
  });
});

describe("G6 — English vs Latin orthographic contrast", () => {
  it("the same /k/-initial phonemic form spells <k> in English but <c> in Latin", () => {
    const eng = protoFromPreset(presetEnglish());
    const lat = protoFromPreset(presetRomance());
    const word = ["k", "a", "m", "p", "u"]; // same phonemes, two scribal traditions
    expect(romanize(word, eng).startsWith("k")).toBe(true);
    expect(romanize(word, lat).startsWith("c")).toBe(true);
  });
});
