/**
 * Phase 70 — Historical Mode diagnostic / gap-finder.
 *
 * Runs Romance + Historical Mode for 200 gens, then for each
 * terminal-role daughter prints:
 *   - Sample lexicon entries (water, sun, mother, father, eat,
 *     drink, big, the, and, with, my, you, ...).
 *   - Translator output for canonical English sentences.
 *   - Narrative output (myth genre, 2 lines).
 *   - Inventory snapshot.
 *
 * The intent is HUMAN INSPECTION — we don't pass/fail anything. The
 * historical-mode railroad gives us a target outcome (Spanish, French,
 * Italian, Portuguese flavor) and the real-world reference for each
 * is well-known. Where the simulator's output diverges from the
 * real-world descendant in a SYSTEMATIC way, that's a gap.
 *
 *   npx tsx scripts/probes/phase70_diagnostic_compare.ts
 *
 * Author note: this probe is intentionally read-only. It is not
 * suitable for CI; run it manually when investigating engine gaps.
 */

import { createSimulation } from "../../src/engine/simulation";
import { presetRomance } from "../../src/engine/presets/romance";
import { translateSentence } from "../../src/engine/translator/sentence";
import { generateDiscourseNarrative } from "../../src/engine/narrative/discourse_generate";
import type { Language, SimulationConfig } from "../../src/engine/types";

const STEPS = 200;
const SEED = "phase70-diag-1";

const SAMPLE_MEANINGS = [
  "water", "sun", "moon", "fire", "earth",
  "mother", "father", "person", "child", "woman", "man",
  "eat", "drink", "see", "go", "say", "make",
  "big", "small", "good", "old", "new",
  "the", "and", "with", "of", "in",
  "i", "you", "we", "they", "this", "that",
];

const DIAGNOSTIC_SENTENCES = [
  "the woman sees the man.",
  "i drink water.",
  "the child is small.",
  "the mother and the father go to the river.",
  "we eat fish.",
];

// Real-world reference for each role: a few canonical lexical items
// that should look "Spanish-like" / "French-like" / "Italian-like" /
// "Portuguese-like" by gen 200. This is here purely for the human
// reader to compare visually against the printed output. We don't
// assert on it because the railroad is soft.
const REAL_WORLD_HINTS: Record<string, Record<string, string>> = {
  castilian: { water: "agua", sun: "sol", mother: "madre", and: "y", the: "el/la" },
  lusitanian: { water: "água", sun: "sol", mother: "mãe", and: "e", the: "o/a" },
  francien: { water: "eau /o/", sun: "soleil", mother: "mère", and: "et", the: "le/la" },
  tuscan: { water: "acqua", sun: "sole", mother: "madre", and: "e", the: "il/la" },
  occitano: { water: "aiga", sun: "sorelh", mother: "maire", and: "e", the: "lo/la" },
  eastern: { water: "apă", sun: "soare", mother: "mamă", and: "și", the: "(suffixed)" },
};

function buildConfig(historical: boolean): SimulationConfig {
  const cfg = presetRomance();
  cfg.seed = SEED;
  if (historical) cfg.historical = { scheduleId: "romance", intensity: 1.0 };
  return cfg;
}

function dumpLanguage(lang: Language, header: string): void {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${header}  (id=${lang.id}, born=${lang.birthGeneration}, role=${lang.historicalRole})`);
  console.log("=".repeat(72));

  console.log("\n--- Sample lexicon ---");
  const realWorld = lang.historicalRole ? REAL_WORLD_HINTS[lang.historicalRole] : undefined;
  for (const m of SAMPLE_MEANINGS) {
    const form = lang.lexicon[m];
    const surface = form ? form.join("") : "(missing)";
    const ref = realWorld?.[m];
    const refStr = ref ? `   ← real ${lang.historicalRole}: ${ref}` : "";
    console.log(`  ${m.padEnd(10)} → ${surface.padEnd(18)}${refStr}`);
  }

  console.log("\n--- Phonology ---");
  const inv = lang.phonemeInventory;
  console.log(`  inventory size: ${inv.segmental.length} segments`);
  console.log(`  consonants: ${inv.segmental.filter((p) => !"aeiouɛɔəɪʊæɑøœɯyɨ".includes(p)).join(" ")}`);
  console.log(`  vowels: ${inv.segmental.filter((p) => "aeiouɛɔəɪʊæɑøœɯyɨ".includes(p)).join(" ")}`);
  if (lang.toneRegime !== "non-tonal") {
    console.log(`  tone regime: ${lang.toneRegime}`);
  }

  console.log("\n--- Grammar ---");
  console.log(`  word order: ${lang.grammar.wordOrder}`);
  console.log(`  case system: ${lang.grammar.hasCase ? "yes" : "no"}`);
  console.log(`  article: ${lang.grammar.articlePresence}`);
  console.log(`  gender count: ${lang.grammar.genderCount}`);
  console.log(`  alignment: ${lang.grammar.alignment}`);

  console.log("\n--- ruleBias (top families) ---");
  if (lang.ruleBias) {
    const sorted = Object.entries(lang.ruleBias).sort((a, b) => b[1] - a[1]);
    for (const [fam, val] of sorted.slice(0, 6)) {
      console.log(`  ${fam.padEnd(18)} ${val.toFixed(2)}`);
    }
  }

  console.log("\n--- Translator ---");
  for (const s of DIAGNOSTIC_SENTENCES) {
    const t = translateSentence(lang, s);
    console.log(`  EN: "${s}"`);
    console.log(`  TGT: ${t.arranged.join(" ")}`);
    if (t.missing.length > 0) {
      console.log(`  MISSING: ${t.missing.join(", ")}`);
    }
    console.log();
  }

  console.log("\n--- Narrative (myth, 2 lines) ---");
  try {
    const narr = generateDiscourseNarrative(lang, "diag", { lines: 2, genre: "myth" });
    for (const line of narr) {
      console.log(`  EN:   "${line.english}"`);
      console.log(`  TGT:  "${line.text}"`);
      console.log(`  glos: "${line.gloss}"`);
      console.log();
    }
  } catch (err) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const sim = createSimulation(buildConfig(true));
for (let i = 0; i < STEPS; i++) sim.step();
const state = sim.getState();
const aliveLeaves = Object.values(state.tree)
  .filter((n) => n.childrenIds.length === 0)
  .map((n) => n.language)
  .filter((l) => !l.extinct);

console.log(`Run: Romance + Historical Mode for ${STEPS} gens.`);
console.log(`Tree: ${aliveLeaves.length} alive leaves.`);
console.log(`Fired milestones: ${state.firedHistoricalMilestones?.length ?? 0}`);
console.log(`Skipped milestones: ${state.historicalMilestonesSkipped ?? 0}`);
console.log("");

// Group by role; pick one leaf per role for inspection.
const byRole: Record<string, Language[]> = {};
for (const lang of aliveLeaves) {
  const r = lang.historicalRole ?? "untagged";
  (byRole[r] ??= []).push(lang);
}
console.log(`Roles present: ${Object.keys(byRole).map((r) => `${r}×${byRole[r]!.length}`).join(", ")}`);

const inspectionRoles = [
  "castilian", "lusitanian", "francien", "tuscan",
  "occitano", "eastern",
];
for (const role of inspectionRoles) {
  const leaves = byRole[role];
  if (!leaves || leaves.length === 0) {
    console.log(`\n[${role.toUpperCase()}]: no leaves (skipped)`);
    continue;
  }
  // Pick the biggest leaf by speakers (most representative).
  const lang = leaves.slice().sort((a, b) => (b.speakers ?? 0) - (a.speakers ?? 0))[0]!;
  dumpLanguage(lang, `[${role.toUpperCase()}] ${lang.name}`);
}
