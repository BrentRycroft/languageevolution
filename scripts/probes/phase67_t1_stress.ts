/**
 * Phase 67 T1 probe: stress-pattern surface effects.
 *
 * Run two parallel English-flavoured simulations: one with fixed
 * stress (initial), one with lexical. Confirm that fixed-stress
 * has more deletion / vowel-reduction events.
 *
 *   npx tsx scripts/probes/phase67_t1_stress.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetEnglish } from "../../src/engine/presets/english";

function eventCount(events: any[] | undefined, kind: string): number {
  return (events ?? []).filter((e) =>
    /vowel|reduction|deletion/i.test(e.description ?? ""),
  ).length;
}

const seed = "phase67-t1-stress";

const fixed = presetEnglish();
fixed.seedStressPattern = "initial";
const sim1 = createSimulation({ ...fixed, seed });
for (let i = 0; i < 100; i++) sim1.step();
const lang1 = sim1.getState().tree[sim1.getState().rootId]!.language;

const lex = presetEnglish();
lex.seedStressPattern = "lexical";
const sim2 = createSimulation({ ...lex, seed });
for (let i = 0; i < 100; i++) sim2.step();
const lang2 = sim2.getState().tree[sim2.getState().rootId]!.language;

console.log(`=== Phase 67 T1: Stress-pattern surface effects probe (100 gens) ===\n`);
console.log(`Fixed-stress (initial) lang ${lang1.name}:`);
console.log(`  reduction/deletion events: ${eventCount(lang1.events, "vowel")}`);
console.log(`Lexical-stress lang ${lang2.name}:`);
console.log(`  reduction/deletion events: ${eventCount(lang2.events, "vowel")}`);
