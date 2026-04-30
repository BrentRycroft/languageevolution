import type { Language, SimulationConfig, SimulationState, WordForm } from "../types";
import { applyChangesToLexicon } from "../phonology/apply";
import { driftOrthography } from "../phonology/orthography";
import { maybeLearnOt } from "../phonology/ot";
import { rateMultiplier, speakerFactor, isolationFactor, realismMultiplier } from "../phonology/rate";
import { applyOneRegularChange } from "../phonology/regular";
import { maybeSpreadTone } from "../phonology/tone_spread";
import { applyPhonologyToAffixes } from "../morphology/evolve";
import { ageAndRetire, proposeOneRule, proposePushChain, reinforce } from "../phonology/propose";
import { matchSites, hasAnyMatch } from "../phonology/generated";
import type { Rng } from "../rng";
import { changesForLang, pushEvent, refreshInventory } from "./helpers";
import { leafIds } from "../tree/split";
import { geoDistance } from "../geo";

const AREAL_HALF_LIFE = 150;
const AREAL_BASE_PROBABILITY = 0.25;

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
    speakerFactor(lang.speakers) *
    isolationFactor(nearestNeighborDistance(state, lang));
  const ages: Record<string, number> = {};
  for (const m of Object.keys(before)) {
    const last = lang.lastChangeGeneration[m];
    ages[m] = last === undefined ? 99 : generation - last;
  }
  const opts = {
    globalRate: config.phonology.globalRate * realismMultiplier(config),
    weights: lang.changeWeights,
    rateMultiplier: mult,
    frequencyHints: lang.wordFrequencyHints,
    agesSinceChange: ages,
    registerOf: lang.registerOf,
    stressPattern: lang.stressPattern,
    lexicalStress: lang.lexicalStress,
  };
  lang.lexicon = applyChangesToLexicon(before, changes, rng, opts);
  for (const m of Object.keys(before)) {
    if (lang.lexicon[m]) continue;
    delete lang.wordFrequencyHints[m];
    delete lang.lastChangeGeneration[m];
    delete lang.wordOrigin[m];
    delete lang.localNeighbors[m];
    if (lang.registerOf) delete lang.registerOf[m];
  }
  const evolveForm = (form: WordForm): WordForm => {
    return changes.reduce((acc, change) => {
      const base = change.probabilityFor(acc);
      if (base <= 0) return acc;
      const weight = lang.changeWeights[change.id] ?? change.baseWeight;
      const prob = Math.min(1, base * weight * opts.globalRate * mult);
      if (!rng.chance(prob)) return acc;
      const next = change.apply(acc, rng);
      return next === acc ? acc : next;
    }, form);
  };
  applyPhonologyToAffixes(lang.morphology, evolveForm);
  if (lang.suppletion) {
    for (const meaning of Object.keys(lang.suppletion)) {
      const slots = lang.suppletion[meaning]!;
      for (const cat of Object.keys(slots) as Array<keyof typeof slots>) {
        const form = slots[cat];
        if (!form || form.length === 0) continue;
        if (!rng.chance(0.5)) continue;
        slots[cat] = evolveForm(form);
      }
    }
  }
  if (lang.derivationalSuffixes) {
    for (const s of lang.derivationalSuffixes) {
      s.affix = evolveForm(s.affix);
    }
  }
  let mutated = 0;
  for (const m of Object.keys(before)) {
    if (!lang.lexicon[m]) continue;
    const a = before[m]!.join("");
    const b = lang.lexicon[m]!.join("");
    if (a !== b) {
      mutated++;
      lang.lastChangeGeneration[m] = generation;
    }
  }
  if (mutated > 0) {
    const oldInventory = new Set(lang.phonemeInventory.segmental);
    refreshInventory(lang);
    for (const p of lang.phonemeInventory.segmental) {
      if (!oldInventory.has(p) && lang.inventoryProvenance) {
        if (lang.inventoryProvenance[p]?.source === "native") {
          lang.inventoryProvenance[p] = {
            source: "internal-rule",
            generation,
          };
        }
      }
    }
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
      if (state) {
        propagateArealRule(state, lang, rule, generation, rng);
      }
    }
  }
}

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
    const adopted: typeof rule = {
      ...rule,
      id: `${sister.id}.g${generation}.areal.${rule.templateId}`,
      birthGeneration: generation,
      lastFireGeneration: generation,
    };
    if (!hasAnyMatch(adopted, sister)) continue;
    if (!sister.activeRules) sister.activeRules = [];
    if (sister.activeRules.some((r) => r.templateId === rule.templateId)) continue;
    sister.activeRules.push(adopted);
    pushEvent(sister, {
      generation,
      kind: "sound_change",
      description: `areal diffusion from ${donor.name}: ${rule.description}`,
    });
  }
}

function nearestNeighborDistance(
  state: SimulationState | undefined,
  lang: Language,
): number | undefined {
  if (!state || !lang.coords) return undefined;
  const leaves = leafIds(state.tree).filter(
    (id) => id !== lang.id && !state.tree[id]!.language.extinct,
  );
  let minDist = Infinity;
  for (const id of leaves) {
    const other = state.tree[id]!.language;
    if (!other.coords) continue;
    const d = geoDistance(lang.coords, other.coords);
    if (d < minDist) minDist = d;
  }
  return isFinite(minDist) ? minDist : undefined;
}

function ruleShortId(id: string): string {
  const parts = id.split(".");
  if (parts.length <= 2) return id;
  return parts.slice(2).join(".");
}
