import type { Language, SimulationConfig, SimulationState } from "../types";
import { tryCoin } from "../genesis/apply";
import { lexicalNeed } from "../genesis/need";
import { neighborsOf } from "../semantics/neighbors";
import type { Rng } from "../rng";
import { genesisRulesFor, pushEvent } from "./helpers";
import { isFormLegal } from "../phonology/wordShape";
import { lexicalCapacity } from "../lexicon/tier";
import { realismMultiplier } from "../phonology/rate";

export function stepGenesis(
  lang: Language,
  config: SimulationConfig,
  state: SimulationState,
  rng: Rng,
  generation: number,
): void {
  const rules = genesisRulesFor(config);
  const lexSize = Object.keys(lang.lexicon).length;
  const capacity = lang.lexicalCapacity ?? lexicalCapacity(lang, generation);
  const deficit = Math.max(0, capacity - lexSize);
  const base = 0.2 + 0.05 * deficit;
  const noise = 0.5 + rng.next();
  const target = Math.max(1, Math.round(base * noise * lang.conservatism));
  const atCapacity = lexSize >= capacity;
  const gateProb = atCapacity
    ? 0.25 * lang.conservatism
    : Math.min(1, 0.5 + 0.5 * lang.conservatism);
  if (!rng.chance(gateProb)) return;
  const need = lexicalNeed(lang, state.tree);
  for (let i = 0; i < target; i++) {
    const outcome = tryCoin(
      lang,
      state.tree,
      rules,
      config.genesis.ruleWeights,
      config.genesis.globalRate * realismMultiplier(config),
      rng,
      need,
    );
    if (!outcome) break;
    if (!isFormLegal(outcome.meaning, outcome.form)) continue;
    lang.lexicon[outcome.meaning] = outcome.form;
    lang.wordFrequencyHints[outcome.meaning] = 0.4;
    lang.wordOrigin[outcome.meaning] = outcome.originTag;
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
