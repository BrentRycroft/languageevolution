import type { Language } from "../types";
import type { Rng } from "../rng";
import { neighborsOf } from "./neighbors";
import { relatedMeanings, clusterOf } from "./clusters";
import { nearestMeanings, embed, cosine } from "./embeddings";
import { complexityFor } from "../lexicon/complexity";
import { isFormLegal } from "../phonology/wordShape";
import { samePOS } from "../lexicon/pos";
import { corenessResistance } from "../lexicon/coreness";
import { CONCEPT_IDS, tierOf, type Tier } from "../lexicon/concepts";
import { BASIC_240 } from "../lexicon/basic240";

const EXPANSION_IDS_BY_TIER: ReadonlyMap<Tier, readonly string[]> = (() => {
  const basicSet = new Set<string>(BASIC_240);
  const buckets: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const id of CONCEPT_IDS) {
    if (basicSet.has(id)) continue;
    const t = tierOf(id);
    buckets[t]!.push(id);
  }
  const m = new Map<Tier, readonly string[]>();
  m.set(0, Object.freeze([...buckets[0]!]));
  m.set(
    1 as Tier,
    Object.freeze([...buckets[0]!, ...buckets[1]!]),
  );
  m.set(
    2 as Tier,
    Object.freeze([...buckets[0]!, ...buckets[1]!, ...buckets[2]!]),
  );
  m.set(
    3 as Tier,
    Object.freeze([
      ...buckets[0]!,
      ...buckets[1]!,
      ...buckets[2]!,
      ...buckets[3]!,
    ]),
  );
  return m;
})();

export type SemanticShiftKind =
  | "metonymy"
  | "metaphor"
  | "narrowing"
  | "broadening";

export interface SemanticDrift {
  from: string;
  to: string;
  kind: SemanticShiftKind;
  takeover?: boolean;
  polysemous?: boolean;
}

export function classifyShift(from: string, to: string): SemanticShiftKind {
  const cFrom = clusterOf(from);
  const cTo = clusterOf(to);
  const similarity = cosine(embed(from), embed(to));
  const sameCluster = cFrom && cTo && cFrom === cTo;
  const complexityDelta = complexityFor(to) - complexityFor(from);

  if (sameCluster && similarity >= 0.6) return "metonymy";
  if (complexityDelta <= -1) return "narrowing";
  if (complexityDelta >= 1) return "broadening";
  if (similarity >= 0.45) return "metonymy";
  return "metaphor";
}

export type NeighborOverride = Record<string, string[]>;

export function driftOneMeaning(
  lang: Language,
  rng: Rng,
  override?: NeighborOverride,
): SemanticDrift | null {
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length === 0) return null;
  const shuffled = meanings.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  for (const strict of [true, false]) {
    for (const m of shuffled) {
      const reg = lang.registerOf?.[m];
      if (reg === "high" && rng.chance(0.5)) continue;
      if (rng.chance(1 - corenessResistance(m))) continue;
      const overrideNeighbors = override?.[m];
      const langTier = (lang.culturalTier ?? 0) as Tier;
      const expansionExtras = EXPANSION_IDS_BY_TIER.get(langTier) ?? [];
      const candidates =
        expansionExtras.length === 0
          ? meanings
          : Array.from(new Set([...meanings, ...expansionExtras]));
      const embeddingNearest = nearestMeanings(m, candidates, 5);
      const related = relatedMeanings(m);
      const neighbors =
        overrideNeighbors && overrideNeighbors.length > 0
          ? overrideNeighbors
          : embeddingNearest.length > 0
            ? embeddingNearest
            : related.length > 0
              ? related
              : neighborsOf(m);
      if (neighbors.length === 0) continue;
      const posCompatible = neighbors.filter((n) => samePOS(m, n));
      const pool = posCompatible.length > 0 ? posCompatible : neighbors;
      const target = pool[rng.int(pool.length)]!;
      if (target === m) continue;
      const targetOccupied = !!lang.lexicon[target];
      if (strict && targetOccupied) continue;
      const form = lang.lexicon[m]!;
      if (!isFormLegal(target, form)) continue;
      const kind = classifyShift(m, target);
      const polysemous =
        !targetOccupied &&
        (kind === "metaphor" || kind === "metonymy") &&
        rng.chance(0.3);
      lang.lexicon[target] = form;
      const oldFreq = lang.wordFrequencyHints[m];
      if (oldFreq !== undefined) {
        lang.wordFrequencyHints[target] = oldFreq;
      }
      if (!polysemous) delete lang.wordFrequencyHints[m];
      if (lang.registerOf?.[m] !== undefined) {
        lang.registerOf[target] = lang.registerOf[m]!;
      }
      if (!polysemous && lang.registerOf?.[m] !== undefined) delete lang.registerOf[m];
      if (lang.wordOrigin[m] !== undefined && !lang.wordOrigin[target]) {
        lang.wordOrigin[target] = lang.wordOrigin[m]!;
      }
      const lastChange = lang.lastChangeGeneration[m];
      if (lastChange !== undefined && lang.lastChangeGeneration[target] === undefined) {
        lang.lastChangeGeneration[target] = lastChange;
      }
      if (!polysemous) {
        delete lang.wordOrigin[m];
        delete lang.localNeighbors[m];
        delete lang.lastChangeGeneration[m];
        delete lang.lexicon[m];
      }
      return {
        from: m,
        to: target,
        kind,
        takeover: targetOccupied,
        polysemous: polysemous || undefined,
      };
    }
  }
  return null;
}
