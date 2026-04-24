import type { Language, SimulationConfig, SimulationState } from "../types";
import { tryCoin } from "../genesis/apply";
import { lexicalNeed } from "../genesis/need";
import { neighborsOf } from "../semantics/neighbors";
import type { Rng } from "../rng";
import { genesisRulesFor, pushEvent } from "./helpers";
import { isFormLegal } from "../phonology/wordShape";
import { lexicalCapacity } from "../lexicon/tier";

export function stepGenesis(
  lang: Language,
  config: SimulationConfig,
  state: SimulationState,
  rng: Rng,
  generation: number,
): void {
  const rules = genesisRulesFor(config);
  const lexSize = Object.keys(lang.lexicon).length;
  // Capacity-driven coinage: compare current lexicon size against a
  // per-language target that grows with cultural tier, age, and
  // speakers (see `lexicon/tier.ts::lexicalCapacity`). When we're
  // below capacity, coin aggressively; once at capacity, coinage
  // drops to a trickle (one every handful of generations). Always
  // keeps a small residual rate so stagnant languages still
  // occasionally introduce ideophones, reduplications, etc.
  const capacity = lang.lexicalCapacity ?? lexicalCapacity(lang, generation);
  const deficit = Math.max(0, capacity - lexSize);
  // Base target: ~5% of the deficit per step, +0.2 residual. Jitter
  // keeps identical sizes out of lockstep.
  const base = 0.2 + 0.05 * deficit;
  const noise = 0.5 + rng.next();
  const target = Math.max(1, Math.round(base * noise * lang.conservatism));
  // Capacity throttle: at or above the target capacity, gate the
  // step behind a moderate probability so saturated languages still
  // coin occasionally (reduplication, ideophones, new compound
  // combinations) — just at a much slower rate. Below capacity, use
  // the full gate so the deficit actually gets filled.
  const atCapacity = lexSize >= capacity;
  const gateProb = atCapacity
    ? 0.25 * lang.conservatism
    : Math.min(1, 0.5 + 0.5 * lang.conservatism);
  if (!rng.chance(gateProb)) return;
  // Compute need once per step; cheaper than recomputing for each coinage.
  // Gets stale across coinages within a single step but the drift is small.
  const need = lexicalNeed(lang, state.tree);
  for (let i = 0; i < target; i++) {
    const outcome = tryCoin(
      lang,
      state.tree,
      rules,
      config.genesis.ruleWeights,
      config.genesis.globalRate,
      rng,
      need,
    );
    if (!outcome) break;
    // Word-shape gate: refuse coinages that are phonotactically bad —
    // missing a nucleus, too short for a content word, or a lone
    // consonant. `isFormLegal` encodes the full rule (see
    // `phonology/wordShape.ts`). The need loop will reroll next step.
    if (!isFormLegal(outcome.meaning, outcome.form)) continue;
    // Commit the coinage to the lexicon.
    lang.lexicon[outcome.meaning] = outcome.form;
    // Mid-range frequency for freshly-coined words.
    lang.wordFrequencyHints[outcome.meaning] = 0.4;
    // Origin tag from the mechanism.
    lang.wordOrigin[outcome.meaning] = outcome.originTag;
    // Register: mechanism-supplied tag wins, else low-register default.
    if (lang.registerOf && !lang.registerOf[outcome.meaning]) {
      lang.registerOf[outcome.meaning] = outcome.register ?? "low";
    }
    pushEvent(lang, {
      generation,
      kind: "coinage",
      description: `${outcome.originTag}: ${outcome.meaning}`,
    });
  }
}

// Bootstrap: for each derived meaning (compound/affixed) that has no
// entry in the static neighbor table, inherit neighbors from its parts so
// semantic drift and the translator can still reach it.
export function bootstrapNeologismNeighbors(lang: Language): void {
  for (const m of Object.keys(lang.lexicon)) {
    if (!m.includes("-") && !/-(er|ness|ic|al|ine|intens)$/.test(m)) continue;
    const parts = m.split("-");
    for (const p of parts) {
      const hint = lang.wordFrequencyHints[p];
      if (hint && !lang.wordFrequencyHints[m]) {
        lang.wordFrequencyHints[m] = Math.max(
          lang.wordFrequencyHints[m] ?? 0,
          hint * 0.7,
        );
      }
    }
    if (neighborsOf(m).length > 0 || (lang.localNeighbors[m] ?? []).length > 0) continue;
    const proposed = new Set<string>();
    for (const p of parts) {
      for (const n of neighborsOf(p)) proposed.add(n);
      for (const n of lang.localNeighbors[p] ?? []) proposed.add(n);
    }
    const usable = Array.from(proposed).filter(
      (n) => n !== m && lang.lexicon[n] !== undefined,
    );
    if (usable.length > 0) {
      lang.localNeighbors[m] = usable.slice(0, 5);
    }
  }
}
