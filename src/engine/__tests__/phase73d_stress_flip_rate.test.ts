import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { applyFounderInnovation } from "../tree/founder";
import { pickNextStressForSplit } from "../grammar/stressTransitions";
import { makeRng } from "../rng";
import type { Language, TypologicalDirection } from "../types";

/**
 * Phase 73d Tier D Phase D3 — stress flip rate increase +
 * direction-correlated stress targets.
 *
 * Two changes:
 * 1. `applyFounderInnovation` now rolls a separate 45% stress
 *    flip AFTER the shuffled category loop, so stress no longer
 *    competes with phonology/grammar for the single founder slot.
 * 2. `pickNextStressForSplit` and `pickNextStressForDrift` accept
 *    an optional `direction` parameter that weights fixed vs
 *    free stress patterns based on `synthesis` axis.
 */

function freshLang(seed: string): Language {
  const sim = createSimulation({ ...defaultConfig(), seed });
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 73d D3 — stress flip rate + direction-correlated targets", () => {
  it("founder fires stress flip more often than pre-D3 baseline (≥35% of trials)", () => {
    // Pre-D3 stress competed with phonology + grammar in a
    // shuffled 3-way race, picked at most once. With 30% skip
    // rate and 1-in-3 odds of being picked first, effective
    // stress-flip rate was roughly 0.7 × 0.33 ≈ 23%. D3's
    // extra 45% roll lifts this substantially.
    let flips = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const lang = freshLang(`d3-rate-${i}`);
      const startStress = lang.stressPattern ?? "penult";
      const rng = makeRng(`d3-rate-rng-${i}`);
      applyFounderInnovation(lang, rng, 0);
      if (lang.stressPattern !== startStress) flips++;
    }
    expect(flips / N, `stress flip rate ${flips}/${N}`).toBeGreaterThanOrEqual(0.35);
  });

  it("synthesis-positive direction biases pickNextStressForSplit toward fixed patterns", () => {
    const rng = makeRng("d3-synth-pos");
    const direction: TypologicalDirection = {
      simplification: 0,
      palatalization: 0,
      synthesis: 0.9,
    };
    let fixed = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      // Start from lexical so all neighbours (penult / initial)
      // are available. Both options are fixed-stress, so this
      // test isn't probative on its own — use "penult" which
      // has 3 neighbours (initial/final/antepenult), 2 fixed + 1 free.
      const next = pickNextStressForSplit("penult", rng, direction);
      if (next === "initial" || next === "antepenult") fixed++;
    }
    // With weighting 2.5× toward fixed patterns from "penult"
    // (neighbours: initial [fixed], final [free], antepenult [fixed]),
    // expected fixed-fraction = (2.5 + 2.5) / (2.5 + 1 + 2.5) = 5/6 ≈ 83%.
    expect(fixed / N).toBeGreaterThanOrEqual(0.70);
  });

  it("synthesis-negative direction biases toward free patterns (lexical/final)", () => {
    const rng = makeRng("d3-synth-neg");
    const direction: TypologicalDirection = {
      simplification: 0,
      palatalization: 0,
      synthesis: -0.9,
    };
    let free = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const next = pickNextStressForSplit("penult", rng, direction);
      if (next === "final") free++;
    }
    // From "penult" neighbours [initial, final, antepenult],
    // with 2.5× weight on the free-stress final, expected
    // fraction ≈ 2.5 / (1 + 2.5 + 1) = 0.56. Loose threshold
    // to tolerate noise.
    expect(free / N).toBeGreaterThanOrEqual(0.40);
  });

  it("no direction provided → uniform pick across legal neighbours", () => {
    const rng = makeRng("d3-uniform");
    const counts: Record<string, number> = { initial: 0, final: 0, antepenult: 0 };
    const N = 600;
    for (let i = 0; i < N; i++) {
      const next = pickNextStressForSplit("penult", rng);
      counts[next] = (counts[next] ?? 0) + 1;
    }
    // 3 neighbours, expected ~200 each. Loose bound: every
    // neighbour gets at least 100 (no clustering).
    for (const k of Object.keys(counts)) {
      expect(counts[k]!, `${k}: ${counts[k]}/${N}`).toBeGreaterThanOrEqual(100);
    }
  });
});
