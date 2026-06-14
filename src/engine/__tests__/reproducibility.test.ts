import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetGermanic } from "../presets/germanic";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { signature } from "./signature";
import type { SimulationConfig } from "../types";

/**
 * Per-machine reproducibility gate (G0). Same config on the SAME machine must
 * reproduce identically — the determinism invariant that survives GPU floats
 * (G7), replacing cross-machine byte-identity. Compares two LIVE runs; no frozen
 * baseline. Trivially green on the deterministic CPU engine today (intended
 * future guard).
 */
const RUN_SLOW = !!(globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.RUN_SLOW;

const PRESETS: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  bantu: presetBantu,
  romance: presetRomance,
  germanic: presetGermanic,
  tokipona: presetTokipona,
  english: presetEnglish,
};

describe("determinism — per-machine reproducibility (run twice → identical)", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: gen-0 + 5-step run reproduces identically (FAST)`, () => {
      const a = createSimulation(build());
      const b = createSimulation(build());
      expect(signature(a), `${name} gen-0`).toBe(signature(b));
      for (let i = 0; i < 5; i++) { a.step(); b.step(); }
      expect(signature(a), `${name} gen-5`).toBe(signature(b));
    });

    it.skipIf(!RUN_SLOW)(`${name}: 30-step run reproduces identically (RUN_SLOW)`, () => {
      const a = createSimulation(build());
      const b = createSimulation(build());
      for (let i = 0; i < 30; i++) { a.step(); b.step(); }
      expect(signature(a), `${name} gen-30`).toBe(signature(b));
    });
  }
});
