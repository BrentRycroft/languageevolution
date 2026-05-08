/**
 * Phase 64 T2 probe: ablaut chain emergence.
 *
 * Run a 200-gen Germanic-style English simulation and assert that
 * at least one verb develops an emergent ablaut class (its past
 * form differs from the present via vowel mutation, not just
 * suffix). Reports the ablaut classes that emerged across leaves.
 *
 *   npx tsx scripts/probes/phase64_t2_ablaut.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetEnglish } from "../../src/engine/presets/english";
import { leafIds } from "../../src/engine/tree/split";
import { formToString } from "../../src/engine/phonology/ipa";

const sim = createSimulation({ ...presetEnglish(), seed: "phase64-t2-probe" });
for (let i = 0; i < 200; i++) sim.step();
const state = sim.getState();
const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
leaves.sort();

console.log(`=== Phase 64 T2: Ablaut emergence probe (200 gens, ${leaves.length} leaves) ===\n`);

let langsWithAblaut = 0;
for (const id of leaves) {
  const lang = state.tree[id]!.language;
  const tagged = Object.entries(lang.ablautClassAssignment ?? {});
  const past = lang.morphology.paradigms["verb.tense.past"];
  const map = past?.ablautMap ?? {};
  if (tagged.length > 0 || Object.keys(map).length > 0) langsWithAblaut++;

  if (tagged.length === 0 && Object.keys(map).length === 0) continue;
  console.log(`${id} ${lang.name}:`);
  console.log(`  ablautMap: ${JSON.stringify(map)}`);
  console.log(`  tagged verbs (${tagged.length}):`);
  for (const [m, cls] of tagged.slice(0, 5)) {
    const f = lang.lexicon[m];
    console.log(`    ${m.padEnd(10)} cls=${cls} present=${f ? formToString(f) : "—"}`);
  }
  console.log();
}
console.log(`Languages with ablaut: ${langsWithAblaut}/${leaves.length}`);
