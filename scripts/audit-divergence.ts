/**
 * Phase-23 audit: run a 200-generation simulation from the Modern English
 * preset and report how much languages have diverged from the proto + from
 * each other. Tracks per-generation activity inline so the bounded
 * MAX_EVENTS_PER_LANGUAGE = 80 queue doesn't truncate counts.
 *
 * Run with: npx tsx scripts/audit-divergence.ts
 */
import { presetEnglish } from "../src/engine/presets/english";
import { createSimulation } from "../src/engine/simulation";
import { leafIds } from "../src/engine/tree/split";
import { levenshtein } from "../src/engine/phonology/ipa";
import { generateDiscourseNarrative } from "../src/engine/narrative/discourse_generate";

interface LangActivity {
  soundChangeEvents: number;
  coinageEvents: number;
  borrowEvents: number;
  semanticDriftEvents: number;
  formsShiftedTotal: number;
}

function meanDistanceVsSeed(
  lang: import("../src/engine/types").Language,
  seedLex: import("../src/engine/types").Lexicon,
): { mean: number; n: number; nChanged: number } {
  let total = 0;
  let n = 0;
  let changed = 0;
  for (const [meaning, seedForm] of Object.entries(seedLex)) {
    const cur = lang.lexicon[meaning];
    if (!cur) continue;
    const d = levenshtein(cur, seedForm);
    total += d;
    n++;
    if (d > 0) changed++;
  }
  return { mean: n > 0 ? total / n : 0, n, nChanged: changed };
}

function pairwiseMeanDistance(
  langs: import("../src/engine/types").Language[],
  seedLex: import("../src/engine/types").Lexicon,
): number {
  if (langs.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < langs.length; i++) {
    for (let j = i + 1; j < langs.length; j++) {
      const a = langs[i]!;
      const b = langs[j]!;
      let d = 0;
      let n = 0;
      for (const meaning of Object.keys(seedLex)) {
        const fa = a.lexicon[meaning];
        const fb = b.lexicon[meaning];
        if (!fa || !fb) continue;
        d += levenshtein(fa, fb);
        n++;
      }
      if (n > 0) {
        total += d / n;
        pairs++;
      }
    }
  }
  return pairs > 0 ? total / pairs : 0;
}

function runAudit(seed: string, gens: number): void {
  const config = { ...presetEnglish(), seed };
  const sim = createSimulation(config);

  // Per-language activity tracker keyed by language id, accumulating
  // counts over each generation BEFORE the bounded queue truncates them.
  const activity = new Map<string, LangActivity>();
  const ensure = (id: string): LangActivity => {
    let a = activity.get(id);
    if (!a) {
      a = {
        soundChangeEvents: 0,
        coinageEvents: 0,
        borrowEvents: 0,
        semanticDriftEvents: 0,
        formsShiftedTotal: 0,
      };
      activity.set(id, a);
    }
    return a;
  };

  // Snapshot prior event counts so we can diff after each step.
  const eventCount = new Map<string, number>();
  for (let g = 0; g < gens; g++) {
    sim.step();
    for (const id of Object.keys(sim.getState().tree)) {
      const lang = sim.getState().tree[id]!.language;
      const prior = eventCount.get(id) ?? 0;
      // Walk events from `prior` onward — but events are FIFO-evicted at
      // 80, so we must instead count the new events by their generation
      // matching the just-completed step.
      const newEvents = lang.events.filter((e) => e.generation === g + 1);
      const a = ensure(id);
      for (const ev of newEvents) {
        if (ev.kind === "sound_change") {
          a.soundChangeEvents++;
          // Parse "${n} forms shifted" out of description.
          const m = ev.description.match(/(\d+) forms? shifted/);
          if (m) a.formsShiftedTotal += Number(m[1]);
        } else if (ev.kind === "coinage") a.coinageEvents++;
        else if (ev.kind === "borrow") a.borrowEvents++;
        else if (ev.kind === "semantic_drift") a.semanticDriftEvents++;
      }
      eventCount.set(id, lang.events.length);
    }
  }

  const state = sim.getState();
  const seedLex = config.seedLexicon;
  const leaves = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );
  console.log(`\n========================================`);
  console.log(`Audit: seed=${seed} gens=${gens} alive=${leaves.length}`);
  console.log(`========================================`);

  // Per-language stats vs seed.
  console.log(`\nPer-language stats vs seed:`);
  console.log(
    `  ${"name".padEnd(14)} ${"meanΔ".padStart(7)} ${"% chg".padStart(6)} ${"#words".padStart(7)} ${"rules".padStart(6)} ${"sc.evt".padStart(7)} ${"forms↺".padStart(7)} ${"coinage".padStart(8)} ${"borrow".padStart(7)} ${"sem.drft".padStart(8)}`,
  );
  const langs: import("../src/engine/types").Language[] = [];
  for (const id of leaves) {
    const lang = state.tree[id]!.language;
    langs.push(lang);
    const { mean, n, nChanged } = meanDistanceVsSeed(lang, seedLex);
    const a = ensure(id);
    console.log(
      `  ${lang.name.padEnd(14)} ${mean.toFixed(2).padStart(7)} ${(n > 0 ? ((nChanged / n) * 100).toFixed(0) + "%" : "").padStart(6)} ${String(Object.keys(lang.lexicon).length).padStart(7)} ${String(lang.activeRules?.length ?? 0).padStart(6)} ${String(a.soundChangeEvents).padStart(7)} ${String(a.formsShiftedTotal).padStart(7)} ${String(a.coinageEvents).padStart(8)} ${String(a.borrowEvents).padStart(7)} ${String(a.semanticDriftEvents).padStart(8)}`,
    );
  }

  // Pairwise inter-language divergence.
  const pw = pairwiseMeanDistance(langs, seedLex);
  console.log(`\nPairwise mean Levenshtein between daughters: ${pw.toFixed(2)}`);

  // Sample narrative from the first language.
  if (langs.length > 0) {
    console.log(`\nSample narrative (4 lines, myth) for ${langs[0]!.name}:`);
    const narrative = generateDiscourseNarrative(langs[0]!, `audit.${seed}`, {
      lines: 4,
      genre: "myth",
      script: "ipa",
    });
    for (const line of narrative) {
      console.log(`  ${line.text}`);
      console.log(`    EN: ${line.english}`);
    }
  }

  // Sample lexicon comparison: pick 12 stable Swadesh meanings.
  console.log(`\nLexicon spot-check (Swadesh subset):`);
  const samples = [
    "water", "fire", "stone", "tree", "mother", "father",
    "sun", "moon", "eye", "hand", "see", "go",
  ];
  const cols = langs.slice(0, 6);
  console.log(
    `  ${"meaning".padEnd(8)} ${"seed".padEnd(10)} ${cols.map((l) => l.name.slice(0, 9).padEnd(10)).join(" ")}`,
  );
  for (const m of samples) {
    const seedForm = seedLex[m];
    if (!seedForm) continue;
    const seedStr = seedForm.join("");
    const cells = cols.map((l) =>
      (l.lexicon[m]?.join("") ?? "—").slice(0, 9).padEnd(10),
    );
    console.log(`  ${m.padEnd(8)} ${seedStr.padEnd(10)} ${cells.join(" ")}`);
  }
}

runAudit("audit-A", 200);
runAudit("audit-B", 200);
