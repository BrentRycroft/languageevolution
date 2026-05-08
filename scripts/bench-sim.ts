/**
 * bench-sim.ts — quick CLI benchmark for full-sim throughput.
 *
 * Run:
 *   npx tsx scripts/bench-sim.ts [gens=200] [seed=bench]
 *
 * Reports total wall-time + per-step average. For per-substep
 * breakdowns prefer `scripts/probes/phase69_perf_baseline.ts` with
 * `PROFILE_STEP=1`.
 */
import { createSimulation } from "../src/engine/simulation";
import { defaultConfig } from "../src/engine/config";

const GENS = parseInt(process.argv[2] ?? "200", 10);
const seed = process.argv[3] ?? "bench";

const sim = createSimulation({ ...defaultConfig(), seed });
const start = performance.now();
for (let i = 0; i < GENS; i++) {
  sim.step();
}
const elapsed = performance.now() - start;
const state = sim.getState();
const tree = state.tree;
const leaves = Object.keys(tree).filter((id) => tree[id]!.childrenIds.length === 0 && !tree[id]!.language.extinct);
let totalEvents = 0;
for (const id of Object.keys(tree)) totalEvents += tree[id]!.language.events.length;

console.log(`seed=${seed} gens=${GENS}`);
console.log(`elapsed=${elapsed.toFixed(0)}ms (${(elapsed / GENS).toFixed(2)}ms/gen)`);
console.log(`alive_leaves=${leaves.length} total_nodes=${Object.keys(tree).length} total_events=${totalEvents}`);
