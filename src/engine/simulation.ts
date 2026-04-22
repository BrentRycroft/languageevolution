import type {
  Language,
  LanguageEvent,
  LanguageNode,
  LanguageTree,
  Lexicon,
  PhonemeInventory,
  SimulationConfig,
  SimulationState,
  SoundChange,
} from "./types";
import { CATALOG_BY_ID } from "./phonology/catalog";
import { applyChangesToLexicon } from "./phonology/apply";
import { rateMultiplier } from "./phonology/rate";
import { applyOneRegularChange } from "./phonology/regular";
import { maybeSpreadTone } from "./phonology/tone_spread";
import { tryBorrow } from "./contact/borrow";
import { levenshtein } from "./phonology/ipa";
import { complexityFor } from "./lexicon/complexity";
import { maybeTabooReplace } from "./lexicon/taboo";
import { toneOf } from "./phonology/tone";
import { GENESIS_BY_ID } from "./genesis/catalog";
import type { GenesisRule } from "./genesis/types";
import { tryGenesis } from "./genesis/apply";
import { driftGrammar } from "./grammar/evolve";
import { DEFAULT_GRAMMAR } from "./grammar/defaults";
import {
  applyPhonologyToAffixes,
  maybeGrammaticalize,
  maybeMergeParadigms,
} from "./morphology/evolve";
import { driftOneMeaning, type NeighborOverride } from "./semantics/drift";
import { neighborsOf } from "./semantics/neighbors";
import { leafIds, splitLeaf } from "./tree/split";
import { makeRng, type Rng } from "./rng";
import { cloneLexicon, cloneMorphology } from "./utils/clone";

const MAX_EVENTS_PER_LANGUAGE = 80;

export interface Simulation {
  getState: () => SimulationState;
  getConfig: () => SimulationConfig;
  step: () => void;
  reset: () => void;
  setAiNeighbors: (n: NeighborOverride | undefined) => void;
  restoreState: (snapshot: SimulationState) => void;
}

function pushEvent(lang: Language, event: LanguageEvent): void {
  lang.events.push(event);
  if (lang.events.length > MAX_EVENTS_PER_LANGUAGE) {
    lang.events.splice(0, lang.events.length - MAX_EVENTS_PER_LANGUAGE);
  }
}

function inventoryFromLexicon(lex: Lexicon): PhonemeInventory {
  const set = new Set<string>();
  for (const m of Object.keys(lex)) for (const p of lex[m]!) set.add(p);
  return {
    segmental: Array.from(set).sort(),
    tones: [],
    usesTones: false,
  };
}

function refreshInventory(lang: Language): void {
  const observed = new Set<string>();
  const tones = new Set<string>();
  for (const m of Object.keys(lang.lexicon)) {
    for (const p of lang.lexicon[m]!) {
      observed.add(p);
      const t = toneOf(p);
      if (t) tones.add(t);
    }
  }
  lang.phonemeInventory.segmental = Array.from(observed).sort();
  lang.phonemeInventory.tones = Array.from(tones).sort();
  lang.phonemeInventory.usesTones = tones.size > 0;
}

function buildInitialState(config: SimulationConfig): SimulationState {
  const rng = makeRng(config.seed);
  const rootId = "L-0";
  const enabled = config.phonology.enabledChangeIds.slice().sort();
  const weights: Record<string, number> = {};
  for (const id of enabled) {
    weights[id] = config.phonology.changeWeights[id] ?? CATALOG_BY_ID[id]?.baseWeight ?? 1;
  }
  const seedLex = cloneLexicon(config.seedLexicon);
  const rootLang: Language = {
    id: rootId,
    name: "Proto",
    lexicon: seedLex,
    enabledChangeIds: enabled,
    changeWeights: weights,
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: { ...(config.seedFrequencyHints ?? {}) },
    phonemeInventory: inventoryFromLexicon(seedLex),
    morphology: cloneMorphology(config.seedMorphology),
    localNeighbors: {},
    // Proto starts at a deterministic 1.0 so base runs are reproducible;
    // daughters jitter on split.
    conservatism: 1.0,
    wordOrigin: {},
  };
  const rootNode: LanguageNode = {
    language: rootLang,
    parentId: null,
    childrenIds: [],
  };
  const tree: LanguageTree = { [rootId]: rootNode };
  return {
    generation: 0,
    tree,
    rootId,
    rngState: rng.state(),
  };
}

function changesForLang(lang: Language): SoundChange[] {
  return lang.enabledChangeIds
    .map((id) => CATALOG_BY_ID[id])
    .filter((c): c is SoundChange => !!c);
}

function genesisRulesFor(config: SimulationConfig): GenesisRule[] {
  return config.genesis.enabledRuleIds
    .map((id) => GENESIS_BY_ID[id])
    .filter((r): r is GenesisRule => !!r);
}

function stepPhonology(lang: Language, config: SimulationConfig, rng: Rng, generation: number): void {
  const before = lang.lexicon;
  const changes = changesForLang(lang);
  // Per-language conservatism multiplies into every rate call.
  const mult = rateMultiplier(generation, lang.id) * lang.conservatism;
  const opts = {
    globalRate: config.phonology.globalRate,
    weights: lang.changeWeights,
    rateMultiplier: mult,
    frequencyHints: lang.wordFrequencyHints,
  };
  lang.lexicon = applyChangesToLexicon(before, changes, rng, opts);
  // Affixes mutate in lockstep with the lexicon so morphology feels real.
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
    if (a !== b) mutated++;
  }
  if (mutated > 0) {
    refreshInventory(lang);
    pushEvent(lang, {
      generation,
      kind: "sound_change",
      description: `${mutated} form${mutated === 1 ? "" : "s"} shifted (×${mult.toFixed(2)})`,
    });
  }

  // Regular ("lawful") change: rare but applies to every matching site.
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

  // Tone spreading, only in tonal languages.
  const spread = maybeSpreadTone(lang, rng, 0.02);
  if (spread > 0) {
    pushEvent(lang, {
      generation,
      kind: "sound_change",
      description: `tone spread to ${spread} word${spread === 1 ? "" : "s"}`,
    });
  }
}

function stepContact(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const loan = tryBorrow(lang, state.tree, rng, config.contact.borrowProbabilityPerGeneration);
  if (loan) {
    lang.wordOrigin[loan.meaning] = `borrow:${loan.donor}`;
    pushEvent(lang, {
      generation,
      kind: "coinage",
      description: `borrowed "${loan.meaning}" from ${loan.donor} (${loan.originalForm} → ${loan.adaptedForm})`,
    });
  }
}

function stepGenesis(lang: Language, config: SimulationConfig, rng: Rng, generation: number): void {
  const rules = genesisRulesFor(config);
  const lexSize = Object.keys(lang.lexicon).length;
  // Exponential decay: small languages coin aggressively, mature languages
  // only rarely. Plus jitter so identical sizes don't all coin in lockstep.
  const base = 5 * Math.exp(-lexSize / 40);
  const noise = 0.5 + rng.next(); // [0.5, 1.5]
  const target = Math.max(1, Math.round(base * noise * lang.conservatism));
  // Conservatism gate: cautious languages sometimes skip the round entirely.
  if (!rng.chance(Math.min(1, 0.5 + 0.5 * lang.conservatism))) return;
  for (let i = 0; i < target; i++) {
    const result = tryGenesis(lang, rules, config.genesis.ruleWeights, config.genesis.globalRate, rng);
    if (!result) break;
    // Mid-range frequency for coinages; they haven't entrenched yet.
    lang.wordFrequencyHints[result] = 0.4;
    // Tag the origin (compound/derivation/reduplication based on naming pattern).
    lang.wordOrigin[result] = result.includes("-")
      ? /-(intens)$/.test(result)
        ? "reduplication"
        : /-(er|ness|ic|al|ine)$/.test(result)
          ? "derivation"
          : "compound"
      : "coined";
    pushEvent(lang, {
      generation,
      kind: "coinage",
      description: `coined ${result}`,
    });
  }
}

function stepGrammar(lang: Language, config: SimulationConfig, rng: Rng, generation: number): void {
  const p = Math.min(1, config.grammar.driftProbabilityPerGeneration * lang.conservatism);
  if (!rng.chance(p)) return;
  const shifts = driftGrammar(lang.grammar, rng);
  for (const s of shifts) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `${s.feature}: ${String(s.from)} → ${String(s.to)}`,
    });
  }
}

function stepSemantics(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
  override?: NeighborOverride,
): void {
  const p = Math.min(1, config.semantics.driftProbabilityPerGeneration * lang.conservatism);
  if (!rng.chance(p)) return;
  // Merge per-language compound overrides with the AI/static overrides.
  const merged: NeighborOverride = { ...(override ?? {}) };
  for (const [m, ns] of Object.entries(lang.localNeighbors)) {
    if (!merged[m]) merged[m] = ns;
  }
  const drift = driftOneMeaning(lang, rng, merged);
  if (drift) {
    // Propagate frequency hint under the new name so it keeps evolving.
    const hint = lang.wordFrequencyHints[drift.from];
    if (hint !== undefined) {
      lang.wordFrequencyHints[drift.to] = hint;
      delete lang.wordFrequencyHints[drift.from];
    }
    pushEvent(lang, {
      generation,
      kind: "semantic_drift",
      description: `${drift.from} → ${drift.to}`,
    });
  }
}

function stepMorphology(lang: Language, config: SimulationConfig, rng: Rng, generation: number): void {
  const gShift = maybeGrammaticalize(
    lang,
    rng,
    config.morphology.grammaticalizationProbability * lang.conservatism,
  );
  if (gShift) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: gShift.description,
    });
  }
  const merge = maybeMergeParadigms(lang, rng, config.morphology.paradigmMergeProbability * lang.conservatism);
  if (merge) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: merge.description,
    });
  }
}

function stepObsolescence(lang: Language, config: SimulationConfig, rng: Rng, generation: number): void {
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length < 2) return;
  // Find a near-homophone pair sharing a semantic neighborhood.
  for (let attempt = 0; attempt < 6; attempt++) {
    const a = meanings[rng.int(meanings.length)]!;
    const b = meanings[rng.int(meanings.length)]!;
    if (a === b) continue;
    const fa = lang.lexicon[a]!;
    const fb = lang.lexicon[b]!;
    if (Math.abs(fa.length - fb.length) > 1) continue;
    if (levenshtein(fa, fb) > config.obsolescence.maxDistanceForRivalry) continue;
    // Retention favours higher frequency AND higher semantic complexity:
    // abstract words have less conversational pressure and resist loss.
    const scoreA = (lang.wordFrequencyHints[a] ?? 0.5) + 0.1 * complexityFor(a);
    const scoreB = (lang.wordFrequencyHints[b] ?? 0.5) + 0.1 * complexityFor(b);
    const loser = scoreA < scoreB ? a : scoreB < scoreA ? b : rng.chance(0.5) ? a : b;
    const winner = loser === a ? b : a;
    const p = config.obsolescence.probabilityPerPairPerGeneration * lang.conservatism;
    if (!rng.chance(p)) return;
    delete lang.lexicon[loser];
    delete lang.wordFrequencyHints[loser];
    pushEvent(lang, {
      generation,
      kind: "semantic_drift",
      description: `retired "${loser}" (near-homophone of "${winner}")`,
    });
    return;
  }
}

function stepTreeSplit(
  state: SimulationState,
  leafId: string,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
): void {
  const age = state.generation - lang.birthGeneration;
  const aliveLeaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
  if (
    age >= config.tree.minGenerationsBetweenSplits &&
    aliveLeaves.length < config.tree.maxLeaves &&
    rng.chance(config.tree.splitProbabilityPerGeneration)
  ) {
    splitLeaf(state.tree, leafId, state.generation + 1, rng);
  }
}

function stepDeath(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
): void {
  const aliveLeaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
  if (aliveLeaves.length <= 1) return;
  const age = state.generation - lang.birthGeneration;
  if (age < config.tree.minGenerationsBeforeDeath) return;
  const pressure = aliveLeaves.length / Math.max(1, config.tree.maxLeaves);
  const p = config.tree.deathProbabilityPerGeneration * pressure;
  if (rng.chance(p)) {
    lang.extinct = true;
    lang.deathGeneration = state.generation + 1;
    pushEvent(lang, {
      generation: state.generation + 1,
      kind: "sound_change",
      description: "language went extinct",
    });
  }
}

// Bootstrap: for each derived meaning (compound/affixed) that has no
// entry in the static neighbor table, inherit neighbors from its parts so
// semantic drift and the translator can still reach it.
function bootstrapNeologismNeighbors(lang: Language, _rng: Rng): void {
  for (const m of Object.keys(lang.lexicon)) {
    if (!m.includes("-") && !/-(er|ness|ic|al|ine|intens)$/.test(m)) continue;
    const parts = m.split("-");
    // Frequency inheritance.
    for (const p of parts) {
      const hint = lang.wordFrequencyHints[p];
      if (hint && !lang.wordFrequencyHints[m]) {
        lang.wordFrequencyHints[m] = Math.max(lang.wordFrequencyHints[m] ?? 0, hint * 0.7);
      }
    }
    // Neighbor inheritance: union of parent neighbors (global + local),
    // filtered to meanings this language actually has.
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

export interface SimulationOptions {
  aiNeighbors?: NeighborOverride;
}

export function createSimulation(
  config: SimulationConfig,
  options: SimulationOptions = {},
): Simulation {
  let state: SimulationState = buildInitialState(config);
  let aiNeighbors = options.aiNeighbors;

  const step = (): void => {
    const rng = makeRng(state.rngState);
    const leaves = leafIds(state.tree);
    const nextGen = state.generation + 1;
    for (const leafId of leaves) {
      const lang = state.tree[leafId]!.language;
      if (lang.extinct) continue;
      if (config.modes.phonology) stepPhonology(lang, config, rng, nextGen);
      // Obsolescence runs BEFORE genesis so freshly-coined words are never
      // retired in the same step they were born in.
      stepObsolescence(lang, config, rng, nextGen);
      // Taboo replacement — rare, replaces a high-frequency meaning with a
      // euphemism drawn from a related cluster-mate.
      const taboo = maybeTabooReplace(
        lang,
        rng,
        config.taboo.replacementProbability * lang.conservatism,
      );
      if (taboo) {
        pushEvent(lang, {
          generation: nextGen,
          kind: "semantic_drift",
          description: `taboo: "${taboo.meaning}" replaced ${taboo.oldForm} → ${taboo.newForm}${
            taboo.donor ? ` (via ${taboo.donor})` : " (reduplication)"
          }`,
        });
      }
      if (config.modes.genesis) {
        stepGenesis(lang, config, rng, nextGen);
        bootstrapNeologismNeighbors(lang, rng);
      }
      if (config.modes.grammar) {
        stepGrammar(lang, config, rng, nextGen);
        stepMorphology(lang, config, rng, nextGen);
      }
      if (config.modes.semantics) stepSemantics(lang, config, rng, nextGen, aiNeighbors);
      stepContact(state, lang, config, rng, nextGen);
      if (config.modes.tree) stepTreeSplit(state, leafId, lang, config, rng);
      if (config.modes.death) stepDeath(state, lang, config, rng);
    }
    state = {
      ...state,
      generation: nextGen,
      rngState: rng.state(),
    };
  };

  const setAiNeighbors = (n: NeighborOverride | undefined): void => {
    aiNeighbors = n;
  };

  const reset = (): void => {
    state = buildInitialState(config);
  };

  const restoreState = (snapshot: SimulationState): void => {
    state = {
      generation: snapshot.generation,
      rootId: snapshot.rootId,
      rngState: snapshot.rngState,
      // Deep clone so external mutation can't corrupt.
      tree: JSON.parse(JSON.stringify(snapshot.tree)),
    };
  };

  return {
    getState: () => state,
    getConfig: () => config,
    step,
    reset,
    setAiNeighbors,
    restoreState,
  };
}

export function replay(config: SimulationConfig, generations: number): SimulationState {
  const sim = createSimulation(config);
  for (let i = 0; i < generations; i++) sim.step();
  return sim.getState();
}

export type { Rng };
