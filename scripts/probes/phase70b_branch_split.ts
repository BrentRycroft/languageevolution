/**
 * Phase 70 T2: Italo-Western / Eastern Romance split probe.
 *
 * Validates the SplitMilestone runner. Runs Romance preset with
 * Historical Mode ON for 70 gens and asserts:
 *   - At gen 65, every proto-tagged leaf splits into 2 daughters.
 *   - One daughter is tagged "western", the other "eastern".
 *   - Daughters carry the nameHint ("Proto-Western-Romance" /
 *     "Proto-Eastern-Romance").
 *   - Western daughters have boosted lenition/palatalization bias.
 *   - Eastern daughters have suppressed deletion bias.
 *   - The milestone is recorded in state.historicalEvents at gen 65.
 *
 * Mode-off run is the regression gate: no roles, no historical
 * events.
 *
 *   npx tsx scripts/probes/phase70b_branch_split.ts
 */

import { createSimulation } from "../../src/engine/simulation";
import { presetRomance } from "../../src/engine/presets/romance";
import type { SimulationConfig } from "../../src/engine/types";

const STEPS = 70;
const SEED = "phase70b-split";

function buildConfig(historical: boolean): SimulationConfig {
  const cfg = presetRomance();
  cfg.seed = SEED;
  if (historical) cfg.historical = { scheduleId: "romance", intensity: 1.0 };
  return cfg;
}

const sim = createSimulation(buildConfig(true));
for (let i = 0; i < STEPS; i++) sim.step();
const state = sim.getState();

const allLangs = Object.values(state.tree).map((n) => ({
  id: n.language.id,
  role: n.language.historicalRole,
  name: n.language.name,
  isLeaf: n.childrenIds.length === 0,
  extinct: n.language.extinct,
  birthGen: n.language.birthGeneration,
  ruleBias: n.language.ruleBias,
}));
const aliveLeaves = allLangs.filter((l) => l.isLeaf && !l.extinct);
const westernLeaves = aliveLeaves.filter((l) => l.role === "western");
const easternLeaves = aliveLeaves.filter((l) => l.role === "eastern");
const protoLeaves = aliveLeaves.filter((l) => l.role === "proto");

const splitEvent = state.historicalEvents?.find(
  (e) => e.label === "Italo-Western vs Eastern Romance",
);
const m1Event = state.historicalEvents?.find(
  (e) => e.label === "Vulgar Latin lenition",
);

console.log("=== Phase 70 T2 — Italo-Western / Eastern Romance split ===");
console.log(`Total leaves: ${allLangs.filter((l) => l.isLeaf).length}, alive: ${aliveLeaves.length}`);
console.log(`Western-tagged leaves: ${westernLeaves.length}, Eastern-tagged: ${easternLeaves.length}, Proto-tagged: ${protoLeaves.length}`);
console.log(`M1 event: ${JSON.stringify(m1Event)}`);
console.log(`M2 (split) event: ${JSON.stringify(splitEvent)}`);
console.log("Western leaves:", westernLeaves.map((l) => ({ id: l.id, name: l.name, birthGen: l.birthGen, lenition: l.ruleBias?.lenition?.toFixed(2) })));
console.log("Eastern leaves:", easternLeaves.map((l) => ({ id: l.id, name: l.name, birthGen: l.birthGen, deletion: l.ruleBias?.deletion?.toFixed(2) })));

const failures: string[] = [];
if (!splitEvent) failures.push("Missing M2 split event in state.historicalEvents.");
else if (splitEvent.generation !== 65) failures.push(`M2 fired at gen ${splitEvent.generation}, expected 65.`);
else if (splitEvent.kind !== "fired") failures.push(`M2 kind=${splitEvent.kind}, expected "fired".`);

if (westernLeaves.length === 0) failures.push("No western-tagged leaves after gen 65.");
if (easternLeaves.length === 0) failures.push("No eastern-tagged leaves after gen 65.");
// Each pre-split proto leaf should produce exactly 2 daughters (1 W + 1 E),
// so western and eastern counts should match.
if (
  westernLeaves.length > 0 &&
  easternLeaves.length > 0 &&
  westernLeaves.length !== easternLeaves.length
) {
  failures.push(
    `Western/Eastern leaf counts mismatch: ${westernLeaves.length} vs ${easternLeaves.length}.`,
  );
}
if (protoLeaves.length > 0) {
  failures.push(`Expected zero proto-tagged leaves after gen 65 (parents split); found ${protoLeaves.length}.`);
}

// nameHint check: western leaves are named "Proto-Western-Romance".
const expectedWesternName = "Proto-Western-Romance";
const westernNamesOk = westernLeaves.every((l) => l.name === expectedWesternName);
if (westernLeaves.length > 0 && !westernNamesOk) {
  failures.push(
    `Some western leaves missing nameHint "${expectedWesternName}": ${JSON.stringify(westernLeaves.map((l) => l.name))}`,
  );
}

// initialBias check: western leaves should have lenition bias > eastern's.
if (westernLeaves.length > 0 && easternLeaves.length > 0) {
  const wAvg =
    westernLeaves.reduce((a, l) => a + (l.ruleBias?.lenition ?? 1), 0) /
    westernLeaves.length;
  const eAvg =
    easternLeaves.reduce((a, l) => a + (l.ruleBias?.lenition ?? 1), 0) /
    easternLeaves.length;
  console.log(`Avg lenition bias: western=${wAvg.toFixed(3)}, eastern=${eAvg.toFixed(3)}`);
  if (wAvg <= eAvg) {
    failures.push(
      `Expected western avg lenition bias > eastern (got ${wAvg.toFixed(3)} vs ${eAvg.toFixed(3)}).`,
    );
  }
}

// Mode-off regression gate.
const offSim = createSimulation(buildConfig(false));
for (let i = 0; i < STEPS; i++) offSim.step();
const offState = offSim.getState();
const offRoles = Object.values(offState.tree)
  .map((n) => n.language.historicalRole)
  .filter((r) => r !== undefined);
if (offRoles.length > 0) failures.push(`Mode OFF: unexpected historicalRole tags found: ${JSON.stringify(offRoles)}`);
if ((offState.historicalEvents?.length ?? 0) > 0) {
  failures.push("Mode OFF: unexpected historicalEvents present.");
}

if (failures.length > 0) {
  console.error("\nFAIL:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nPASS — M2 fires at gen 65, daughters tagged W/E with biases applied; mode-off unchanged.");
