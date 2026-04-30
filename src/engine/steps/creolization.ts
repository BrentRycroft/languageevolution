import type { Language, SimulationConfig, SimulationState } from "../types";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { leafIds } from "../tree/leafIds";
import { arealShareAffinity } from "../geo/territory";
import { getWorldMap } from "../geo/map";

const PER_GEN_PROBABILITY = 0.0005;

const MIN_ADJACENCY = 0.4;

export function stepCreolization(
  state: SimulationState,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  if (!rng.chance(PER_GEN_PROBABILITY)) return;
  const aliveIds = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );
  if (aliveIds.length < 2) return;
  const worldMap = getWorldMap(config.mapMode ?? "random", config.seed);

  let bestPair: [Language, Language] | null = null;
  let bestAffinity = MIN_ADJACENCY;
  for (let i = 0; i < aliveIds.length; i++) {
    const a = state.tree[aliveIds[i]!]!.language;
    if (!a.territory) continue;
    for (let j = i + 1; j < aliveIds.length; j++) {
      const b = state.tree[aliveIds[j]!]!.language;
      if (!b.territory) continue;
      const aff = arealShareAffinity(worldMap, a, b);
      if (aff > bestAffinity) {
        bestAffinity = aff;
        bestPair = [a, b];
      }
    }
  }
  if (!bestPair) return;

  const [a, b] = bestPair;
  const aSize = a.speakers ?? a.territory?.cells.length ?? 1;
  const bSize = b.speakers ?? b.territory?.cells.length ?? 1;
  const lexifier = aSize >= bSize ? a : b;
  const substrate = lexifier === a ? b : a;

  const survivors: ReadonlySet<string> = new Set(["noun.num.pl", "verb.tense.past"]);
  const paradigms = substrate.morphology.paradigms as Record<string, unknown>;
  const before = Object.keys(paradigms).length;
  for (const cat of Object.keys(paradigms)) {
    if (!survivors.has(cat)) delete paradigms[cat];
  }
  const after = Object.keys(paradigms).length;

  substrate.grammar = {
    ...substrate.grammar,
    hasCase: false,
    caseStrategy: "preposition",
    articlePresence: "free",
    synthesisIndex: 1.0,
    fusionIndex: 0.1,
  };

  let borrowed = 0;
  const lexifierMeanings = Object.keys(lexifier.lexicon);
  for (const m of lexifierMeanings) {
    if (!rng.chance(0.3)) continue;
    substrate.lexicon[m] = lexifier.lexicon[m]!.slice();
    substrate.wordOrigin[m] = `borrow:${lexifier.name}`;
    borrowed++;
  }

  pushEvent(substrate, {
    generation,
    kind: "borrow",
    description: `creolization with ${lexifier.name}: morphology pruned ${before}→${after} paradigms, ${borrowed} loanwords absorbed`,
  });
  pushEvent(lexifier, {
    generation,
    kind: "borrow",
    description: `served as lexifier in ${substrate.name}'s creolization event`,
  });
}
