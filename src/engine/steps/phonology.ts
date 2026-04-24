import type { Language, SimulationConfig, SimulationState } from "../types";
import { applyChangesToLexicon } from "../phonology/apply";
import { driftOrthography } from "../phonology/orthography";
import { maybeLearnOt } from "../phonology/ot";
import { rateMultiplier, speakerFactor } from "../phonology/rate";
import { applyOneRegularChange } from "../phonology/regular";
import { maybeSpreadTone } from "../phonology/tone_spread";
import { applyPhonologyToAffixes } from "../morphology/evolve";
import { ageAndRetire, proposeOneRule, proposePushChain, reinforce } from "../phonology/propose";
import { matchSites, hasAnyMatch } from "../phonology/generated";
import type { Rng } from "../rng";
import { changesForLang, pushEvent, refreshInventory } from "./helpers";
import { leafIds } from "../tree/split";
import { geoDistance } from "../geo";

/**
 * Half-distance for areal diffusion of a newly-proposed sound law.
 * A sister language at this distance has a 50 % chance of receiving
 * the rule; sisters far outside the areal lose it quickly. Tuned
 * against the split step size (80 px) so primary-branch neighbours
 * are candidates, second-cousins are marginal.
 */
const AREAL_HALF_LIFE = 150;
const AREAL_BASE_PROBABILITY = 0.25;

/** Try to invent a rule roughly every this many generations per language. */
const PROPOSAL_CADENCE = 8;

export function stepPhonology(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
  state?: SimulationState,
): void {
  const before = lang.lexicon;
  const changes = changesForLang(lang);
  const mult =
    rateMultiplier(generation, lang.id) *
    lang.conservatism *
    speakerFactor(lang.speakers);
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
    registerOf: lang.registerOf,
  };
  lang.lexicon = applyChangesToLexicon(before, changes, rng, opts);
  // applyChangesToLexicon drops meanings whose forms became empty via
  // deletion rules. Clean up every per-meaning auxiliary map so we don't
  // accumulate dangling registerOf / wordOrigin / localNeighbors entries
  // over long runs. Also stamp lastChangeGeneration only for meanings
  // that still exist — the old loop would otherwise set a generation for
  // a now-deleted slot.
  for (const m of Object.keys(before)) {
    if (lang.lexicon[m]) continue;
    delete lang.wordFrequencyHints[m];
    delete lang.lastChangeGeneration[m];
    delete lang.wordOrigin[m];
    delete lang.localNeighbors[m];
    if (lang.registerOf) delete lang.registerOf[m];
  }
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
    // Skip meanings that were dropped by applyChangesToLexicon above —
    // they don't have a current form to compare against.
    if (!lang.lexicon[m]) continue;
    const a = before[m]!.join("");
    const b = lang.lexicon[m]!.join("");
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
  // rule every PROPOSAL_CADENCE generations. We use the full context-aware
  // matchSites here — not just the cheap "outputMap contains a phoneme in
  // this word" check — so rules that have input phonemes but fail their
  // contextual guard don't get falsely reinforced.
  if (lang.activeRules && lang.activeRules.length > 0) {
    lang.activeRules = lang.activeRules.map((rule) => {
      for (const m of Object.keys(lang.lexicon)) {
        if (matchSites(rule, lang.lexicon[m]!).length > 0) {
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
      // Chain-shift coupling: if a single-vowel raise would crash into a
      // phoneme the inventory already uses, paire-generate a push rule
      // that moves that pre-existing vowel one step further. Emit a
      // distinct chain_shift event linking the two by id.
      const pushRule = proposePushChain(lang, rule, generation);
      if (pushRule) {
        lang.activeRules.push(pushRule);
        pushEvent(lang, {
          generation,
          kind: "chain_shift",
          description: `chain shift: ${rule.description} → ${pushRule.description}`,
          meta: { pairedRuleId: rule.id },
        });
      }
      // Areal diffusion. Spatially-close alive sisters have a
      // distance-decayed probability of picking up the new rule —
      // models Sprachbund / wave-diffusion effects (the Balkan
      // linguistic area, the Rhenish fan, the Indian subcontinent's
      // retroflex spread across unrelated families). Only fires if
      // the sister's current inventory has a site for the rule;
      // otherwise there's nothing for the rule to operate on.
      if (state) {
        propagateArealRule(state, lang, rule, generation, rng);
      }
    }
  }
}

/**
 * Distance-decayed propagation of a freshly-minted sound law to
 * nearby alive sisters. Each candidate gets a separate chance based
 * on `AREAL_BASE_PROBABILITY × half-life / (half-life + d)`. The
 * donor language doesn't emit the event a second time — only the
 * recipient gets the history note.
 */
function propagateArealRule(
  state: SimulationState,
  donor: Language,
  rule: ReturnType<typeof proposeOneRule> & object,
  generation: number,
  rng: Rng,
): void {
  const donorCoords = donor.coords;
  if (!donorCoords) return;
  const alive = leafIds(state.tree).filter(
    (id) => id !== donor.id && !state.tree[id]!.language.extinct,
  );
  for (const id of alive) {
    const sister = state.tree[id]!.language;
    const sisterCoords = sister.coords;
    if (!sisterCoords) continue;
    const d = geoDistance(donorCoords, sisterCoords);
    const affinity = AREAL_HALF_LIFE / (AREAL_HALF_LIFE + d);
    const p = AREAL_BASE_PROBABILITY * affinity;
    if (!rng.chance(p)) continue;
    // Copy the rule with a sister-scoped id so the stemma doesn't
    // confuse them later.
    const adopted: typeof rule = {
      ...rule,
      id: `${sister.id}.g${generation}.areal.${rule.templateId}`,
      birthGeneration: generation,
      lastFireGeneration: generation,
    };
    if (!hasAnyMatch(adopted, sister)) continue;
    if (!sister.activeRules) sister.activeRules = [];
    // Avoid duplicate-template adoption — if the sister already has a
    // rule of the same templateId, skip.
    if (sister.activeRules.some((r) => r.templateId === rule.templateId)) continue;
    sister.activeRules.push(adopted);
    pushEvent(sister, {
      generation,
      kind: "sound_change",
      description: `areal diffusion from ${donor.name}: ${rule.description}`,
    });
  }
}

function ruleShortId(id: string): string {
  // Strip language + generation prefix so UI reads "lenition.stops_to_fricatives".
  const parts = id.split(".");
  if (parts.length <= 2) return id;
  return parts.slice(2).join(".");
}
