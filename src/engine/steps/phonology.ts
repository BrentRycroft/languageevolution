import type { Language, SimulationConfig } from "../types";
import { applyChangesToLexicon } from "../phonology/apply";
import { driftOrthography } from "../phonology/orthography";
import { maybeLearnOt } from "../phonology/ot";
import { rateMultiplier } from "../phonology/rate";
import { applyOneRegularChange } from "../phonology/regular";
import { maybeSpreadTone } from "../phonology/tone_spread";
import { applyPhonologyToAffixes } from "../morphology/evolve";
import { ageAndRetire, proposeOneRule, reinforce } from "../phonology/propose";
import type { Rng } from "../rng";
import { changesForLang, pushEvent, refreshInventory } from "./helpers";

/** Try to invent a rule roughly every this many generations per language. */
const PROPOSAL_CADENCE = 8;

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

  // Procedural rule lifecycle: reinforce rules that still have sites to
  // feed on, then age & retire the rest. Finally consider inventing a new
  // rule every PROPOSAL_CADENCE generations.
  if (lang.activeRules && lang.activeRules.length > 0) {
    lang.activeRules = lang.activeRules.map((rule) => {
      for (const m of Object.keys(lang.lexicon)) {
        if (rule.outputMap && matchesSome(rule, lang.lexicon[m]!)) {
          return reinforce(rule, generation);
        }
      }
      return rule;
    });
    const { retired } = ageAndRetire(lang, generation);
    for (const id of retired) {
      pushEvent(lang, {
        generation,
        kind: "grammar_shift",
        description: `sound law retired: ${ruleShortId(id)}`,
      });
    }
  }

  // Proposal: roughly once per PROPOSAL_CADENCE generations, gated by
  // conservatism (timid languages invent fewer laws).
  if (
    generation > 0 &&
    generation % PROPOSAL_CADENCE === 0 &&
    rng.chance(Math.min(1, 0.6 * lang.conservatism))
  ) {
    const rule = proposeOneRule(lang, rng, generation);
    if (rule) {
      if (!lang.activeRules) lang.activeRules = [];
      lang.activeRules.push(rule);
      pushEvent(lang, {
        generation,
        kind: "sound_change",
        description: `new sound law: ${rule.description}`,
      });
    }
  }
}

function matchesSome(
  rule: { outputMap: Record<string, string>; from: unknown },
  word: string[],
): boolean {
  // Cheap pre-check — the full matcher (contextMatches) is inside generated.ts
  // but reinforcement only needs "was there any input phoneme still present?"
  for (const p of word) {
    if (p in rule.outputMap) return true;
  }
  return false;
}

function ruleShortId(id: string): string {
  // Strip language + generation prefix so UI reads "lenition.stops_to_fricatives".
  const parts = id.split(".");
  if (parts.length <= 2) return id;
  return parts.slice(2).join(".");
}
