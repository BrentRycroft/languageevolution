/**
 * Phase 70a T1: Historical Mode lenition burst probe.
 *
 * Validates that the M1 milestone (Vulgar Latin lenition burst at
 * gen 25) actually nudges the engine. Compares two runs of the same
 * Romance preset with the same seed:
 *   A) Historical Mode OFF (no scheduleId)
 *   B) Historical Mode ON  (scheduleId="romance")
 *
 * Asserts:
 *   - Mode ON: M1 milestone is recorded in state.historicalEvents at
 *     gen 25 (canonical record; survives MAX_EVENTS_PER_LANGUAGE cap).
 *   - Mode OFF: no historicalEvents.
 *   - Mode ON: average leaf ruleBias.lenition is significantly higher
 *     than mode OFF (M1 multiplies by 1.8).
 *
 *   npx tsx scripts/probes/phase70a_lenition_burst.ts
 */

import { createSimulation } from "../../src/engine/simulation";
import { presetRomance } from "../../src/engine/presets/romance";
import type { SimulationConfig } from "../../src/engine/types";

const STEPS = 50;
const SEED = "phase70a-lenition";

function buildConfig(historical: boolean): SimulationConfig {
  const cfg = presetRomance();
  cfg.seed = SEED;
  if (historical) {
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
  }
  return cfg;
}

function findMilestoneEvent(
  state: ReturnType<ReturnType<typeof createSimulation>["getState"]>,
  label: string,
): { generation: number; label: string; kind: string } | null {
  for (const ev of state.historicalEvents ?? []) {
    if (ev.label === label) {
      return { generation: ev.generation, label: ev.label, kind: ev.kind };
    }
  }
  return null;
}

function runOnce(historical: boolean): {
  milestone: { generation: number; label: string; kind: string } | null;
  firedKeys: string[];
  protoLeafCount: number;
  avgLeafLenitionBias: number;
  totalLeaves: number;
} {
  const sim = createSimulation(buildConfig(historical));
  for (let i = 0; i < STEPS; i++) sim.step();
  const state = sim.getState();
  const allLeaves = Object.values(state.tree)
    .filter((n) => n.childrenIds.length === 0)
    .map((n) => n.language)
    .filter((l) => !l.extinct);
  const protoLeaves = historical
    ? allLeaves.filter((l) => l.historicalRole === "proto")
    : allLeaves;
  const avg =
    protoLeaves.length > 0
      ? protoLeaves.reduce((a, l) => a + (l.ruleBias?.lenition ?? 1), 0) /
        protoLeaves.length
      : 0;
  return {
    milestone: findMilestoneEvent(state, "Vulgar Latin lenition"),
    firedKeys: state.firedHistoricalMilestones ?? [],
    protoLeafCount: protoLeaves.length,
    avgLeafLenitionBias: avg,
    totalLeaves: allLeaves.length,
  };
}

const off = runOnce(false);
const on = runOnce(true);

console.log("=== Phase 70a — Vulgar Latin lenition burst ===");
console.log(`Mode OFF: total leaves=${off.totalLeaves}, avg lenition bias=${off.avgLeafLenitionBias.toFixed(3)}`);
console.log(`Mode ON : total leaves=${on.totalLeaves}, proto-tagged leaves=${on.protoLeafCount}, avg lenition bias=${on.avgLeafLenitionBias.toFixed(3)}`);
console.log(`Milestone (mode ON):  ${JSON.stringify(on.milestone)}`);
console.log(`Milestone (mode OFF): ${JSON.stringify(off.milestone)}`);
console.log(`Fired keys (mode ON): [${on.firedKeys.join(", ")}]`);

const failures: string[] = [];

if (on.milestone === null) {
  failures.push("Mode ON: missing 'Vulgar Latin lenition' milestone in state.historicalEvents.");
} else {
  if (on.milestone.generation !== 25) {
    failures.push(`Mode ON: milestone fired at gen ${on.milestone.generation}, expected 25.`);
  }
  if (on.milestone.kind !== "fired") {
    failures.push(`Mode ON: milestone kind=${on.milestone.kind}, expected "fired".`);
  }
}
if (off.milestone !== null) {
  failures.push("Mode OFF: unexpected milestone present in state.historicalEvents.");
}
const ratio = off.avgLeafLenitionBias > 0 ? on.avgLeafLenitionBias / off.avgLeafLenitionBias : 0;
if (ratio < 1.4) {
  failures.push(
    `Expected mode ON avg-leaf lenition bias to exceed mode OFF by ≥1.4× (got ${ratio.toFixed(3)}×).`,
  );
}

if (failures.length > 0) {
  console.error("\nFAIL:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nPASS — M1 fires at gen 25, leaf lenition bias rises ≥1.4× vs mode-off.");
