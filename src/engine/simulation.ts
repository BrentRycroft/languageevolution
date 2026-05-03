import type { SimulationConfig, SimulationState } from "./types";
import { leafIds, pickFirstSplitChildCount, splitLeaf } from "./tree/split";
import { makeRng, type Rng } from "./rng";
import { buildInitialState } from "./steps/init";
import { stepPhonology, stepArealWaves } from "./steps/phonology";
import { validateConfig, summarizeValidation } from "./configValidation";
import { stepGenesis, bootstrapNeologismNeighbors } from "./steps/genesis";
import { stepVolatility, triggerVolatilityUpheaval } from "./steps/volatility";
import { stepInventoryHomeostasis } from "./steps/inventoryHomeostasis";
import { stepPhonotacticRepair } from "./steps/phonotacticRepair";
import { stepGrammar, stepMorphology } from "./steps/grammar";
import { stepSemantics } from "./steps/semantics";
import { stepObsolescence } from "./steps/obsolescence";
import { stepCopulaErosion, stepCopulaGenesis } from "./steps/copula";
import { stepCreolization } from "./steps/creolization";
import { stepContact } from "./steps/contact";
import { stepTreeSplit, stepDeath, precomputeClosenessVector } from "./steps/tree";
import { stepTaboo } from "./steps/taboo";
import { stepLearner } from "./steps/learner";
import { stepArealTypology } from "./steps/arealTypology";
import {
  computeTierCandidate,
  lexicalCapacity,
  populationCap,
  applyTierHysteresis,
} from "./lexicon/tier";
import { pushEvent } from "./steps/helpers";
import { TIER_LABELS } from "./lexicon/concepts";
import { applyKinshipSimplification } from "./semantics/recarve";
import { getWorldMap } from "./geo/map";
import { tickTerritory } from "./geo/territory";

export interface Simulation {
  getState: () => SimulationState;
  getConfig: () => SimulationConfig;
  /**
   * Live-update the rate config without resetting state. Used by the
   * pause-and-adjust path in the store: structural fields (seed*, preset,
   * mapMode, yearsPerGeneration) are excluded by the caller.
   */
  setLiveConfig: (config: SimulationConfig) => void;
  step: () => void;
  reset: () => void;
  restoreState: (snapshot: SimulationState) => void;
}

export interface SimulationOptions {}

export function createSimulation(
  initialConfig: SimulationConfig,
  _options: SimulationOptions = {},
): Simulation {
  let config = initialConfig;
  const issues = validateConfig(config);
  if (issues.length > 0) {
    const msg = summarizeValidation(issues);
    if (msg) console.warn(msg);
  }
  let state: SimulationState = buildInitialState(config);

  /**
   * Step ordering inside step():
   *
   *   1. (gen 0 only) splitLeaf the proto into N daughters via
   *      pickFirstSplitChildCount.
   *   2. For each leaf:
   *      a. stepPhonology — apply active rules to the lexicon.
   *      b. stepGenesis — coin / borrow / derive new words.
   *         (Phonology runs before genesis on purpose: a word coined
   *         this generation should not be eroded by phonology in the
   *         same step. New words enter the next-generation lexicon.)
   *      c. stepGrammar / stepMorphology — drift typology + paradigms.
   *      d. stepSemantics — drift, recarve, bleach.
   *      e. stepContact — borrowing from neighbors.
   *      f. stepArealTypology — areal pressure recomputation.
   *      g. stepTreeSplit — possibly split this leaf.
   *      h. stepDeath (only if still a leaf, i.e. it didn't just split)
   *         — soft-cap-aware death pressure (uses generationsOverCap).
   *   3. stepArealWaves — propagate any waves that were enqueued.
   *   4. stepCreolization — possibly merge contacting languages.
   *   5. Recompute generationsOverCap for next gen's death pressure.
   */
  const step = (): void => {
    const rng = makeRng(state.rngState);
    const nextGen = state.generation + 1;

    if (state.generation === 0 && config.modes.tree) {
      const childCount = pickFirstSplitChildCount(rng);
      splitLeaf(state.tree, state.rootId, nextGen, rng, {
        childCount,
        worldMap: getWorldMap(config.mapMode ?? "random", config.seed),
      });
    }

    const leaves = leafIds(state.tree);
    const aliveAtStart = leaves.filter((id) => !state.tree[id]!.language.extinct);
    const closenessCache = config.modes.death
      ? precomputeClosenessVector(state, aliveAtStart)
      : undefined;
    for (const leafId of leaves) {
      const lang = state.tree[leafId]!.language;
      if (lang.extinct) continue;
      if (lang.speakers !== undefined) {
        const tier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
        const cap = populationCap(tier);
        const malthusian = 0.012 * (1 - lang.speakers / cap);
        const noise = (rng.next() - 0.5) * 0.04;
        const drift = Math.exp(malthusian + noise);
        lang.speakers = Math.max(50, Math.round(lang.speakers * drift));
      }
      const worldMap = getWorldMap(config.mapMode ?? "random", config.seed);
      tickTerritory(lang, state.tree, worldMap, rng);
      if (nextGen % 20 === 0) {
        const priorTier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
        const candidate = computeTierCandidate(lang, state.tree, nextGen, rng);
        // Hysteresis: don't promote until eligibility has held for
        // TIER_HYSTERESIS_TICKS consecutive ticks. Prevents one-off speaker
        // spikes from causing premature transitions.
        const { nextTier, nextStreak } = applyTierHysteresis(
          priorTier,
          candidate,
          lang.tierEligibilityStreak ?? 0,
        );
        lang.tierEligibilityStreak = nextStreak;
        if (nextTier > priorTier) {
          lang.culturalTier = nextTier;
          pushEvent(lang, {
            generation: nextGen,
            kind: "grammar_shift",
            description: `cultural tier: ${TIER_LABELS[priorTier]} → ${TIER_LABELS[nextTier]}`,
          });
          // Phase 25: tier transitions historically trigger phonological
          // upheavals (urbanisation, literacy, statehood reorganise the
          // dialect landscape). Seed an upheaval period.
          triggerVolatilityUpheaval(
            lang,
            nextGen,
            rng,
            `tier ${TIER_LABELS[priorTier]} → ${TIER_LABELS[nextTier]}`,
          );
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
          // Phase 20f catch-up: crossing into tier 2 unlocks abstract-noun
          // morphology, so the genesis driver gets a boost-window for
          // coining DERIVATION_TARGETS abstracts (freedom, kingdom,
          // happiness, friendship, etc.) from existing roots.
          if (priorTier < 2 && nextTier >= 2) {
            lang.vocabularyCatchUpUntil = nextGen + 30;
            pushEvent(lang, {
              generation: nextGen,
              kind: "grammar_shift",
              description: `abstract-vocabulary catch-up window opened (next 30 gens)`,
            });
          }
        }
        lang.lexicalCapacity = lexicalCapacity(lang, nextGen);
      }
      // Phase 25: tick the per-language volatility regime so its
      // multiplier is fresh before phonology / grammar steps consume it.
      stepVolatility(lang, nextGen, rng);
      if (config.modes.phonology) stepPhonology(lang, config, rng, nextGen, state);
      if (config.modes.phonology) stepLearner(lang, config, rng, nextGen);
      // Phase 27c: repair forms whose phonotactic score is heavily below
      // the language's profile (e.g. CCC onset in a strict-CV language)
      // by applying existing insertion rules until the score lifts.
      if (config.modes.phonology) stepPhonotacticRepair(lang, rng, nextGen);
      // Phase 27b: dynamic phoneme-inventory homeostasis. When inventory
      // size exceeds the per-tier target, pruning probability scales up
      // and prefers low-functional-load phonemes.
      if (config.modes.phonology) stepInventoryHomeostasis(lang, rng, nextGen);
      stepObsolescence(lang, config, rng, nextGen);
      stepCopulaErosion(lang, config, rng, nextGen);
      stepCopulaGenesis(lang, config, rng, nextGen);
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
      stepArealTypology(state, lang, rng, nextGen);
      if (config.modes.tree) stepTreeSplit(state, leafId, lang, config, rng);
      const stillLeaf = (state.tree[leafId]?.childrenIds.length ?? 0) === 0;
      if (config.modes.death && stillLeaf) stepDeath(state, lang, config, rng, closenessCache);
    }
    stepArealWaves(state, nextGen, rng);
    if (config.modes.tree) {
      stepCreolization(state, config, rng, nextGen);
    }
    const aliveAfter = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    ).length;
    const overshoot = !config.tree.unlimitedLeaves && aliveAfter > config.tree.maxLeaves;
    const nextOverCap = overshoot ? (state.generationsOverCap ?? 0) + 1 : 0;
    state = {
      ...state,
      generation: nextGen,
      rngState: rng.state(),
      generationsOverCap: nextOverCap,
    };
  };

  return {
    getState: () => state,
    getConfig: () => config,
    setLiveConfig: (next) => {
      config = next;
    },
    step,
    reset: () => {
      state = buildInitialState(config);
    },
    restoreState: (snapshot) => {
      const cloneTree =
        typeof structuredClone === "function"
          ? structuredClone(snapshot.tree)
          : (JSON.parse(JSON.stringify(snapshot.tree)) as typeof snapshot.tree);
      state = {
        generation: snapshot.generation,
        rootId: snapshot.rootId,
        rngState: snapshot.rngState,
        tree: cloneTree,
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
