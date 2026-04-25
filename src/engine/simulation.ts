import type { SimulationConfig, SimulationState } from "./types";
import { leafIds, pickFirstSplitChildCount, splitLeaf } from "./tree/split";
import { makeRng, type Rng } from "./rng";
import { buildInitialState } from "./steps/init";
import { stepPhonology } from "./steps/phonology";
import { stepGenesis, bootstrapNeologismNeighbors } from "./steps/genesis";
import { stepGrammar, stepMorphology } from "./steps/grammar";
import { stepSemantics } from "./steps/semantics";
import { stepObsolescence } from "./steps/obsolescence";
import { stepContact } from "./steps/contact";
import { stepTreeSplit, stepDeath } from "./steps/tree";
import { stepTaboo } from "./steps/taboo";
import { computeTierCandidate, lexicalCapacity, populationCap } from "./lexicon/tier";
import { pushEvent } from "./steps/helpers";
import { TIER_LABELS } from "./lexicon/concepts";
import { applyKinshipSimplification } from "./semantics/recarve";

export interface Simulation {
  getState: () => SimulationState;
  getConfig: () => SimulationConfig;
  step: () => void;
  reset: () => void;
  restoreState: (snapshot: SimulationState) => void;
}

export interface SimulationOptions {}

export function createSimulation(
  config: SimulationConfig,
  _options: SimulationOptions = {},
): Simulation {
  let state: SimulationState = buildInitialState(config);

  const step = (): void => {
    const rng = makeRng(state.rngState);
    const nextGen = state.generation + 1;

    // Proto preservation: on the very first step (gen 0 → gen 1),
    // automatically split the root into two daughters. The proto itself
    // becomes a non-leaf node — its lexicon is frozen at the seed state
    // and never receives further evolution — so it stays preserved as a
    // reference. Subsequent generations evolve the two daughters.
    // We do this regardless of minGenerationsBetweenSplits / maxLeaves
    // because it's the canonical "start" of the tree, not an ordinary
    // speciation. When tree mode is off we skip this so a single-language
    // run stays single.
    if (state.generation === 0 && config.modes.tree) {
      // Bootstrap split draws from a wider distribution than later
      // speciations — 2–4 daughters is normal, 5–7 rare, 8 exceedingly
      // rare. Proto-communities historically fragment into more than
      // two lineages at the first dispersal (Proto-Bantu → 3-4,
      // Proto-Austronesian → many more). See `pickFirstSplitChildCount`.
      const childCount = pickFirstSplitChildCount(rng);
      splitLeaf(state.tree, state.rootId, nextGen, rng, { childCount });
    }

    const leaves = leafIds(state.tree);
    for (const leafId of leaves) {
      const lang = state.tree[leafId]!.language;
      if (lang.extinct) continue;
      // Population dynamics: Malthusian logistic growth toward the
      // tier-determined carrying capacity, plus multiplicative noise.
      //   dlog(N)/dt ≈ r·(1 - N/K) + ε
      // r = 0.012 / gen — calibrated so that a freshly-split daughter
      // can recover toward its tier cap inside ~600 generations
      // (slower and splits dilute populations to the floor faster
      // than they regrow, which kept tier advancement starved).
      // K = populationCap(tier). The tier-determined cap creates a
      // feedback loop: tier 0 → ~6k, advance to tier 1 → cap jumps
      // to 100k → population grows → triggers further tier advances.
      if (lang.speakers !== undefined) {
        const tier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
        const cap = populationCap(tier);
        const malthusian = 0.012 * (1 - lang.speakers / cap);
        const noise = (rng.next() - 0.5) * 0.04;
        const drift = Math.exp(malthusian + noise);
        lang.speakers = Math.max(50, Math.round(lang.speakers * drift));
      }
      // Migration. Each alive community drifts on the map at a slow
      // rate — real language groups don't stay at the exact point
      // where they diverged, they spread. Step size scales down with
      // population (big populations are more anchored) and with
      // generation depth (fine-grained late drift vs bold early
      // dispersals). Independent of phylogenetic distance so sisters
      // can grow apart or draw closer.
      if (lang.coords) {
        const pop = lang.speakers ?? 10000;
        const anchorFactor = Math.min(1, 10000 / Math.max(100, pop));
        const step = 1.2 * anchorFactor;
        const dx = (rng.next() - 0.5) * 2 * step;
        const dy = (rng.next() - 0.5) * 2 * step;
        lang.coords = { x: lang.coords.x + dx, y: lang.coords.y + dy };
      }
      // Cultural-tier advancement. Checked every 20 generations to
      // keep the cost negligible — age pressure accumulates slowly
      // so there's no benefit to firing this every gen.
      if (nextGen % 20 === 0) {
        const priorTier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
        const nextTier = computeTierCandidate(lang, state.tree, nextGen, rng);
        if (nextTier > priorTier) {
          lang.culturalTier = nextTier;
          pushEvent(lang, {
            generation: nextGen,
            kind: "grammar_shift",
            description: `cultural tier: ${TIER_LABELS[priorTier]} → ${TIER_LABELS[nextTier]}`,
          });
          // Foraging → agricultural transition: kinship terms
          // collapse as households centralise (the
          // ethnographic shift from band-classifictory to
          // descriptive kinship). Only fires on the 0 → 1 step.
          if (priorTier === 0 && nextTier >= 1) {
            const merges = applyKinshipSimplification(lang, rng, 2);
            for (const m of merges) {
              pushEvent(lang, {
                generation: nextGen,
                kind: "semantic_drift",
                description: `kinship merge (urbanisation): "${m.winner}" absorbs "${m.loser}"`,
              });
            }
          }
        }
        // Refresh the capacity target every 20 gens too so it tracks
        // the slowly-advancing tier + growing age + drifting speakers.
        lang.lexicalCapacity = lexicalCapacity(lang, nextGen);
      }
      if (config.modes.phonology) stepPhonology(lang, config, rng, nextGen, state);
      // Obsolescence runs BEFORE genesis so freshly-coined words are never
      // retired in the same step they were born in.
      stepObsolescence(lang, config, rng, nextGen);
      stepTaboo(lang, config, rng, nextGen);
      if (config.modes.genesis) {
        stepGenesis(lang, config, state, rng, nextGen);
        bootstrapNeologismNeighbors(lang);
      }
      if (config.modes.grammar) {
        stepGrammar(lang, config, rng, nextGen);
        stepMorphology(lang, config, rng, nextGen);
      }
      if (config.modes.semantics) stepSemantics(lang, config, rng, nextGen);
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

  return {
    getState: () => state,
    getConfig: () => config,
    step,
    reset: () => {
      state = buildInitialState(config);
    },
    restoreState: (snapshot) => {
      state = {
        generation: snapshot.generation,
        rootId: snapshot.rootId,
        rngState: snapshot.rngState,
        tree: JSON.parse(JSON.stringify(snapshot.tree)),
      };
    },
  };
}

export function replay(config: SimulationConfig, generations: number): SimulationState {
  const sim = createSimulation(config);
  for (let i = 0; i < generations; i++) sim.step();
  return sim.getState();
}

export type { Rng };
