/**
 * Phase 65 T2 probe: logophoric pronouns surface realization.
 *
 * Run a 50-gen English-flavoured preset with referenceTracking:
 * logophoric, then generate a few quoted-speech narratives. Confirm
 * that:
 *   - The matrix clause uses the regular pronoun for the matrix
 *     subject if pronominalised.
 *   - The embedded clause emits the logophoric pronoun (3sg.log)
 *     when the topic is the matrix subject.
 *   - A non-logophoric language under the same fixture emits
 *     `he/she/it` instead.
 *
 *   npx tsx scripts/probes/phase65_t2_logophoric.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetEnglish } from "../../src/engine/presets/english";
import { generateQuotedSpeech } from "../../src/engine/narrative/discourse_generate";
import { closedClassForm } from "../../src/engine/translator/closedClass";
import { formToString } from "../../src/engine/phonology/ipa";

console.log(`=== Phase 65 T2: Logophoric pronouns probe ===\n`);

// Logophoric language.
const config = presetEnglish();
config.seedGrammar = { ...config.seedGrammar!, referenceTracking: "logophoric" };
const sim = createSimulation({ ...config, seed: "phase65-t2-logo" });
for (let i = 0; i < 50; i++) sim.step();
const state = sim.getState();
const lang = state.tree[state.rootId]!.language;
console.log(`[Logophoric language: ${lang.name}, referenceTracking=${lang.grammar.referenceTracking}]`);
console.log(`  closed-class 3sg.log = ${formToString(closedClassForm(lang, "3sg.log") ?? [])}`);
console.log(`  closed-class 3pl.log = ${formToString(closedClassForm(lang, "3pl.log") ?? [])}`);
console.log(`  closed-class he      = ${formToString(closedClassForm(lang, "he") ?? [])}`);
console.log();

const trios = [
  { matrixSubject: "king",   matrixVerb: "say", embeddedVerb: "see",  embeddedObject: "wolf" },
  { matrixSubject: "queen",  matrixVerb: "say", embeddedVerb: "hold", embeddedObject: "stone" },
  { matrixSubject: "father", matrixVerb: "say", embeddedVerb: "go",   embeddedObject: "river" },
];
for (const t of trios) {
  const lines = generateQuotedSpeech(lang, `logo-${t.matrixSubject}`, { ...t, script: "ipa" });
  console.log(`Quoted ${t.matrixSubject} ${t.matrixVerb} ... ${t.embeddedVerb} ${t.embeddedObject}:`);
  for (const line of lines) {
    console.log(`  ${line.text}`);
    console.log(`  → ${line.english}\n`);
  }
}

// Non-logophoric for comparison.
const sim2 = createSimulation({ ...presetEnglish(), seed: "phase65-t2-none" });
for (let i = 0; i < 50; i++) sim2.step();
const lang2 = sim2.getState().tree[sim2.getState().rootId]!.language;
console.log(`[Non-logophoric: ${lang2.name}, referenceTracking=${lang2.grammar.referenceTracking ?? "none"}]`);
const linesNone = generateQuotedSpeech(lang2, "non-logo", {
  matrixSubject: "king",
  matrixVerb: "say",
  embeddedVerb: "see",
  embeddedObject: "wolf",
  script: "ipa",
});
for (const line of linesNone) {
  console.log(`  ${line.text}`);
  console.log(`  → ${line.english}\n`);
}
