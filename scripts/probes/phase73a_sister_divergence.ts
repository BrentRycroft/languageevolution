/**
 * Phase 73a Tier-A probe: measure post-200-gen surface-form
 * distinguishability across all surviving leaf pairs in a Romance
 * run. Reports the fraction of shared meanings whose realizations
 * differ between two daughters — under tight brakes many sisters
 * keep identical forms (dialect-feel); under loose brakes most forms
 * have drifted apart (distinct-lineage-feel).
 *
 *   npx tsx scripts/probes/phase73a_sister_divergence.ts
 */

import { createSimulation } from "../../src/engine/simulation";
import { presetRomance } from "../../src/engine/presets/romance";

const SEEDS = ["d1", "d2", "d3"];
const STEPS = 200;

function sameForm(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface SeedReport {
  seed: string;
  leafCount: number;
  pairCount: number;
  avgFracDistinct: number;
  minFracDistinct: number;
  maxFracDistinct: number;
}

function runSeed(seed: string): SeedReport {
  const cfg = presetRomance();
  cfg.seed = seed;
  cfg.historical = { scheduleId: "romance", intensity: 1.0 };
  const sim = createSimulation(cfg);
  for (let i = 0; i < STEPS; i++) sim.step();
  const state = sim.getState();
  const leaves = Object.values(state.tree)
    .filter((n) => n.childrenIds.length === 0 && !n.language.extinct)
    .map((n) => n.language);
  const fractions: number[] = [];
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i]!.lexicon;
      const b = leaves[j]!.lexicon;
      const shared = Object.keys(a).filter((m) => b[m]);
      if (shared.length === 0) continue;
      let distinct = 0;
      for (const m of shared) if (!sameForm(a[m]!, b[m]!)) distinct++;
      fractions.push(distinct / shared.length);
    }
  }
  fractions.sort((x, y) => x - y);
  return {
    seed,
    leafCount: leaves.length,
    pairCount: fractions.length,
    avgFracDistinct: fractions.reduce((s, f) => s + f, 0) / Math.max(1, fractions.length),
    minFracDistinct: fractions[0] ?? 0,
    maxFracDistinct: fractions[fractions.length - 1] ?? 0,
  };
}

const results = SEEDS.map(runSeed);
console.log("=== Phase 73a divergence probe (3 seeds × 200 gens) ===\n");
for (const r of results) {
  console.log(`Seed "${r.seed}" — ${r.leafCount} leaves, ${r.pairCount} pairs:`);
  console.log(`  avg fraction shared meanings with distinct forms = ${r.avgFracDistinct.toFixed(3)}`);
  console.log(`  min / max per-pair                               = ${r.minFracDistinct.toFixed(3)} / ${r.maxFracDistinct.toFixed(3)}`);
}
const avgAvg = results.reduce((s, r) => s + r.avgFracDistinct, 0) / results.length;
const minMin = Math.min(...results.map((r) => r.minFracDistinct));
console.log(`\nAggregate (across 3 seeds):`);
console.log(`  avg avg fraction distinct = ${avgAvg.toFixed(3)}`);
console.log(`  min min per-pair          = ${minMin.toFixed(3)}`);
