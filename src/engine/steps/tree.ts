import type { Language, SimulationConfig, SimulationState, LanguageTree } from "../types";
import { leafIds, splitLeaf } from "../tree/split";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { releaseTerritory, territoryFragmentation } from "../geo/territory";
import { getWorldMap } from "../geo/map";
import { realismMultiplier } from "../phonology/rate";

/**
 * tree.ts
 *
 * Per-generation step orchestrators called from simulation.ts (one file per major substep). Key exports: stepTreeSplit, precomputeClosenessVector, stepDeath.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

/**
 * Phase 72 code-review fix C14: minimum gens between endangerment-
 * level transitions. Prevents rapid cycling
 * (vigorous→endangered→moribund→extinct in a handful of gens) by
 * locking the language at a level for at least this many gens after
 * each transition. Calibrated against demographic stochasticity: a
 * single bad-pressure gen shouldn't cascade.
 */
const ENDANGERMENT_COOLDOWN = 5;

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
  // Phase 6d: tie split probability to POPULATION. Larger, growing speech
  // communities fragment into dialects → daughter languages; small or shrinking
  // ones rarely do. Scaling by population (relative to the 10k seed) ties
  // cladogenesis to demographic growth instead of a flat per-generation
  // coin-flip, cutting the wild split-timing variance (the audit's gen-22 vs
  // gen-166 for the same config). Bounded so it modulates, not dominates.
  const popFactor = Math.max(0.3, Math.min(2.5, (lang.speakers ?? 10000) / 10000));
  const worldMap = getWorldMap(config.mapMode ?? "random", config.seed);
  let p =
    config.tree.splitProbabilityPerGeneration * capPressure * realismMultiplier(config) * popFactor;
  // Province map: make cladogenesis geographically REASON-driven instead of a flat
  // coin-flip. A language whose territory has fractured into disconnected components
  // (severed by ocean or another language's land) is ripe to split along that fault;
  // a single compact blob rarely does, beyond a mild dialect-continuum pressure once
  // it sprawls. Gated on province mode so Earth/random keep their tuned RNG sequence.
  if (worldMap.kind === "province") {
    const cells = lang.territory?.cells ?? [];
    const frag = territoryFragmentation(worldMap, cells);
    const geoFactor = 0.6 + 5 * frag + Math.min(1, cells.length / 200) * 0.6;
    p *= geoFactor;
  }
  if (rng.chance(p)) {
    splitLeaf(state.tree, leafId, state.generation + 1, rng, {
      worldMap,
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
    : (() => {
        const overshoot = aliveLeaves.length - config.tree.maxLeaves;
        if (overshoot <= 0) return 1;
        const scale = Math.max(1.5, config.tree.maxLeaves / 5);
        const overCount = state.generationsOverCap ?? 0;
        return Math.min(
          400,
          Math.exp(overshoot / scale) * (1 + overCount / 8),
        );
      })()

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

  // Phase 72f T1: graduated endangerment. The same `p` value drives a
  // multi-stage decline rather than instantaneous death. At each
  // generation a stressed leaf has probability `p` of advancing one
  // step on the vigorous → endangered → moribund → extinct ladder
  // (with a 5-gen cooldown to avoid rapid cycling). Stress factors
  // include population overshoot, low diversity, and isolation.
  // The legacy `extinct: boolean` is set when the chain reaches
  // "extinct" — every read site already gates on this flag.
  const stages: Array<NonNullable<Language["endangermentLevel"]>> = [
    "vigorous",
    "endangered",
    "moribund",
    "extinct",
  ];
  const current = lang.endangermentLevel ?? "vigorous";
  const lastTransition = lang.endangermentLastTransitionGen ?? -100;
  if (rng.chance(p) && state.generation - lastTransition >= ENDANGERMENT_COOLDOWN) {
    const idx = stages.indexOf(current);
    const next = stages[Math.min(idx + 1, stages.length - 1)]!;
    if (next !== current) {
      lang.endangermentLevel = next;
      lang.endangermentLastTransitionGen = state.generation;
      if (next === "extinct") {
        lang.extinct = true;
        lang.deathGeneration = state.generation + 1;
        releaseTerritory(lang);
        pushEvent(lang, {
          generation: state.generation + 1,
          kind: "sound_change",
          description: "language went extinct",
        });
      } else {
        pushEvent(lang, {
          generation: state.generation + 1,
          kind: "sound_change",
          description: `endangerment: ${current} → ${next}`,
        });
      }
    }
  }
}

/**
 * Phase 72f T1: helper read used by phonology / grammar / morphology
 * drift to scale innovation rates by vitality. Endangered languages
 * innovate slower (fewer young speakers); moribund languages barely
 * innovate at all. Returns 1.0 for vigorous (the default), 0.6 for
 * endangered, 0.2 for moribund, and 0 for extinct (caller should
 * normally already be gated on `lang.extinct`).
 */
export function vitalityRateMultiplier(lang: Language): number {
  switch (lang.endangermentLevel) {
    case "endangered": return 0.6;
    case "moribund": return 0.2;
    case "extinct": return 0;
    case "vigorous":
    case undefined:
    default: return 1.0;
  }
}
