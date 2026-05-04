import type { Language, PendingArealRule, SimulationConfig, SimulationState, WordForm } from "../types";
import { applyChangesToLexicon } from "../phonology/apply";
import { driftOrthography, freezeLexicalSpelling } from "../phonology/orthography";
import { maybeLearnOt } from "../phonology/ot";
import { rateMultiplier, speakerFactor, isolationFactor, realismMultiplier } from "../phonology/rate";
import { applyOneRegularChange } from "../phonology/regular";
import { maybeSpreadTone } from "../phonology/tone_spread";
import { stepToneSandhi } from "../phonology/sandhi";
import { recordCorrespondences } from "../phonology/soundLaws";
import { applyPhonologyToAffixes } from "../morphology/evolve";
import { ageAndRetire, proposeOneRule, proposePushChain, reinforce } from "../phonology/propose";
import { bumpFrequency, decayFrequencies } from "../lexicon/frequencyDynamics";
import { recordVariant, reinforceCanonical, decayAndActuate } from "../lexicon/variants";
import { recordInnovation, stepSocialContagion } from "../lexicon/socialContagion";
import { matchSites, hasAnyMatch } from "../phonology/generated";
import { syncWordsAfterPhonology } from "../lexicon/word";
import { volatilityMultiplier } from "./volatility";
import { inventorySizePressure } from "./inventoryManagement";
import { stripTone } from "../phonology/tone";
import type { Rng } from "../rng";
import { changesForLang, pushEvent, refreshInventory } from "./helpers";
import { leafIds } from "../tree/split";
import { geoDistance } from "../geo";

const AREAL_BASE_PROBABILITY = 0.35;
const AREAL_WAVE_SPEED = 60;
const AREAL_WAVE_BAND = 80;
const AREAL_MAX_AGE = 30;

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
    isolationFactor(nearestNeighborDistance(state, lang)) *
    // Phase 25: time-varying volatility regime — multiplies rate during
    // upheaval periods (Norman conquest / Great Vowel Shift bursts) and
    // dampens it during stable centuries.
    volatilityMultiplier(lang);
  const ages: Record<string, number> = {};
  for (const m of Object.keys(before)) {
    const last = lang.lastChangeGeneration[m];
    ages[m] = last === undefined ? 99 : generation - last;
  }
  // Phase 24: build a per-meaning seed-length map for the soft erosion
  // resistance curve in apply.ts. Replaces Phase 23b's hard cap with a
  // smooth probability scaling that fades to zero as currentLen
  // approaches the floor (=2). The map covers seed meanings only;
  // post-seed coinages get full rate (their seedLen falls back to
  // current length, factor=1).
  const seedLengths: Record<string, number> = {};
  for (const m of Object.keys(config.seedLexicon)) {
    const f = config.seedLexicon[m];
    if (f && f.length > 0) seedLengths[m] = f.length;
  }
  // Phase 28d: per-meaning neighbour-momentum boost. For each meaning,
  // count what fraction of its local-neighbour set has changed within
  // the last NEIGHBOUR_WINDOW generations and convert to a multiplier
  // ∈ [1, 1.5]. Drives the S-curve of lexical diffusion: a word whose
  // semantic neighbours are actively shifting picks up the change
  // faster, while an isolated meaning resists. When a meaning has no
  // recorded neighbours (early sim, or for closed-class words),
  // momentum stays at 1 (neutral).
  const NEIGHBOUR_WINDOW = 20;
  const NEIGHBOUR_MOMENTUM_MAX = 0.5;
  const neighbourMomentum: Record<string, number> = {};
  for (const m of Object.keys(before)) {
    const nbrs = lang.localNeighbors[m];
    if (!nbrs || nbrs.length === 0) continue;
    let recentlyChanged = 0;
    for (const n of nbrs) {
      const last = lang.lastChangeGeneration[n];
      if (last !== undefined && generation - last <= NEIGHBOUR_WINDOW) {
        recentlyChanged++;
      }
    }
    const fraction = recentlyChanged / nbrs.length;
    neighbourMomentum[m] = 1 + NEIGHBOUR_MOMENTUM_MAX * fraction;
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
    seedLengths,
    neighbourMomentum,
  };
  lang.lexicon = applyChangesToLexicon(before, changes, rng, opts);
  // Phase 29 Tranche 5d: record proto→daughter substitutions for
  // every position-aligned change to surface systematic correspondences
  // (Grimm's-Law-grade shifts) in the UI / audit reports.
  recordCorrespondences(lang, before, lang.lexicon, generation);
  // Phase 27.1: when the language is already over its tier-target
  // inventory, reject post-rule forms that introduce phonemes which
  // weren't in the inventory before this generation. This prevents
  // sound-change additions from outpacing homeostatic pruning.
  // Mergers (rules that REDUCE the inventory) are still allowed —
  // their outputs are by definition in the old inventory.
  if (inventorySizePressure(lang) > 0) {
    const oldInv = new Set(lang.phonemeInventory.segmental);
    for (const m of Object.keys(lang.lexicon)) {
      const newForm = lang.lexicon[m]!;
      const oldForm = before[m];
      if (!oldForm || newForm === oldForm) continue;
      let introducesNovel = false;
      for (const raw of newForm) {
        const base = stripTone(raw);
        if (!oldInv.has(base) && !oldInv.has(raw)) {
          introducesNovel = true;
          break;
        }
      }
      if (introducesNovel) {
        lang.lexicon[m] = oldForm;
      }
    }
  }
  for (const m of Object.keys(before)) {
    if (lang.lexicon[m]) continue;
    delete lang.wordFrequencyHints[m];
    delete lang.lastChangeGeneration[m];
    delete lang.wordOrigin[m];
    delete lang.localNeighbors[m];
    if (lang.registerOf) delete lang.registerOf[m];
    if (lang.variants) delete lang.variants[m];
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
      bumpFrequency(lang, m, 0.04);
      recordVariant(lang, m, before[m]!, generation, 0.55);
      recordVariant(lang, m, lang.lexicon[m]!, generation, 0.7);
      recordInnovation(lang, m, before[m]!, lang.lexicon[m]!, generation, "phonology");
    } else {
      reinforceCanonical(lang, m, lang.lexicon[m]!);
    }
  }
  decayFrequencies(lang);
  const actuations = decayAndActuate(lang, generation);
  for (const a of actuations) {
    lang.lastChangeGeneration[a.meaning] = generation;
    bumpFrequency(lang, a.meaning, 0.06);
    pushEvent(lang, {
      generation,
      kind: "actuation",
      description: `actuation: "${a.meaning}" /${a.fromForm.join("")}/ → /${a.toForm.join("")}/ (minority variant prevailed)`,
    });
  }
  const socialActuations = stepSocialContagion(lang, generation, rng);
  for (const a of socialActuations) {
    lang.lastChangeGeneration[a.meaning] = generation;
    bumpFrequency(lang, a.meaning, 0.06);
    const innov = a.innovator ? ` [from ${a.innovator}]` : "";
    pushEvent(lang, {
      generation,
      kind: "actuation",
      description: `social-contagion actuation: "${a.meaning}" /${a.fromForm.join("")}/ → /${a.toForm.join("")}/${innov} @ ${(a.finalAdoption * 100).toFixed(0)}%`,
    });
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

  // Phase 21d: reconcile lang.words against the post-phonology lexicon.
  // When two distinct words drift into the same surface form (the "child
  // / shall → one word" case), this folds them into a single Word with
  // both meanings and emits a merger event for the timeline.
  if (lang.words) {
    const mergers = syncWordsAfterPhonology(lang, generation);
    for (const ev of mergers) {
      const absorbed = ev.newlyAbsorbed.map((m) => `"${m}"`).join(", ");
      const survivors = ev.preExistingMeanings.map((m) => `"${m}"`).join(", ");
      pushEvent(lang, {
        generation,
        kind: "merger",
        description: `merger: /${ev.formKey}/ — ${absorbed} fell together with ${survivors}, now one word with multiple meanings`,
      });
    }
  }

  if (rng.chance(config.phonology_lawful.regularChangeProbability)) {
    // Phase 27.1: snapshot inventory before applyOneRegularChange so
    // we can revert if the rule introduces a phoneme that wasn't
    // previously in the inventory while we're already over target.
    const preInv = new Set(lang.phonemeInventory.segmental);
    const preLex: Record<string, WordForm> = {};
    if (inventorySizePressure(lang) > 0) {
      for (const m of Object.keys(lang.lexicon)) preLex[m] = lang.lexicon[m]!;
    }
    const ruleId = applyOneRegularChange(lang, changes, rng);
    if (ruleId) {
      if (Object.keys(preLex).length > 0) {
        let introducesNovel = false;
        outer: for (const m of Object.keys(lang.lexicon)) {
          for (const raw of lang.lexicon[m]!) {
            const base = stripTone(raw);
            if (!preInv.has(base) && !preInv.has(raw)) {
              introducesNovel = true;
              break outer;
            }
          }
        }
        if (introducesNovel) {
          for (const m of Object.keys(preLex)) lang.lexicon[m] = preLex[m]!;
        }
      }
      refreshInventory(lang);
      pushEvent(lang, {
        generation,
        kind: "sound_change",
        description: `sound law: ${ruleId} applied exceptionlessly`,
      });
    }
  }

  // Phase 27.1: the historical 4% per-gen prunePhonemes call here was
  // retired. Phoneme pruning now lives entirely in
  // stepInventoryHomeostasis (which uses functional-load-aware
  // selection and pressure-scaled attempt counts).

  const spread = maybeSpreadTone(lang, rng, 0.02);
  if (spread > 0) {
    pushEvent(lang, {
      generation,
      kind: "sound_change",
      description: `tone spread to ${spread} word${spread === 1 ? "" : "s"}`,
    });
  }

  // Phase 29 Tranche 5g: tone sandhi — adjacent-tone resolution
  // (Mandarin T3+T3 → T2+T3, OCP avoidance, contour smoothing).
  const sandhiHits = stepToneSandhi(lang, rng, generation);
  if (sandhiHits > 0) {
    pushEvent(lang, {
      generation,
      kind: "sound_change",
      description: `tone sandhi: ${sandhiHits} adjacent-tone pair${sandhiHits === 1 ? "" : "s"} resolved`,
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

  // Lexical spelling freeze — only fires for tier-3 languages, captures
  // the current romanization of high-frequency words so they don't drift
  // with future sound change. Models the English knight/though/gnome
  // pattern.
  const frozen = freezeLexicalSpelling(lang, rng, 0.001);
  if (frozen) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `lexical spelling frozen: "${frozen.meaning}" → "${frozen.spelling}"`,
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
      if (state && lang.coords) {
        if (!state.pendingArealRules) state.pendingArealRules = [];
        state.pendingArealRules.push({
          rule,
          donorId: lang.id,
          donorCoords: { ...lang.coords },
          birthGeneration: generation,
        });
      }
    }
  }
}

export function stepArealWaves(
  state: SimulationState,
  generation: number,
  rng: Rng,
): void {
  const pending = state.pendingArealRules;
  if (!pending || pending.length === 0) return;
  const alive = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );
  const survivors: PendingArealRule[] = [];
  for (const wave of pending) {
    const age = generation - wave.birthGeneration;
    if (age <= 0) {
      survivors.push(wave);
      continue;
    }
    if (age > AREAL_MAX_AGE) continue;
    const radius = AREAL_WAVE_SPEED * age;
    const inner = Math.max(0, radius - AREAL_WAVE_BAND);
    const outer = radius + AREAL_WAVE_BAND;
    let anyMatch = false;
    for (const id of alive) {
      if (id === wave.donorId) continue;
      const sister = state.tree[id]!.language;
      const sisterCoords = sister.coords;
      if (!sisterCoords) continue;
      const d = geoDistance(wave.donorCoords, sisterCoords);
      if (d < inner || d > outer) {
        if (d > outer) anyMatch = anyMatch || false;
        else anyMatch = true;
        continue;
      }
      anyMatch = true;
      if (sister.activeRules?.some((r) => r.templateId === wave.rule.templateId)) continue;
      if (!rng.chance(AREAL_BASE_PROBABILITY)) continue;
      const adopted = {
        ...wave.rule,
        id: `${sister.id}.g${generation}.areal.${wave.rule.templateId}`,
        birthGeneration: generation,
        lastFireGeneration: generation,
      };
      if (!hasAnyMatch(adopted, sister)) continue;
      if (!sister.activeRules) sister.activeRules = [];
      sister.activeRules.push(adopted);
      const donorName = state.tree[wave.donorId]?.language.name ?? wave.donorId;
      pushEvent(sister, {
        generation,
        kind: "sound_change",
        description: `areal diffusion from ${donorName}: ${wave.rule.description}`,
      });
    }
    if (anyMatch) survivors.push(wave);
  }
  state.pendingArealRules = survivors;
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
