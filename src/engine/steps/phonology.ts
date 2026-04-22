import type { Language, SimulationConfig } from "../types";
import { applyChangesToLexicon } from "../phonology/apply";
import { driftOrthography } from "../phonology/orthography";
import { maybeLearnOt } from "../phonology/ot";
import { rateMultiplier } from "../phonology/rate";
import { applyOneRegularChange } from "../phonology/regular";
import { maybeSpreadTone } from "../phonology/tone_spread";
import { applyPhonologyToAffixes } from "../morphology/evolve";
import type { Rng } from "../rng";
import { changesForLang, pushEvent, refreshInventory } from "./helpers";

export function stepPhonology(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const before = lang.lexicon;
  const changes = changesForLang(lang);
  const mult = rateMultiplier(generation, lang.id) * lang.conservatism;
  const ages: Record<string, number> = {};
  for (const m of Object.keys(before)) {
    const last = lang.lastChangeGeneration[m];
    ages[m] = last === undefined ? 99 : generation - last;
  }
  const opts = {
    globalRate: config.phonology.globalRate,
    weights: lang.changeWeights,
    rateMultiplier: mult,
    frequencyHints: lang.wordFrequencyHints,
    agesSinceChange: ages,
  };
  lang.lexicon = applyChangesToLexicon(before, changes, rng, opts);
  applyPhonologyToAffixes(lang.morphology, (form) => {
    return changes.reduce((acc, change) => {
      const base = change.probabilityFor(acc);
      if (base <= 0) return acc;
      const weight = lang.changeWeights[change.id] ?? change.baseWeight;
      const prob = Math.min(1, base * weight * opts.globalRate * mult);
      if (!rng.chance(prob)) return acc;
      const next = change.apply(acc, rng);
      return next === acc ? acc : next;
    }, form);
  });
  let mutated = 0;
  for (const m of Object.keys(before)) {
    const a = before[m]!.join("");
    const b = (lang.lexicon[m] ?? []).join("");
    if (a !== b) {
      mutated++;
      lang.lastChangeGeneration[m] = generation;
    }
  }
  if (mutated > 0) {
    refreshInventory(lang);
    pushEvent(lang, {
      generation,
      kind: "sound_change",
      description: `${mutated} form${mutated === 1 ? "" : "s"} shifted (×${mult.toFixed(2)})`,
    });
  }

  if (rng.chance(config.phonology_lawful.regularChangeProbability)) {
    const ruleId = applyOneRegularChange(lang, changes, rng);
    if (ruleId) {
      refreshInventory(lang);
      pushEvent(lang, {
        generation,
        kind: "sound_change",
        description: `sound law: ${ruleId} applied exceptionlessly`,
      });
    }
  }

  const spread = maybeSpreadTone(lang, rng, 0.02);
  if (spread > 0) {
    pushEvent(lang, {
      generation,
      kind: "sound_change",
      description: `tone spread to ${spread} word${spread === 1 ? "" : "s"}`,
    });
  }

  const ortho = driftOrthography(lang, rng, 0.005 * lang.conservatism);
  if (ortho) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `orthography: ${ortho.phoneme} spelt "${ortho.from}" → "${ortho.to}"`,
    });
  }

  const ot = maybeLearnOt(lang, rng, 0.015 * lang.conservatism);
  if (ot) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `OT rerank: ${ot.from} ↔ ${ot.to}`,
    });
  }
}
