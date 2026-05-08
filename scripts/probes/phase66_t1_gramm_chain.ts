/**
 * Phase 66 T1 probe: grammaticalization multi-step chains.
 *
 * Run a 200-gen Romance simulation and report any meanings that
 * have advanced through grammaticalisation stages 2 → 3 → 4.
 *
 *   npx tsx scripts/probes/phase66_t1_gramm_chain.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetRomance } from "../../src/engine/presets/romance";
import { leafIds } from "../../src/engine/tree/split";

const sim = createSimulation({ ...presetRomance(), seed: "phase66-t1-probe" });
for (let i = 0; i < 200; i++) sim.step();
const state = sim.getState();
const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
leaves.sort();

console.log(`=== Phase 66 T1: Grammaticalisation chain probe (200 gens, ${leaves.length} leaves) ===\n`);

let langsWithStage2 = 0;
let langsWithStage3Plus = 0;
for (const id of leaves) {
  const lang = state.tree[id]!.language;
  const stages = Object.entries(lang.grammaticalizationStage ?? {});
  if (stages.length === 0) continue;
  const stage2 = stages.filter(([_, s]) => s?.stage === 2);
  const stage3plus = stages.filter(([_, s]) => s && s.stage >= 3);
  if (stage2.length > 0) langsWithStage2++;
  if (stage3plus.length > 0) langsWithStage3Plus++;
  if (stages.length === 0) continue;
  console.log(`${id} ${lang.name}: ${stages.length} entries`);
  for (const [m, st] of stages) {
    if (!st) continue;
    const formStr = lang.lexicon[m]?.join("") ?? "(removed)";
    console.log(`  ${m.padEnd(18)} stage=${st.stage} target=${st.targetCategory ?? "—"} lastTrans=${st.lastTransitionGen} surf=${formStr}`);
  }
}
console.log(`\nLanguages with stage-2 meanings: ${langsWithStage2}/${leaves.length}`);
console.log(`Languages with stage-3+ meanings: ${langsWithStage3Plus}/${leaves.length}`);
