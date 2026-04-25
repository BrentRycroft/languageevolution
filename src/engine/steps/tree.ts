import type { Language, SimulationConfig, SimulationState, LanguageTree } from "../types";
import { leafIds, splitLeaf } from "../tree/split";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { releaseTerritory } from "../geo/territory";
import { getWorldMap } from "../geo/map";
import { realismMultiplier } from "../phonology/rate";

export function stepTreeSplit(
  state: SimulationState,
  leafId: string,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
): void {
  const age = state.generation - lang.birthGeneration;
  if (age < config.tree.minGenerationsBetweenSplits) return;
  const aliveLeaves = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );
  // Soft cap. When unlimitedLeaves is on, no attenuation. Otherwise
  // the split probability is multiplied by a logistic falloff that
  // stays near 1 below the configured `maxLeaves` and drops off past
  // it — a language can still speciate above the "cap" but it gets
  // rarer the fuller the tree is. A user who wants a truly uncapped
  // tree flips `unlimitedLeaves`; the cap is now just a centre of
  // pressure, not a wall.
  const capPressure = config.tree.unlimitedLeaves
    ? 1
    : capSoftness(aliveLeaves.length, config.tree.maxLeaves);
  const p = config.tree.splitProbabilityPerGeneration * capPressure * realismMultiplier(config);
  if (rng.chance(p)) {
    splitLeaf(state.tree, leafId, state.generation + 1, rng, {
      worldMap: getWorldMap(config.mapMode ?? "random", config.seed),
    });
  }
}

/**
 * Logistic falloff for population caps. Returns ~1 when `alive` is
 * below `cap`, passes through 0.5 at `alive = cap`, and approaches 0
 * as the tree grows further past the cap. Width of the transition
 * band is roughly cap/6 so the cap stays meaningful but never hard.
 */
function capSoftness(alive: number, cap: number): number {
  const c = Math.max(1, cap);
  const width = Math.max(1, c / 6);
  return 1 / (1 + Math.exp((alive - c) / width));
}

/**
 * Tree distance (path length) between two leaves: the sum of their
 * depths minus twice the depth of their lowest common ancestor. Two
 * sisters sharing a parent have distance 2; first cousins have 4;
 * etc. Used to compute phylogenetic distinctness — how isolated a
 * leaf is in the surviving tree.
 */
function leafDistance(tree: LanguageTree, a: string, b: string): number {
  if (a === b) return 0;
  const pathA: string[] = [];
  let cur: string | null = a;
  while (cur) {
    pathA.push(cur);
    cur = tree[cur]?.parentId ?? null;
  }
  const depthOf = (id: string): number => {
    for (let i = 0; i < pathA.length; i++) if (pathA[i] === id) return i;
    return -1;
  };
  // Walk up from b; the first id that appears in pathA is the LCA.
  let depthB = 0;
  let curB: string | null = b;
  while (curB) {
    const d = depthOf(curB);
    if (d >= 0) return d + depthB;
    curB = tree[curB]?.parentId ?? null;
    depthB++;
  }
  return Infinity;
}

/**
 * Closeness factor for a leaf: 1 + number of *close* alive cousins
 * (distance ≤ 4, i.e. within the leaf's great-grandparent subtree).
 * Leaves with many close cousins sit in an over-represented lineage
 * and are likelier to die; isolated leaves are protected. Scaled
 * against `1 / cohortMean` so the overall death rate budget stays
 * constant — we only redistribute pressure toward redundant lineages,
 * not inflate it.
 */
function closenessFactor(
  state: SimulationState,
  leafId: string,
  aliveLeaves: readonly string[],
): number {
  let closeCount = 0;
  for (const other of aliveLeaves) {
    if (other === leafId) continue;
    const d = leafDistance(state.tree, leafId, other);
    if (d <= 4) closeCount++;
  }
  return 1 + closeCount;
}

export function stepDeath(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
): void {
  const aliveLeaves = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );
  if (aliveLeaves.length <= 1) return;
  const age = state.generation - lang.birthGeneration;
  if (age < config.tree.minGenerationsBeforeDeath) return;
  // Soft-cap death pressure. Below the configured `maxLeaves` the
  // multiplier is ~1 (so death fires at the configured baseline);
  // above the cap it ramps up smoothly, pulling the tree back toward
  // its target size without ever making death a certainty. With
  // unlimitedLeaves on, pressure stays at 1.
  const pressure = config.tree.unlimitedLeaves
    ? 1
    : 1 + Math.max(0, aliveLeaves.length - config.tree.maxLeaves) / Math.max(1, config.tree.maxLeaves / 3);

  // Phylogenetic-distinctness weighting. A leaf with many close
  // cousins is more likely to go extinct — its niche is redundant.
  // An isolated branch (Albanian / Armenian / Greek-style deep
  // relict) is protected. We normalise by the cohort average so the
  // overall death-rate budget doesn't change; we only redistribute it
  // toward over-represented lineages. Without this redistribution the
  // survivors tended to cluster in one or two sibling-rich subgroups,
  // whereas real families preserve diverse deep branches.
  const myCloseness = closenessFactor(state, lang.id, aliveLeaves);
  let meanCloseness = 0;
  for (const id of aliveLeaves) {
    meanCloseness += closenessFactor(state, id, aliveLeaves);
  }
  meanCloseness = Math.max(1, meanCloseness / aliveLeaves.length);
  const diversityMult = myCloseness / meanCloseness;

  const p =
    config.tree.deathProbabilityPerGeneration * pressure * diversityMult;
  if (rng.chance(p)) {
    lang.extinct = true;
    lang.deathGeneration = state.generation + 1;
    // Free the language's territory so neighbouring alive sisters
    // can absorb it via normal growth next gen.
    releaseTerritory(lang);
    pushEvent(lang, {
      generation: state.generation + 1,
      kind: "sound_change",
      description: "language went extinct",
    });
  }
}
