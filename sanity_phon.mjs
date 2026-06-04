import { createSimulation } from "./src/engine/simulation.ts";
import { presetRomance } from "./src/engine/presets/romance.ts";
import { presetEnglish } from "./src/engine/presets/english.ts";
import { lexKeys, lexGet } from "./src/engine/lexicon/access.ts";

function leafLangs(state) {
  return Object.values(state.tree)
    .filter((n) => !n.children || n.children.length === 0)
    .map((n) => n.language)
    .filter((l) => l && !l.extinct);
}

function run(name, cfg, gens) {
  const sim = createSimulation(cfg);
  const trackMeanings = ["water", "fire", "year", "new", "you", "i", "eye", "yellow", "young"];
  const initial = {};
  {
    const st = sim.getState();
    const lang = leafLangs(st)[0];
    for (const m of lexKeys(lang)) {
      const g = lang.glossOf?.(m) ?? m;
    }
  }
  for (let i = 0; i < gens; i++) sim.step();
  const st = sim.getState();
  const langs = leafLangs(st);
  // Count sound-change events by category from each leaf's event log.
  const catCounts = {};
  let glideEvents = 0;
  const sampleDescriptions = new Set();
  for (const lang of langs) {
    for (const ev of lang.events ?? []) {
      if (ev.kind === "sound_change" || ev.kind === "chain_shift" || ev.kind === "phonologisation") {
        const d = ev.description ?? "";
        if (/new sound law:|chain shift:|areal/.test(d)) {
          if (sampleDescriptions.size < 40) sampleDescriptions.add(d);
        }
        if (/glide|vocali|→ ?j|→ ?w|→ ?i|→ ?u|j ?→|w ?→|i ?→ ?j|u ?→ ?w/.test(d)) glideEvents++;
      }
    }
  }
  // inventory sizes
  const invSizes = langs.map((l) => l.phonemeInventory.segmental.length);
  console.log(`\n=== ${name} (${gens} gens, ${langs.length} leaves) ===`);
  console.log(`inventory sizes: ${invSizes.join(", ")}`);
  console.log(`glide-ish rule events: ${glideEvents}`);
  // count distinct active-rule templateIds and families across leaves
  const families = {};
  const templateIds = new Set();
  for (const lang of langs) {
    for (const r of lang.activeRules ?? []) {
      families[r.family] = (families[r.family] ?? 0) + 1;
      templateIds.add(r.templateId);
    }
  }
  console.log(`active-rule families:`, families);
  console.log(`distinct active templateIds: ${templateIds.size}`);
  console.log(`sample new-law descriptions:`);
  for (const d of sampleDescriptions) console.log("   ", d);
  return { invSizes, glideEvents, families, templateIds: [...templateIds] };
}

run("romance", presetRomance(), 120);
run("english", presetEnglish(), 120);
