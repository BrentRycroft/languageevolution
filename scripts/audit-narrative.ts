/**
 * Phase 30 Tranche 30j: narrative + language-shape audit.
 *
 * Runs each registered preset for a fixed number of generations,
 * picks an alive leaf, and emits:
 *
 *   - tier / cultural / typological metadata
 *   - phoneme inventory size + tier ratio + tone-stack diagnostics
 *   - sample lexicon (12 core meanings)
 *   - last 6 events
 *   - 4-line narrative samples per genre (myth, legend, daily,
 *     dialogue, poetry)
 *
 * Output is deterministic for a given (preset, gens) pair — drop a
 * snapshot into `__snapshots__/audit-narrative.txt` and CI / pre-merge
 * diff against expectation.
 *
 * Usage:
 *   npm run audit:narrative
 *   npm run audit:narrative -- --gens 100
 *   npm run audit:narrative -- --preset english
 */
import { createSimulation } from "../src/engine/simulation";
import { PRESETS } from "../src/engine/presets";
import { leafIds } from "../src/engine/tree/split";
import { generateDiscourseNarrative } from "../src/engine/narrative/discourse_generate";
import type { DiscourseGenre } from "../src/engine/narrative/discourse";
import { formToString } from "../src/engine/phonology/ipa";
import { tierInventoryTarget } from "../src/engine/steps/inventoryManagement";

const GENRES: DiscourseGenre[] = ["myth", "legend", "daily", "dialogue", "poetry"];

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

interface Args {
  gens: number;
  preset?: string;
  seed?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { gens: 60 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--gens" && argv[i + 1]) {
      out.gens = Number(argv[++i]);
    } else if (a === "--preset" && argv[i + 1]) {
      out.preset = argv[++i];
    } else if (a === "--seed" && argv[i + 1]) {
      out.seed = argv[++i];
    }
  }
  return out;
}

function countToneStack(p: string): number {
  const TONES = ["˧˥", "˥˩", "˥", "˧", "˩"];
  let n = 0;
  let rest = p;
  while (true) {
    let matched: string | null = null;
    for (const m of TONES) {
      if (rest.endsWith(m)) {
        matched = m;
        break;
      }
    }
    if (!matched) break;
    n++;
    rest = rest.slice(0, -matched.length);
    if (n > 8) break;
  }
  return n;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const presets = args.preset
    ? PRESETS.filter((p) => p.id === args.preset)
    : PRESETS;
  if (presets.length === 0) {
    console.error(`No preset matched id=${args.preset}`);
    process.exit(2);
  }

  for (const preset of presets) {
    const cfg = preset.build();
    const seed = args.seed ?? `audit-${preset.id}`;
    const sim = createSimulation({ ...cfg, seed });
    for (let i = 0; i < args.gens; i++) sim.step();
    const state = sim.getState();
    const leaves = leafIds(state.tree)
      .filter((id) => !state.tree[id]!.language.extinct)
      .sort();
    const leafId = leaves[0] ?? state.rootId;
    const lang = state.tree[leafId]!.language;
    const tier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
    const target = tierInventoryTarget(tier);
    const segCount = lang.phonemeInventory.segmental.length;
    const ratio = (segCount / target).toFixed(2);

    let stackedSeg = 0;
    let maxStack = 0;
    for (const p of lang.phonemeInventory.segmental) {
      const n = countToneStack(p);
      if (n > maxStack) maxStack = n;
      if (n > 1) stackedSeg++;
    }

    console.log(`\n${"=".repeat(72)}`);
    console.log(`PRESET: ${preset.id.toUpperCase()}  (leaf ${leafId} after ${args.gens} gens, seed=${seed})`);
    console.log(`${"=".repeat(72)}`);
    console.log(`name=${lang.name}  speakers=${lang.speakers}  tier=${tier}  conservatism=${lang.conservatism.toFixed(2)}  alive-leaves=${leaves.length}`);
    console.log(`stress=${lang.stressPattern}  word-order=${lang.grammar.wordOrder}  case=${lang.grammar.caseStrategy}  art=${lang.grammar.articlePresence}`);
    console.log(`adj=${lang.grammar.adjectivePosition}  neg=${lang.grammar.negationPosition}  hasCase=${lang.grammar.hasCase}`);
    console.log(`phonemes (${segCount}, target ${target}, ratio ${ratio}×): ${lang.phonemeInventory.segmental.join(" ")}`);
    if (lang.phonemeInventory.usesTones) {
      console.log(`tones (${lang.phonemeInventory.tones.length}): ${lang.phonemeInventory.tones.join(" ")}`);
    }
    console.log(`tone-stack diagnostics: stacked-segments=${stackedSeg}  max-stack=${maxStack}`);
    console.log(`active sound rules: ${lang.activeRules?.length ?? 0}  retired: ${lang.retiredRules?.length ?? 0}`);
    console.log(`words: ${lang.words?.length ?? 0}  lexicon meanings: ${Object.keys(lang.lexicon).length}`);

    const sampleMeanings = ["water", "fire", "mother", "father", "sun", "moon", "go", "see", "eat", "big", "i", "you"];
    console.log(`\nSample lexicon (12 core words):`);
    for (const m of sampleMeanings) {
      const f = lang.lexicon[m];
      if (f) console.log(`  ${pad(m, 10)} /${formToString(f)}/`);
    }

    console.log(`\nLast 6 events:`);
    const recent = lang.events.slice(-6);
    for (const e of recent) {
      console.log(`  g${e.generation}  ${pad(e.kind, 14)}  ${e.description.slice(0, 70)}`);
    }

    for (const g of GENRES) {
      const lines = generateDiscourseNarrative(lang, `${preset.id}-${g}`, { lines: 4, genre: g, script: "ipa" });
      console.log(`\n[${g.toUpperCase()}]`);
      for (const ln of lines) {
        console.log(`  ${pad(ln.english, 40)} → ${ln.text}`);
      }
    }
  }
}

main();
