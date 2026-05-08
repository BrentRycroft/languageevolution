/**
 * Phase 66 T2 probe: productive derivation at narrative runtime.
 *
 * Force a productive agentive suffix in an English-flavoured
 * preset, then call pickRuntimeDerivedMeaning and report the
 * derived forms. Confirms the runtime path emits novel forms not
 * in the lexicon at gen 0.
 *
 *   npx tsx scripts/probes/phase66_t2_runtime_deriv.ts
 */
import { createSimulation } from "../../src/engine/simulation";
import { presetEnglish } from "../../src/engine/presets/english";
import {
  pickRuntimeDerivedMeaning,
  tryDerivedFormFromMeaning,
} from "../../src/engine/morphology/derivation";
import { formToString } from "../../src/engine/phonology/ipa";
import { makeRng } from "../../src/engine/rng";
import { leafIds } from "../../src/engine/tree/split";

const sim = createSimulation({ ...presetEnglish(), seed: "phase66-t2-probe" });
for (let i = 0; i < 100; i++) sim.step();
const state = sim.getState();
const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
leaves.sort();

const lang = state.tree[leaves[0]!]!.language;

// Force at least one suffix productive so the probe shows the
// emission mechanism. Real productivity emerges over many more gens
// after enough attestations cross the threshold.
if (lang.derivationalSuffixes && lang.derivationalSuffixes.length > 0) {
  const candidate = lang.derivationalSuffixes.find((s) => s.category === "agentive") ?? lang.derivationalSuffixes[0];
  if (candidate) {
    candidate.productive = true;
    candidate.usageCount = 50;
  }
}
console.log(`=== Phase 66 T2: Runtime derivation probe (100 gens, leaf=${lang.name}) ===\n`);

const productive = (lang.derivationalSuffixes ?? []).filter((s) => s.productive);
console.log(`Productive suffixes: ${productive.length}`);
for (const s of productive.slice(0, 5)) {
  console.log(`  -${s.tag}.${s.category} affix=/${s.affix.join("")}/ usageCount=${s.usageCount}`);
}
console.log();

const rng = makeRng("rt-deriv-probe");
const seen = new Set<string>();
console.log(`Sampling 12 runtime derivations:`);
for (let i = 0; i < 12; i++) {
  const result = pickRuntimeDerivedMeaning(lang, rng);
  if (!result) continue;
  if (seen.has(result.meaning)) continue;
  seen.add(result.meaning);
  const inLex = lang.lexicon[result.meaning];
  console.log(
    `  ${result.meaning.padEnd(20)} → ${formToString(result.form).padEnd(15)} (base=${result.baseMeaning} -${result.suffixTag}; in-lex=${inLex ? "yes" : "no"})`,
  );
}

console.log(`\nDirect tryDerivedFormFromMeaning checks:`);
for (const m of ["see-agt", "run-agt", "happy-abs"]) {
  const f = tryDerivedFormFromMeaning(lang, m);
  console.log(`  ${m.padEnd(15)} → ${f ? formToString(f) : "null (no productive suffix or base)"}`);
}
