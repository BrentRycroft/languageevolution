/**
 * Phase 67 T2 probe: tone sandhi rule emergence/decay.
 *
 * Run a tonal-preset simulation for 200 gens and report any sandhi
 * rule additions or removals across leaves.
 *
 *   npx tsx scripts/probes/phase67_t2_sandhi.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetEnglish } from "../../src/engine/presets/english";
import { leafIds } from "../../src/engine/tree/split";

const config = presetEnglish();
config.seedToneRegime = "tonal";
const sim = createSimulation({ ...config, seed: "phase67-t2-sandhi" });
for (let i = 0; i < 200; i++) sim.step();
const state = sim.getState();
const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
leaves.sort();

console.log(`=== Phase 67 T2: Tone sandhi rule evolution (200 gens, ${leaves.length} leaves) ===\n`);

for (const id of leaves.slice(0, 4)) {
  const lang = state.tree[id]!.language;
  const sandhiEvents = (lang.events ?? []).filter((e) =>
    /sandhi/i.test(e.description ?? ""),
  );
  console.log(`${id} ${lang.name}:`);
  console.log(`  active sandhi families: ${JSON.stringify(lang.toneSandhiRules ?? [])}`);
  console.log(`  sandhi events:`);
  for (const e of sandhiEvents.slice(0, 8)) {
    console.log(`    gen ${e.generation} [${e.kind}]: ${e.description}`);
  }
  console.log();
}
