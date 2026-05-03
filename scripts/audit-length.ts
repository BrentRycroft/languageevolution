/**
 * Phase 23b audit: now that words are evolving meaningfully, check
 * whether they're shrinking too fast — the user reported words coming
 * out too short.
 */
import { presetEnglish } from "../src/engine/presets/english";
import { createSimulation } from "../src/engine/simulation";
import { leafIds } from "../src/engine/tree/split";
import { levenshtein } from "../src/engine/phonology/ipa";

function meanLen(lang: any): number {
  const ms = Object.keys(lang.lexicon);
  if (ms.length === 0) return 0;
  let total = 0;
  for (const m of ms) total += lang.lexicon[m].length;
  return total / ms.length;
}

function meanDelta(lang: any, seedLex: any): number {
  let total = 0,
    n = 0;
  for (const m of Object.keys(seedLex)) {
    const cur = lang.lexicon[m];
    const seed = seedLex[m];
    if (!cur || !seed) continue;
    total += levenshtein(cur, seed);
    n++;
  }
  return n > 0 ? total / n : 0;
}

function audit(seed: string): void {
  const cfg = { ...presetEnglish(), seed };
  const sim = createSimulation(cfg);

  // Track length distribution over time on the first leaf.
  const trace: Array<{ gen: number; meanLen: number; words: number }> = [];
  for (let g = 0; g <= 200; g++) {
    const leaves = leafIds(sim.getState().tree).filter(
      (id) => !sim.getState().tree[id]!.language.extinct,
    );
    if (leaves.length > 0) {
      const lang = sim.getState().tree[leaves[0]!]!.language;
      trace.push({ gen: g, meanLen: meanLen(lang), words: Object.keys(lang.lexicon).length });
    }
    if (g < 200) sim.step();
  }

  console.log(`\n=== ${seed} length-over-time on leaf 0 ===`);
  for (let g = 0; g <= 200; g += 25) {
    const t = trace[g];
    if (t) console.log(`  gen ${String(g).padStart(3)}: meanLen=${t.meanLen.toFixed(2)}  words=${t.words}`);
  }

  const seedLex = cfg.seedLexicon;
  const seedMeanLen = (() => {
    let t = 0,
      n = 0;
    for (const m of Object.keys(seedLex)) {
      t += seedLex[m]!.length;
      n++;
    }
    return n > 0 ? t / n : 0;
  })();

  const state = sim.getState();
  const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
  const langs = leaves.map((id) => state.tree[id]!.language);
  console.log(`\nSeed lexicon mean length: ${seedMeanLen.toFixed(2)}`);
  console.log(`\nFinal-state per-language:`);
  console.log(
    `  ${"name".padEnd(14)} ${"meanLen".padStart(8)} ${"meanΔ".padStart(7)} ${"words".padStart(6)} ${"len<3".padStart(7)} ${"len<2".padStart(7)}`,
  );
  for (const l of langs) {
    const lengths = Object.values(l.lexicon).map((f: any) => f.length);
    const lt3 = lengths.filter((n) => n < 3).length;
    const lt2 = lengths.filter((n) => n < 2).length;
    const ml = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
    const md = meanDelta(l, seedLex);
    console.log(
      `  ${l.name.padEnd(14)} ${ml.toFixed(2).padStart(8)} ${md.toFixed(2).padStart(7)} ${String(Object.keys(l.lexicon).length).padStart(6)} ${String(lt3).padStart(7)} ${String(lt2).padStart(7)}`,
    );
  }

  // Sample the shortest words in each language.
  console.log(`\nShortest words on leaf 0 (top 12):`);
  if (langs.length > 0) {
    const lang = langs[0]!;
    const entries = Object.entries(lang.lexicon)
      .map(([m, f]: any) => [m, (f as any).join(""), (f as any).length] as [string, string, number])
      .sort((a, b) => a[2] - b[2])
      .slice(0, 12);
    for (const [m, f, n] of entries) {
      console.log(`  ${m.padEnd(20)} → ${f.padEnd(8)} (len=${n})`);
    }
  }

  // Track water/mother/father trajectories.
  const TRACK = ["water", "fire", "mother", "father", "stone", "tree", "sun", "moon", "go", "see"];
  console.log(`\nFinal Swadesh forms across daughters (with lengths):`);
  console.log(`  ${"meaning".padEnd(8)} ${"seed".padEnd(8)} ${langs.slice(0, 6).map((l) => l.name.slice(0, 9).padEnd(10)).join(" ")}`);
  for (const m of TRACK) {
    const seed = seedLex[m];
    if (!seed) continue;
    const cells = langs.slice(0, 6).map((l) => {
      const f = l.lexicon[m];
      const s = f ? `${f.join("")}(${f.length})` : "—";
      return s.slice(0, 9).padEnd(10);
    });
    console.log(`  ${m.padEnd(8)} ${(seed.join("") + `(${seed.length})`).padEnd(8)} ${cells.join(" ")}`);
  }
}

audit("len-A");
audit("len-B");
