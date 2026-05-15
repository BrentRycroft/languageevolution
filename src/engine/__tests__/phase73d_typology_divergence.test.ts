import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";

/**
 * Phase 73d Tier D Phase D6 — sister typology divergence
 * assertion. Thin test wrapper around the
 * `phase73d_sister_typology_divergence` probe: runs ONE seed
 * (cost-conscious for the test suite) and asserts the same
 * threshold the probe uses.
 *
 * Combined with the Tier A `phase73a_divergence.test.ts`
 * (which asserts max-fraction-distinct ≥ 0.9 on lexical surface
 * forms), D6 establishes that sister daughters diverge BOTH
 * lexically AND typologically — not just one or the other.
 */

function l1(a: number, b: number): number {
  return Math.abs(a - b);
}

function jaccardDist(a: ReadonlyArray<string>, b: ReadonlyArray<string>): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const intersect = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  if (union === 0) return 0;
  return 1 - intersect / union;
}

describe("Phase 73d D6 — sister typology divergence", () => {
  it("at gen 200, at least one sister pair has typology distance ≥ 3.5", () => {
    const cfg = presetRomance();
    cfg.seed = "d6-typology";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 200; i++) sim.step();
    const state = sim.getState();
    const leaves = Object.values(state.tree)
      .filter((n) => n.childrenIds.length === 0 && !n.language.extinct)
      .map((n) => n.language);
    expect(leaves.length, "expected ≥2 living leaves at gen 200").toBeGreaterThanOrEqual(2);

    let maxPairDistance = 0;
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i]!;
        const b = leaves[j]!;
        const da = a.typologicalDirection ?? { simplification: 0, palatalization: 0, synthesis: 0 };
        const db = b.typologicalDirection ?? { simplification: 0, palatalization: 0, synthesis: 0 };
        const dirDist = l1(da.simplification, db.simplification) + l1(da.palatalization, db.palatalization) + l1(da.synthesis, db.synthesis);
        const leniA = (a.ruleBias?.lenition ?? 1) - (a.ruleBias?.fortition ?? 1);
        const leniB = (b.ruleBias?.lenition ?? 1) - (b.ruleBias?.fortition ?? 1);
        const leniChar = l1(leniA, leniB);
        const ppa = a.phonotacticProfile;
        const ppb = b.phonotacticProfile;
        const phono = (ppa && ppb)
          ? (l1(ppa.maxOnset, ppb.maxOnset) + l1(ppa.maxCoda, ppb.maxCoda) + l1(ppa.maxCluster, ppb.maxCluster)) * 0.5
          : 0;
        const synth = l1(a.grammar.synthesisIndex ?? 2.0, b.grammar.synthesisIndex ?? 2.0)
                    + l1(a.grammar.fusionIndex ?? 0.5, b.grammar.fusionIndex ?? 0.5) * 2;
        const stress = (a.stressPattern === b.stressPattern) ? 0 : 1;
        const inventory = jaccardDist(a.phonemeInventory.segmental, b.phonemeInventory.segmental) * 3;
        const distance = dirDist + leniChar + phono + synth + stress + inventory;
        if (distance > maxPairDistance) maxPairDistance = distance;
      }
    }
    expect(maxPairDistance, `max typology pair distance ${maxPairDistance.toFixed(2)} should be ≥ 3.5`).toBeGreaterThanOrEqual(3.5);
  });
});
