import type { SimulationConfig, SimulationState } from "./types";
import { leafIds, pickFirstSplitChildCount, splitLeaf } from "./tree/split";
import { makeRng, type Rng } from "./rng";
import { buildInitialState } from "./steps/init";
import { stepPhonology, stepArealWaves } from "./steps/phonology";
import { validateConfig, summarizeValidation } from "./configValidation";
import { stepGenesis, bootstrapNeologismNeighbors } from "./steps/genesis";
import { stepVolatility, triggerVolatilityUpheaval } from "./steps/volatility";
import { stepInventoryManagement } from "./steps/inventoryManagement";
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
import { tickTerritory, reabsorbExtinctTerritory } from "./geo/territory";

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
   * Generation step ordering. Each entry below documents WHY that step
   * runs at that point — the order is load-bearing.
   *
   * Pre-loop:
   *   - (gen 0, tree mode) splitLeaf the proto into N daughters via
   *     pickFirstSplitChildCount. Sets up the initial language family.
   *
   * Per leaf, in order:
   *   1. speaker drift              — Malthusian population update.
   *      Runs first because death-pressure later in the step uses the
   *      fresh speaker count.
   *   2. tickTerritory              — geographic spread / contact updates
   *      that downstream contact / areal-share steps depend on.
   *   3. cultural-tier hysteresis   — every 20 gens, evaluate tier
   *      promotions. Triggers volatility upheavals + kinship
   *      simplification when the tier crosses thresholds. Updates
   *      lexicalCapacity for genesis.
   *   4. stepVolatility             — tick the volatility regime so the
   *      multiplier is fresh before phonology consumes it.
   *   5. stepPhonology              — apply active sound-change rules
   *      to the lexicon. Includes the Phase 27.1 novel-phoneme revert
   *      and the regular-change-with-snapshot path.
   *   6. stepLearner                — markedness reduction +
   *      coda-simplification by child learners. Runs after phonology
   *      so learners react to the post-rule lexicon.
   *   7. stepInventoryManagement    — Phase 28a fold of the former
   *      stepPhonotacticRepair + stepInventoryHomeostasis. Repairs
   *      forms that violate the syllable profile, then prunes
   *      phonemes when over the tier-target inventory size.
   *   8. stepObsolescence           — retire near-homophone rivals.
   *      Runs after the inventory has stabilised; mergers from #7 may
   *      have produced new rivalries.
   *   9. stepCopulaErosion / stepCopulaGenesis — copula lifecycle.
   *  10. stepTaboo                  — taboo replacement.
   *  11. stepGenesis                — coin / borrow / derive new words.
   *      (Genesis runs after phonology on purpose: a word coined this
   *      generation should NOT be eroded by phonology this step. New
   *      words land in the next generation's lexicon.)
   *      Also bootstrapNeologismNeighbors for the new entries.
   *  12. stepGrammar / stepMorphology — drift typology + paradigms.
   *      Runs after genesis so new derived/inflected forms can feed
   *      back into next-gen patterns.
   *  13. stepSemantics              — drift, recarve, bleach.
   *  14. stepContact                — borrowing from neighbors.
   *  15. stepArealTypology          — areal pressure recomputation.
   *  16. stepTreeSplit              — possibly split this leaf into
   *      daughters. Decided after all per-leaf evolution is done.
   *  17. stepDeath                  — only if still a leaf (didn't just
   *      split). Soft-cap-aware death pressure using generationsOverCap.
   *
   * Post-loop:
   *   - stepArealWaves              — propagate any waves enqueued by
   *     individual leaves' contact steps.
   *   - stepCreolization (tree mode) — possibly merge contacting
   *     languages.
   *   - generationsOverCap update   — feeds next gen's death pressure.
   */
  const step = (): void => {
    const rng = makeRng(state.rngState);
    const nextGen = state.generation + 1;
    // Phase 29 Tranche 6f: hoist the worldMap fetch out of the per-leaf
    // loop. getWorldMap is cached internally but the call still does
    // hash work; we only need it once per generation regardless.
    const worldMap = getWorldMap(config.mapMode ?? "random", config.seed);

    if (state.generation === 0 && config.modes.tree) {
      const childCount = pickFirstSplitChildCount(rng);
      splitLeaf(state.tree, state.rootId, nextGen, rng, {
        childCount,
        worldMap,
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
            kind: "tier_transition",
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
                kind: "kinship_simplification",
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
      // Phase 29 Tranche 3b: gated on `modes.volatility`; default true.
      if (config.modes.volatility) stepVolatility(lang, nextGen, rng);
      if (config.modes.phonology) stepPhonology(lang, config, rng, nextGen, state);
      if (config.modes.phonology && config.modes.learner) stepLearner(lang, config, rng, nextGen);
      if (config.modes.phonology) stepInventoryManagement(lang, rng, nextGen);
      if (config.modes.obsolescence) stepObsolescence(lang, config, rng, nextGen);
      if (config.modes.copula) {
        stepCopulaErosion(lang, config, rng, nextGen);
        stepCopulaGenesis(lang, config, rng, nextGen);
      }
      if (config.modes.taboo) stepTaboo(lang, config, rng, nextGen);
      if (config.modes.genesis) {
        stepGenesis(lang, config, state, rng, nextGen);
        bootstrapNeologismNeighbors(lang);
      }
      if (config.modes.grammar) {
        stepGrammar(lang, config, rng, nextGen);
        stepMorphology(lang, config, rng, nextGen);
      }
      if (config.modes.semantics) stepSemantics(lang, config, rng, nextGen);
      if (config.modes.contact) stepContact(state, lang, config, rng, nextGen);
      if (config.modes.areal) stepArealTypology(state, lang, rng, nextGen);
      if (config.modes.tree) stepTreeSplit(state, leafId, lang, config, rng);
      const stillLeaf = (state.tree[leafId]?.childrenIds.length ?? 0) === 0;
      if (config.modes.death && stillLeaf) stepDeath(state, lang, config, rng, closenessCache);
    }
    if (config.modes.areal) stepArealWaves(state, nextGen, rng);
    if (config.modes.tree && config.modes.creolization) {
      stepCreolization(state, config, rng, nextGen);
    }
    // Phase 29 Tranche 4l: redistribute extinct languages' lingering
    // territory to bordering living neighbours so dead patches don't
    // stay orphaned forever.
    reabsorbExtinctTerritory(state.tree, worldMap, rng);
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
