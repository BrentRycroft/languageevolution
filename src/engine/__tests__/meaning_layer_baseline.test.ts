import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetGermanic } from "../presets/germanic";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { formToString } from "../phonology/ipa";
import { fnv1a } from "../rng";
import type { SimulationConfig } from "../types";

/**
 * meaning_layer_baseline.test.ts — the byte-identical SAFETY NET for the
 * meaning-layer migration (see MEANING-LAYER-MIGRATION.md).
 *
 * The migration decouples word MEANING from English strings and turns words
 * into morphological building blocks. Its hard invariant is byte-identical
 * determinism: no phase may change any language's evolved forms. This test
 * locks a hash of every preset's lexicon (meaning → IPA form) + word forms.
 *
 * Two tiers:
 *  - FAST (every run): gen-0 forms for all 6 presets — catches init/shim
 *    regressions cheaply (no stepping).
 *  - RUN_SLOW: the full 30-step trajectory for all 6 presets — catches any
 *    determinism perturbation along the evolution path. Run this explicitly at
 *    each migration phase gate: `RUN_SLOW=1 npx vitest run meaning_layer_baseline`.
 *
 * Expected hashes are the CURRENT (pre-migration) baseline. If a future change
 * legitimately alters forms, re-baseline DELIBERATELY (and justify it).
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

const STEPS = 30;

/** Deterministic hash of every tree node's sorted lexicon forms + word forms. */
function signature(sim: ReturnType<typeof createSimulation>): string {
  const tree = sim.getState().tree;
  const parts: string[] = [];
  for (const id of Object.keys(tree).sort()) {
    const lang = tree[id]!.language;
    const lex = Object.keys(lang.lexicon)
      .sort()
      .map((m) => `${m}=${formToString(lang.lexicon[m]!)}`)
      .join("|");
    const words = (lang.words ?? [])
      .map((w) => w.formKey)
      .sort()
      .join("|");
    parts.push(`${id}#${lex}#${words}`);
  }
  return fnv1a(parts.join("\n")).toString(16).padStart(8, "0");
}

// Baseline hashes from the current (pre-migration) engine. Locked.
const GEN0: Record<string, string> = {
  pie: "ab7faeaa",
  bantu: "f071ed04",
  romance: "8917b341",
  germanic: "8d42348c",
  tokipona: "4cb04ce4",
  english: "ced79fd3",
};
const GENN: Record<string, string> = {
  pie: "8dc3510e",
  bantu: "7ef8a95a",
  romance: "b517df8f",
  germanic: "25d3698b",
  tokipona: "2f52aaed",
  english: "d5b13c47",
};

describe("meaning-layer baseline — gen-0 forms byte-identical (fast)", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: gen-0 lexicon + word forms match the locked baseline`, () => {
      const sig = signature(createSimulation(build()));
      expect(sig, `${name} gen-0 byte-identity`).toBe(GEN0[name]);
    });
  }
});

describe("meaning-layer baseline — full trajectory byte-identical (RUN_SLOW)", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it.skipIf(!RUN_SLOW)(`${name}: lexicon + word forms match after ${STEPS} steps`, () => {
      const sim = createSimulation(build());
      for (let i = 0; i < STEPS; i++) sim.step();
      expect(signature(sim), `${name} gen-${STEPS} byte-identity`).toBe(GENN[name]);
    });
  }
});
