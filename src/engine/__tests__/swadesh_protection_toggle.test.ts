import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { SWADESH_LIST } from "../semantics/lexicostat";
import { lexGet } from "../lexicon/access";
import { levenshtein } from "../phonology/ipa";
import type { WordForm } from "../types";

/**
 * swadesh_protection_toggle.test.ts
 *
 * Experimental config.modes.swadeshProtection (GUI toggle). When false it
 * removes the core-vocabulary shields (phonological erosion brake, high-freq
 * pruning skip, tier-0 obsolescence shield, core-homophone repair) so the
 * Swadesh core drifts like any other vocabulary. Default true is stock /
 * byte-identical (covered by meaning_layer_baseline).
 */

/** Total Levenshtein drift of the Swadesh core away from its gen-0 forms. */
function coreDrift(swadeshProtection: boolean, seed: string, gens: number): number {
  const cfg = presetEnglish();
  cfg.seed = seed;
  // Single lineage so we read one stable root language; toggle under test.
  cfg.modes = { ...cfg.modes, tree: false, death: false, swadeshProtection };
  const sim = createSimulation(cfg);
  const root = () => sim.getState().tree[sim.getState().rootId]!.language;
  const before: Record<string, WordForm> = {};
  const lang0 = root();
  for (const m of SWADESH_LIST) {
    const f = lexGet(lang0, m);
    if (f && f.length) before[m] = f.slice();
  }
  for (let i = 0; i < gens; i++) sim.step();
  const lang1 = root();
  let drift = 0;
  for (const m of Object.keys(before)) {
    const now = lexGet(lang1, m) ?? [];
    drift += levenshtein(before[m]!, now);
  }
  return drift;
}

describe("experimental: core-vocabulary (Swadesh) protection toggle", () => {
  it("protection ON is the default", () => {
    expect(presetEnglish().modes.swadeshProtection).toBe(true);
  });

  it("disabling protection lets the Swadesh core drift further from its proto forms", () => {
    const seed = "swadesh-toggle-1";
    const gens = 120;
    const protectedDrift = coreDrift(true, seed, gens);
    const unprotectedDrift = coreDrift(false, seed, gens);
    // The shields measurably slow core-vocabulary change; without them the core
    // accumulates strictly more drift over the same run.
    expect(unprotectedDrift).toBeGreaterThan(protectedDrift);
  });
});
