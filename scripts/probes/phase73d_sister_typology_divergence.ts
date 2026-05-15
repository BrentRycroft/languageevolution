/**
 * Phase 73d Tier-D probe: measure sister-daughter TYPOLOGICAL
 * divergence (not just lexical surface drift). Tier A's
 * `phase73a_sister_divergence` quantifies surface-form
 * distinguishability; this probe complements it by quantifying
 * how differently sister daughters move on the typology axes:
 *
 *   - direction vector (simplification / palatalization / synthesis)
 *   - ruleBias.lenition − ruleBias.fortition (lenition character)
 *   - phonotacticProfile.maxOnset / maxCoda / maxCluster
 *   - synthesisIndex / fusionIndex
 *   - stressPattern match / mismatch
 *   - phonemeInventory Jaccard distance
 *
 * Run: `npx tsx scripts/probes/phase73d_sister_typology_divergence.ts`
 *
 * Pass criterion: average pair distance ≥ 2.5 across 3 seeds;
 * at least one pair per seed ≥ 4.0 (the "PIE-grade divergence"
 * marker — sisters that have made dramatically different
 * typological choices).
 */

import { createSimulation } from "../../src/engine/simulation";
import { presetRomance } from "../../src/engine/presets/romance";

const SEEDS = ["d-typ-1", "d-typ-2", "d-typ-3"];
const STEPS = 200;

interface PairDistance {
  pair: [string, string];
  distance: number;
  components: {
    direction: number;
    leniChar: number;
    phonotactic: number;
    synthesis: number;
    stress: number;
    inventory: number;
  };
}

interface SeedReport {
  seed: string;
  leafCount: number;
  pairCount: number;
  avgDistance: number;
  maxDistance: number;
  pairs: PairDistance[];
}

function l1(a: number, b: number): number {
  return Math.abs(a - b);
}

function jaccard(a: ReadonlyArray<string>, b: ReadonlyArray<string>): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const intersect = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  if (union === 0) return 0;
  return 1 - intersect / union;
}

function runSeed(seed: string): SeedReport {
  const cfg = presetRomance();
  cfg.seed = seed;
  cfg.historical = { scheduleId: "romance", intensity: 1.0 };
  const sim = createSimulation(cfg);
  for (let i = 0; i < STEPS; i++) sim.step();
  const state = sim.getState();
  const leaves = Object.entries(state.tree)
    .filter(([, n]) => n.childrenIds.length === 0 && !n.language.extinct)
    .map(([id, n]) => ({ id, lang: n.language }));

  const pairs: PairDistance[] = [];
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i]!.lang;
      const b = leaves[j]!.lang;
      const da = a.typologicalDirection ?? { simplification: 0, palatalization: 0, synthesis: 0 };
      const db = b.typologicalDirection ?? { simplification: 0, palatalization: 0, synthesis: 0 };
      const directionDist = l1(da.simplification, db.simplification) + l1(da.palatalization, db.palatalization) + l1(da.synthesis, db.synthesis);
      const leniA = (a.ruleBias?.lenition ?? 1) - (a.ruleBias?.fortition ?? 1);
      const leniB = (b.ruleBias?.lenition ?? 1) - (b.ruleBias?.fortition ?? 1);
      const leniChar = l1(leniA, leniB);
      const ppa = a.phonotacticProfile;
      const ppb = b.phonotacticProfile;
      const phono = (ppa && ppb)
        ? l1(ppa.maxOnset, ppb.maxOnset) + l1(ppa.maxCoda, ppb.maxCoda) + l1(ppa.maxCluster, ppb.maxCluster)
        : 0;
      const synth = l1(a.grammar.synthesisIndex ?? 2.0, b.grammar.synthesisIndex ?? 2.0)
                  + l1(a.grammar.fusionIndex ?? 0.5, b.grammar.fusionIndex ?? 0.5) * 2;
      const stress = (a.stressPattern === b.stressPattern) ? 0 : 1;
      const inventory = jaccard(a.phonemeInventory.segmental, b.phonemeInventory.segmental) * 3;
      const distance = directionDist + leniChar + phono * 0.5 + synth + stress + inventory;
      pairs.push({
        pair: [leaves[i]!.id, leaves[j]!.id],
        distance,
        components: { direction: directionDist, leniChar, phonotactic: phono * 0.5, synthesis: synth, stress, inventory },
      });
    }
  }
  const avgDistance = pairs.reduce((a, p) => a + p.distance, 0) / Math.max(1, pairs.length);
  const maxDistance = pairs.reduce((m, p) => Math.max(m, p.distance), 0);
  return {
    seed,
    leafCount: leaves.length,
    pairCount: pairs.length,
    avgDistance,
    maxDistance,
    pairs,
  };
}

const reports = SEEDS.map(runSeed);
console.log("=== Phase 73d typological-divergence probe (3 seeds × 200 gens) ===\n");
for (const r of reports) {
  console.log(`Seed "${r.seed}" — ${r.leafCount} leaves, ${r.pairCount} pairs:`);
  console.log(`  avg pair distance = ${r.avgDistance.toFixed(2)}`);
  console.log(`  max pair distance = ${r.maxDistance.toFixed(2)}`);
  if (r.pairs.length > 0) {
    const top = r.pairs.slice().sort((a, b) => b.distance - a.distance)[0]!;
    console.log(`  top pair: ${top.pair.join(" / ")} = ${top.distance.toFixed(2)}`);
    console.log(`    components: direction=${top.components.direction.toFixed(2)}, leniChar=${top.components.leniChar.toFixed(2)}, phono=${top.components.phonotactic.toFixed(2)}, synth=${top.components.synthesis.toFixed(2)}, stress=${top.components.stress}, inv=${top.components.inventory.toFixed(2)}`);
  }
}
const avgAll = reports.reduce((s, r) => s + r.avgDistance, 0) / reports.length;
const maxAll = reports.reduce((s, r) => Math.max(s, r.maxDistance), 0);
console.log(`\nAggregate:\n  avg pair distance across seeds = ${avgAll.toFixed(2)}\n  max pair distance overall    = ${maxAll.toFixed(2)}\n`);

const PASS_AVG = 2.5;
const PASS_MAX = 4.0;
const passed = avgAll >= PASS_AVG && reports.every((r) => r.maxDistance >= PASS_MAX);
console.log(passed
  ? `PASS — average ${avgAll.toFixed(2)} ≥ ${PASS_AVG} and every seed has a pair ≥ ${PASS_MAX}.`
  : `FAIL — average ${avgAll.toFixed(2)} or per-seed max < threshold (PASS_AVG=${PASS_AVG}, PASS_MAX=${PASS_MAX}).`);
if (!passed) process.exit(1);
