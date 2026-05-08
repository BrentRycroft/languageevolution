/**
 * Phase 64 T3 probe: classifier agreement on counted nouns.
 *
 * Run a custom English-flavored preset with classifierSystem:true
 * for 50 gens, then translate counted-NP sentences and confirm
 * that the classifier emitted varies by noun semantic class.
 *
 *   npx tsx scripts/probes/phase64_t3_classifier.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetEnglish } from "../../src/engine/presets/english";
import { translateSentence } from "../../src/engine/translator/sentence";
import { leafIds } from "../../src/engine/tree/split";

const config = presetEnglish();
config.seedGrammar = { ...config.seedGrammar!, classifierSystem: true };
const sim = createSimulation({ ...config, seed: "phase64-t3-probe" });
for (let i = 0; i < 50; i++) sim.step();
const state = sim.getState();
const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
leaves.sort();

const sentences = [
  "i see two mothers",
  "i see two dogs",
  "i see two stones",
  "i see two boats",
  "i see two waters",
];

console.log(`=== Phase 64 T3: Classifier agreement probe (50 gens, ${leaves.length} leaves) ===\n`);

const lang = state.tree[leaves[0]!]!.language;
console.log(`Sample leaf: ${lang.name}`);
console.log(`classifierSystem: ${lang.grammar.classifierSystem}`);
console.log(`classifierTable: ${JSON.stringify(lang.grammar.classifierTable)}`);
console.log();

const classifiersSeen = new Set<string>();
for (const s of sentences) {
  const result = translateSentence(lang, s);
  const surface = result.targetTokens.map((t) => t.targetSurface).filter(Boolean).join(" ");
  console.log(`"${s}"`);
  console.log(`  → ${surface}`);
  for (const t of result.targetTokens) {
    if (t.englishLemma.startsWith("CLF:")) {
      classifiersSeen.add(t.englishLemma);
      console.log(`  classifier: ${t.englishLemma} surface=${t.targetSurface}`);
    }
  }
}

console.log(`\nDistinct classifier classes seen: ${classifiersSeen.size}`);
console.log(`Classifiers: ${[...classifiersSeen].join(", ")}`);
