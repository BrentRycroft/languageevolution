/**
 * Phase 40e: PIE 150-gen observation script.
 *
 * Runs the PIE preset for 150 gens and reports per-leaf:
 * - phoneme inventory size + segments
 * - sample-word divergence vs seed (from a 30-word Swadesh subset)
 * - recent events (last 8)
 * - aggregate stats: median divergence, fraction of bʰ/dʰ-heavy forms,
 *   inventory deviation from target
 *
 * Output is observational only — no thresholds, no failure gates.
 * Read the report after each major change to see whether the
 * diachrony shape has improved.
 *
 * Run: npm run audit:pie
 */

import { presetPIE } from "../src/engine/presets/pie";
import { createSimulation } from "../src/engine/simulation";
import { leafIds } from "../src/engine/tree/split";

const SEED = process.argv[2] ?? "pie-audit-150";
const GENS = Number(process.argv[3] ?? 150);

const cfg = { ...presetPIE(), seed: SEED };
const seedLex: Record<string, string[]> = {};
for (const m of Object.keys(cfg.seedLexicon)) {
  seedLex[m] = cfg.seedLexicon[m]!.slice();
}

const sim = createSimulation(cfg);
for (let i = 0; i < GENS; i++) sim.step();
const state = sim.getState();
const tree = state.tree;

const leaves = leafIds(tree).filter((id) => !tree[id]!.language.extinct);

console.log(`\n=== PIE @ gen ${state.generation} (seed="${SEED}") ===`);
console.log(`leaves alive: ${leaves.length}`);

const SAMPLES = [
  "i", "you", "we", "this", "not", "all",
  "one", "two", "three",
  "person", "man", "woman", "child", "father", "mother",
  "water", "fire", "sun", "moon", "earth", "stone", "tree",
  "see", "hear", "know", "go", "come",
  "big", "good", "new",
];

const ASPIRATED = new Set(["bʰ", "dʰ", "gʰ", "gʲʰ", "gʷʰ"]);

interface LeafStat {
  id: string;
  name: string;
  inventorySize: number;
  inventoryTarget: number;
  divergedSampleCount: number;
  totalSampleCount: number;
  aspirateHeavyCount: number;
  totalLemmas: number;
  speakers: number;
  tier: number;
  literaryStability: number;
  totalCoinages: number;
}

const stats: LeafStat[] = [];

for (const id of leaves) {
  const lang = tree[id]!.language;
  const target = lang.phonemeTarget ?? 30;
  const phonemes = lang.phonemeInventory.segmental;

  console.log(`\n--- ${id} (${lang.name}) ---`);
  console.log(`  speakers: ${lang.speakers ?? 0}, tier: ${lang.culturalTier ?? 0}, conservatism: ${lang.conservatism.toFixed(2)}`);
  console.log(`  inventory: ${phonemes.length} phonemes (target ${target})`);
  console.log(`  segments: ${phonemes.slice(0, 24).join(" ")}${phonemes.length > 24 ? " …" : ""}`);
  console.log(`  toneRegime: ${lang.toneRegime ?? "?"}`);
  console.log(`  literaryStability: ${(lang.literaryStability ?? 0).toFixed(2)}`);
  console.log(`  totalCoinages: ${lang.totalCoinages ?? 0}, lexicon size: ${Object.keys(lang.lexicon).length}`);
  if (lang.volatilityPhase) {
    console.log(`  volatility: ${lang.volatilityPhase.kind} ×${lang.volatilityPhase.multiplier.toFixed(2)} until gen ${lang.volatilityPhase.until}`);
  }

  console.log(`  word evolution (seed → daughter):`);
  let changed = 0;
  let total = 0;
  for (const m of SAMPLES) {
    const seedForm = seedLex[m]?.join("") ?? "—";
    const daughterForm = lang.lexicon[m]?.join("") ?? "(lost)";
    const arrow = seedForm === daughterForm ? "  =" : "  →";
    console.log(`    ${m.padEnd(10)} ${seedForm.padEnd(14)}${arrow} ${daughterForm}`);
    if (lang.lexicon[m]) {
      total++;
      if (seedForm !== daughterForm) changed++;
    }
  }
  console.log(`  ${changed}/${total} sample words changed`);

  // Aspirate-heavy count: how many lemmas in the lexicon contain at
  // least one of bʰ/dʰ/gʰ/gʲʰ/gʷʰ?
  let aspirateHeavy = 0;
  for (const m of Object.keys(lang.lexicon)) {
    const f = lang.lexicon[m]!;
    for (const p of f) {
      if (ASPIRATED.has(p)) { aspirateHeavy++; break; }
    }
  }
  console.log(`  bʰ/dʰ/gʰ-heavy: ${aspirateHeavy}/${Object.keys(lang.lexicon).length} lemmas (${(100 * aspirateHeavy / Math.max(1, Object.keys(lang.lexicon).length)).toFixed(0)}%)`);

  const recent = lang.events.slice(-6);
  if (recent.length > 0) {
    console.log(`  recent events:`);
    for (const e of recent) {
      console.log(`    g${e.generation} [${e.kind}] ${e.description.slice(0, 78)}`);
    }
  }

  stats.push({
    id,
    name: lang.name,
    inventorySize: phonemes.length,
    inventoryTarget: target,
    divergedSampleCount: changed,
    totalSampleCount: total,
    aspirateHeavyCount: aspirateHeavy,
    totalLemmas: Object.keys(lang.lexicon).length,
    speakers: lang.speakers ?? 0,
    tier: lang.culturalTier ?? 0,
    literaryStability: lang.literaryStability ?? 0,
    totalCoinages: lang.totalCoinages ?? 0,
  });
}

// Aggregate stats
console.log(`\n=== aggregate ===`);
if (stats.length > 0) {
  const meanInvDeviation =
    stats.reduce((s, x) => s + Math.abs(x.inventorySize - x.inventoryTarget), 0) / stats.length;
  const meanDivergence =
    stats.reduce((s, x) => s + (x.totalSampleCount > 0 ? x.divergedSampleCount / x.totalSampleCount : 0), 0) / stats.length;
  const meanAspirateRate =
    stats.reduce((s, x) => s + x.aspirateHeavyCount / Math.max(1, x.totalLemmas), 0) / stats.length;

  // Cross-leaf form convergence: for each sample, count distinct forms across leaves
  let convergenceCount = 0;
  for (const m of SAMPLES) {
    const forms = new Set<string>();
    for (const id of leaves) {
      const f = tree[id]!.language.lexicon[m];
      if (f) forms.add(f.join(""));
    }
    // If 70%+ of leaves share the same form, count as "convergent"
    if (forms.size > 0) {
      let maxCount = 0;
      const formCounts = new Map<string, number>();
      for (const id of leaves) {
        const f = tree[id]!.language.lexicon[m];
        if (!f) continue;
        const k = f.join("");
        const c = (formCounts.get(k) ?? 0) + 1;
        formCounts.set(k, c);
        if (c > maxCount) maxCount = c;
      }
      if (maxCount / leaves.length >= 0.7) convergenceCount++;
    }
  }

  console.log(`  mean phoneme-inventory deviation from target: ±${meanInvDeviation.toFixed(1)}`);
  console.log(`  mean sample divergence (Swadesh-30): ${(meanDivergence * 100).toFixed(0)}%`);
  console.log(`  mean fraction of bʰ/dʰ-heavy lemmas: ${(meanAspirateRate * 100).toFixed(0)}%`);
  console.log(`  cross-leaf convergent sample meanings (≥70% leaves share form): ${convergenceCount}/${SAMPLES.length}`);
  console.log(`  total leaves at tier ≥ 1: ${stats.filter((x) => x.tier >= 1).length}`);
  console.log(`  total coinages across leaves: ${stats.reduce((s, x) => s + x.totalCoinages, 0)}`);
}
console.log("");
