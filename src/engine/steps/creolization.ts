import type { Language, SimulationConfig, SimulationState } from "../types";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { leafIds } from "../tree/leafIds";
import { arealShareAffinity } from "../geo/territory";
import { getWorldMap } from "../geo/map";

/**
 * Per-generation chance that *some* pair of adjacent alive leaves
 * undergoes a creolization event. Calibrated so that — at the
 * default 25 yr/gen — a 5-10 leaf tree sees roughly one
 * creolization per 5-10 ky, matching the attested rarity of pidgin /
 * creole birth events in the historical record (Romance creoles, the
 * Atlantic plantation creoles, Tok Pisin, Sango, …).
 */
const PER_GEN_PROBABILITY = 0.0005;

/**
 * Minimum areal-share affinity (cell-edge overlap) required for a
 * pair of leaves to be candidates. Without close territorial
 * contact, the historical conditions for creolization (intense
 * sustained multilingualism in a shared community) don't apply.
 */
const MIN_ADJACENCY = 0.4;

/**
 * Creolization event: rare, dramatic restructuring of one of two
 * adjacent leaves. The "recipient" language (smaller speakers, smaller
 * territory) takes on a heavily simplified analytical profile and
 * borrows ~30% of its open-class vocabulary from the "lexifier"
 * (larger neighbour). Both languages keep evolving normally
 * afterward — the creole's profile just suddenly shifted.
 *
 * Models the cross-linguistic pattern where a substrate community
 * acquires the lexifier's lexicon under contact pressure but reduces
 * its morphology to near-isolating (Tok Pisin, Haitian Creole,
 * Réunion Creole). We keep the tree topology intact (no new nodes,
 * no extinction) — this is a profile shift, logged via events.
 */
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

  // Find the most-adjacent pair across all alive leaves. Stops at
  // the first pair above MIN_ADJACENCY for cheapness — the common
  // case is one adjacency-cluster per region.
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

  // Pick lexifier (larger speaker base) and substrate.
  const [a, b] = bestPair;
  const aSize = a.speakers ?? a.territory?.cells.length ?? 1;
  const bSize = b.speakers ?? b.territory?.cells.length ?? 1;
  const lexifier = aSize >= bSize ? a : b;
  const substrate = lexifier === a ? b : a;

  // 1. Drastic morphology simplification — drop case + most paradigms,
  //    keep only plural and a single tense.
  const survivors = ["noun.num.pl", "verb.tense.past"] as const;
  const before = Object.keys(substrate.morphology.paradigms).length;
  for (const cat of Object.keys(substrate.morphology.paradigms)) {
    if (!survivors.includes(cat as never)) {
      delete substrate.morphology.paradigms[cat as never];
    }
  }
  const after = Object.keys(substrate.morphology.paradigms).length;

  // 2. Grammar profile shift toward analytical.
  substrate.grammar = {
    ...substrate.grammar,
    hasCase: false,
    caseStrategy: "preposition",
    articlePresence: "free",
    synthesisIndex: 1.0,
    fusionIndex: 0.1,
  };

  // 3. Heavy lexical borrowing — copy ~30% of the lexifier's
  //    open-class lexicon over substrate's slot for those meanings.
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
