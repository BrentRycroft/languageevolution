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

function capSoftness(alive: number, cap: number): number {
  const c = Math.max(1, cap);
  const width = Math.max(1, c / 6);
  return 1 / (1 + Math.exp((alive - c) / width));
}

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

export function precomputeClosenessVector(
  state: SimulationState,
  aliveLeaves: readonly string[],
): Map<string, number> {
  const out = new Map<string, number>();
  let total = 0;
  for (const id of aliveLeaves) {
    const c = closenessFactor(state, id, aliveLeaves);
    out.set(id, c);
    total += c;
  }
  const mean = aliveLeaves.length > 0 ? Math.max(1, total / aliveLeaves.length) : 1;
  out.set("__mean__", mean);
  return out;
}

export function stepDeath(
  state: SimulationState,
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  closenessCache?: Map<string, number>,
): void {
  const aliveLeaves = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );
  if (aliveLeaves.length <= 1) return;
  const age = state.generation - lang.birthGeneration;
  if (age < config.tree.minGenerationsBeforeDeath) return;
  const pressure = config.tree.unlimitedLeaves
    ? 1
    : 1 + Math.max(0, aliveLeaves.length - config.tree.maxLeaves) / Math.max(1, config.tree.maxLeaves / 3);

  let myCloseness: number;
  let meanCloseness: number;
  if (closenessCache) {
    myCloseness = closenessCache.get(lang.id) ?? closenessFactor(state, lang.id, aliveLeaves);
    meanCloseness = closenessCache.get("__mean__") ?? 1;
  } else {
    myCloseness = closenessFactor(state, lang.id, aliveLeaves);
    let total = 0;
    for (const id of aliveLeaves) {
      total += closenessFactor(state, id, aliveLeaves);
    }
    meanCloseness = Math.max(1, total / aliveLeaves.length);
  }
  const diversityMult = myCloseness / meanCloseness;

  const p =
    config.tree.deathProbabilityPerGeneration * pressure * diversityMult;
  if (rng.chance(p)) {
    lang.extinct = true;
    lang.deathGeneration = state.generation + 1;
    releaseTerritory(lang);
    pushEvent(lang, {
      generation: state.generation + 1,
      kind: "sound_change",
      description: "language went extinct",
    });
  }
}
