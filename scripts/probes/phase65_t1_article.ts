/**
 * Phase 65 T1 probe: article discourse-context gating.
 *
 * Run a 100-gen English simulation, generate a 30-line narrative,
 * and count occurrences of 'a' vs 'the'. Phase 60 audit observed
 * Romance daughters emitting 5+ "iːdduː" articles per sentence.
 * After T1 the ratio should rebalance toward indefinite first-mentions.
 *
 *   npx tsx scripts/probes/phase65_t1_article.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetEnglish } from "../../src/engine/presets/english";
import { generateDiscourseNarrative } from "../../src/engine/narrative/discourse_generate";
import { leafIds } from "../../src/engine/tree/split";

const sim = createSimulation({ ...presetEnglish(), seed: "phase65-t1-probe" });
for (let i = 0; i < 100; i++) sim.step();
const state = sim.getState();
const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
leaves.sort();

console.log(`=== Phase 65 T1: Article discourse gating probe (100 gens, ${leaves.length} leaves) ===\n`);

const lang = state.tree[leaves[0]!]!.language;
console.log(`Sample leaf: ${lang.name}  articlePresence=${lang.grammar.articlePresence}`);
console.log();

const lines = generateDiscourseNarrative(lang, "art-narr", {
  genre: "myth",
  lines: 15,
  script: "ipa",
});

let aCount = 0;
let theCount = 0;
for (const line of lines) {
  const tokens = line.english.toLowerCase().split(/\s+/);
  for (const tok of tokens) {
    if (tok === "a" || tok === "an") aCount++;
    if (tok === "the") theCount++;
  }
  console.log(`  ${line.english}`);
  console.log(`     ${line.text}`);
}

console.log(`\nArticle count: a/an=${aCount}, the=${theCount}`);
console.log(`Definite/indefinite ratio: ${aCount > 0 ? (theCount / aCount).toFixed(2) : "—"}`);
