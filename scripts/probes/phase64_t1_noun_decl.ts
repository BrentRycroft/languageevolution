/**
 * Phase 64 T1 probe: noun declension classes.
 *
 * Run a 100-gen Romance simulation and assert that `noun.case.acc`
 * surfaces are not uniform across nouns — i.e., declension classes
 * actually diverge in the lexicon. Reports per-leaf class
 * distribution + a sample of inflected forms.
 *
 *   npx tsx scripts/probes/phase64_t1_noun_decl.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetRomance } from "../../src/engine/presets/romance";
import { leafIds } from "../../src/engine/tree/split";
import { applyParadigm } from "../../src/engine/morphology/apply";
import { formToString } from "../../src/engine/phonology/ipa";
import { getNounDeclensionClass } from "../../src/engine/morphology/inflectionClass";

const sim = createSimulation({ ...presetRomance(), seed: "phase64-t1-probe" });
for (let i = 0; i < 100; i++) sim.step();
const state = sim.getState();
const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
leaves.sort();

console.log(`=== Phase 64 T1: Noun declension probe (100 gens, ${leaves.length} leaves) ===\n`);

const sampleNouns = ["king", "queen", "horse", "wolf", "tree", "stone", "river", "fire", "child", "father"];

for (const id of leaves.slice(0, 4)) {
  const lang = state.tree[id]!.language;
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const m of Object.keys(lang.lexicon)) {
    const cls = getNounDeclensionClass(lang, m);
    counts[cls] = (counts[cls] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const dist = Object.entries(counts)
    .map(([k, n]) => `${k}:${((n / total) * 100).toFixed(1)}%`)
    .join(" ");

  console.log(`${id} ${lang.name}  lex=${total}  decl-dist: ${dist}`);

  const acc = lang.morphology.paradigms["noun.case.acc"];
  if (!acc) continue;
  console.log(`  Sample acc forms (by class):`);
  const surfaces = new Set<string>();
  for (const m of sampleNouns) {
    const base = lang.lexicon[m];
    if (!base) continue;
    const cls = getNounDeclensionClass(lang, m);
    const out = applyParadigm(base, acc, lang, m);
    surfaces.add(out.join(""));
    console.log(`    ${m.padEnd(8)} (cls ${cls}): ${formToString(base)}-acc → ${formToString(out)}`);
  }
  console.log(`  Distinct acc surfaces from sample: ${surfaces.size}`);
  console.log();
}
