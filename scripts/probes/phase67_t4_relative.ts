/**
 * Phase 67 T4 probe: relative-clause typological constraints.
 *
 * Run a PIE 200-gen simulation and report each daughter's
 * relativeClauseStrategy alongside its wordOrder + hasCase. Confirm
 * the constraints hold (OV → no relativizer; case-poor → no
 * resumptive).
 *
 *   npx tsx scripts/probes/phase67_t4_relative.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetPIE } from "../../src/engine/presets/pie";
import { leafIds } from "../../src/engine/tree/split";

const sim = createSimulation({ ...presetPIE(), seed: "phase67-t4-rc" });
for (let i = 0; i < 200; i++) sim.step();
const state = sim.getState();
const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
leaves.sort();

console.log(`=== Phase 67 T4: Relative-clause typological constraints (200 gens, ${leaves.length} leaves) ===\n`);

const counts: Record<string, number> = {};
let consistent = 0;
for (const id of leaves) {
  const lang = state.tree[id]!.language;
  const wo = lang.grammar.wordOrder;
  const hasCase = lang.grammar.hasCase;
  const rc = lang.grammar.relativeClauseStrategy ?? "(none)";
  const isOV = wo === "SOV" || wo === "OSV" || wo === "OVS";
  const isVO = wo === "SVO" || wo === "VSO" || wo === "VOS";
  let ok = true;
  if (isVO && rc === "internal-headed") ok = false;
  if (isOV && rc === "relativizer") ok = false;
  if (!hasCase && rc === "resumptive") ok = false;
  if (ok) consistent++;
  counts[rc] = (counts[rc] ?? 0) + 1;
  console.log(`${id} ${lang.name.padEnd(13)} wo=${wo} hasCase=${hasCase ? "y" : "n"} rc=${rc.padEnd(15)} ${ok ? "✓" : "✗ violated"}`);
}
console.log();
console.log(`Constraint-consistent leaves: ${consistent}/${leaves.length}`);
console.log(`Strategy distribution:`);
for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(15)} ${n}`);
}
