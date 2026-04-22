import type { Language, SimulationConfig, SimulationState } from "../types";
import { tryCoin } from "../genesis/apply";
import { neighborsOf } from "../semantics/neighbors";
import type { Rng } from "../rng";
import { genesisRulesFor, pushEvent } from "./helpers";

export function stepGenesis(
  lang: Language,
  config: SimulationConfig,
  state: SimulationState,
  rng: Rng,
  generation: number,
): void {
  const rules = genesisRulesFor(config);
  const lexSize = Object.keys(lang.lexicon).length;
  // Exponential decay: small languages coin aggressively, mature languages
  // only rarely. Plus jitter so identical sizes don't all coin in lockstep.
  const base = 5 * Math.exp(-lexSize / 40);
  const noise = 0.5 + rng.next();
  const target = Math.max(1, Math.round(base * noise * lang.conservatism));
  if (!rng.chance(Math.min(1, 0.5 + 0.5 * lang.conservatism))) return;
  for (let i = 0; i < target; i++) {
    const outcome = tryCoin(
      lang,
      state.tree,
      rules,
      config.genesis.ruleWeights,
      config.genesis.globalRate,
      rng,
    );
    if (!outcome) break;
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
