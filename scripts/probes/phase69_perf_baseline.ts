/**
 * Phase 69a T5: durable performance baseline probe.
 *
 * Measures per-step wall-time across 3 preset/length combinations,
 * reports p50 / p95 / p99 / max and early-vs-late growth ratios.
 * When run with `PROFILE_STEP=1`, also prints the per-substep
 * cumulative ms breakdown via the new `getCumulativeTimings()`
 * hook on the Simulation handle.
 *
 *   npx tsx scripts/probes/phase69_perf_baseline.ts
 *   PROFILE_STEP=1 npx tsx scripts/probes/phase69_perf_baseline.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { defaultConfig } from "../../src/engine/config";
import { presetRomance } from "../../src/engine/presets/romance";

const PROFILE_ON = !!process.env.PROFILE_STEP;

function timeRun(label: string, build: () => any, steps: number): void {
  const t0 = process.hrtime.bigint();
  const sim = createSimulation(build());
  const tInit = Number(process.hrtime.bigint() - t0) / 1e6;
  const stepTimes: number[] = [];
  for (let i = 0; i < steps; i++) {
    const s0 = process.hrtime.bigint();
    sim.step();
    stepTimes.push(Number(process.hrtime.bigint() - s0) / 1e6);
  }
  const total = stepTimes.reduce((a, b) => a + b, 0);
  const max = Math.max(...stepTimes);
  const sorted = stepTimes.slice().sort((a, b) => a - b);
  const p50 = sorted[Math.floor(stepTimes.length / 2)] ?? 0;
  const p95 = sorted[Math.floor(stepTimes.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(stepTimes.length * 0.99)] ?? 0;
  const lateAvg = stepTimes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const earlyAvg = stepTimes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  console.log(`${label}:`);
  console.log(`  init: ${tInit.toFixed(0)}ms; total: ${total.toFixed(0)}ms`);
  console.log(
    `  per-step: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms max=${max.toFixed(1)}ms`,
  );
  console.log(`  early avg (gens 0-19): ${earlyAvg.toFixed(1)}ms`);
  console.log(
    `  late avg  (last 20):   ${lateAvg.toFixed(1)}ms (${(lateAvg / earlyAvg).toFixed(2)}× early)`,
  );
  if (PROFILE_ON) {
    const t = sim.getCumulativeTimings();
    const totalSubsteps = Object.values(t).reduce((a, b) => a + b, 0) || 1;
    const sortedKv = Object.entries(t).sort((a, b) => b[1] - a[1]);
    console.log(`  per-substep cumulative ms (PROFILE_STEP=1):`);
    for (const [k, v] of sortedKv) {
      const pct = (v / totalSubsteps) * 100;
      console.log(`    ${k.padEnd(18)} ${v.toFixed(0).padStart(7)}ms  ${pct.toFixed(1)}%`);
    }
  }
  console.log();
}

console.log(`=== Phase 69 perf baseline ${PROFILE_ON ? "(profiled)" : ""} ===\n`);
timeRun("Default 100 gens", () => ({ ...defaultConfig(), seed: "perf-default" }), 100);
timeRun("Romance 100 gens", () => ({ ...presetRomance(), seed: "perf-romance" }), 100);
timeRun("Default 200 gens", () => ({ ...defaultConfig(), seed: "perf-200" }), 200);
