/**
 * Phase 67 T3 probe: phonotactic constraints as coinage gates.
 *
 * Run a Tokipona-flavoured CV-only simulation and confirm that no
 * lexicon entry contains C-clusters after 100 gens of coinage.
 *
 *   npx tsx scripts/probes/phase67_t3_phonotactic.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetTokipona } from "../../src/engine/presets/tokipona";
import { leafIds } from "../../src/engine/tree/split";
import { langPhonotacticScore } from "../../src/engine/phonology/phonotactics";
import { onsetClusterLen, codaClusterLen } from "../../src/engine/phonology/phonotactics";

const sim = createSimulation({ ...presetTokipona(), seed: "phase67-t3-phon" });
for (let i = 0; i < 100; i++) sim.step();
const state = sim.getState();
const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
leaves.sort();

console.log(`=== Phase 67 T3: Phonotactic gate probe (100 gens, ${leaves.length} leaves) ===\n`);

for (const id of leaves.slice(0, 3)) {
  const lang = state.tree[id]!.language;
  console.log(`${id} ${lang.name} profile=${JSON.stringify(lang.phonotacticProfile)}`);
  let violations = 0;
  let total = 0;
  for (const m of Object.keys(lang.lexicon)) {
    const f = lang.lexicon[m]!;
    total++;
    const onset = onsetClusterLen(f);
    const coda = codaClusterLen(f);
    if (onset > (lang.phonotacticProfile?.maxOnset ?? 99)) violations++;
    if (coda > (lang.phonotacticProfile?.maxCoda ?? 99)) violations++;
  }
  console.log(`  cluster violations: ${violations}/${total} entries`);
  // Score the whole lexicon's average compliance.
  let scoreSum = 0;
  for (const m of Object.keys(lang.lexicon)) {
    scoreSum += langPhonotacticScore(lang, lang.lexicon[m]!);
  }
  console.log(`  avg phonotactic score: ${(scoreSum / total).toFixed(3)}`);
  console.log();
}
