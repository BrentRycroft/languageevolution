import type { Meaning } from "../types";
import type { POS } from "./pos";
import { posOf as ccPosOf, isClosedClass } from "./pos";
import { bakedPosOf } from "./posTable";
import { rankOf, MAX_RANK } from "../semantics/corpusRank";
import { EMBED_TABLE } from "../semantics/embeddingData";
import { ANCHOR_EXTRA_TABLE } from "../semantics/anchorExtrasData";
import { fnv1a } from "../rng";

/**
 * conceptRegistry.ts — the fully-continuous meaning inventory (G1).
 *
 * The meaning set is DERIVED from the baked embedding/corpus data rather than the
 * retired hand-curated list (basic240 + expanded_concepts):
 *   - CONCEPT_IDS : the embedding vocabulary (EMBED_TABLE ∪ ANCHOR_EXTRA_TABLE), filtered.
 *   - posOf       : pos.ts closed-class override → baked WordNet POS → pos.ts open-class
 *                   fallback. (50-dim GloVe can't give POS, so POS is a baked tagged-lexicon
 *                   table; closed-class function words stay precise via the override.)
 *   - tierOf      : corpus-rank percentile coreness bands (top decile → tier 0 … → tier 3),
 *                   replacing cultural-era hand-assignment.
 *   - zipfFrequencyFor : Zipfian-by-tier seed frequency (unchanged formula; tier is now derived).
 *
 * This is the LEAF of the concept layer: it imports only baked data + pos.ts, never the
 * geometry (anchors/clusters/embeddings), so the geometry can build ON it without a cycle.
 * cluster + colex are GEOMETRIC and composed one layer up, in the concepts.ts façade.
 */

export type Tier = 0 | 1 | 2 | 3;

/** POS: closed-class override (precise) → baked open-class (WordNet) → pos.ts fallback. */
export function posOf(m: Meaning): POS {
  const cc = ccPosOf(m);
  if (isClosedClass(cc)) return cc; // articles/prep/conj/pronoun/aux… stay precise
  const baked = bakedPosOf(m);
  return baked && baked !== "propn" ? baked : cc; // cc falls back to core hand POS or "other"
}

// Meaning set: the embedding vocabulary, filtered (drop proper nouns — none expected in the
// lowercased GloVe common-word vocabulary, but the rule is explicit/rule-based, no hand list).
function deriveConceptIds(): Meaning[] {
  const keys = new Set<Meaning>([...Object.keys(EMBED_TABLE), ...Object.keys(ANCHOR_EXTRA_TABLE)]);
  const out: Meaning[] = [];
  for (const m of keys) {
    if (bakedPosOf(m) === "propn") continue;
    out.push(m);
  }
  return out.sort();
}

export const CONCEPT_IDS: readonly Meaning[] = Object.freeze(deriveConceptIds());
const ID_SET = new Set(CONCEPT_IDS);
export function isRegisteredConcept(m: Meaning): boolean {
  return ID_SET.has(m);
}

// Tier: corpus-rank percentile coreness bands (top decile → 0 … bottom 30% → 3).
const tierCache = new Map<Meaning, Tier>();
export function tierOf(m: Meaning): Tier {
  let t = tierCache.get(m);
  if (t === undefined) {
    const pct = rankOf(m) / Math.max(1, MAX_RANK);
    t = pct < 0.1 ? 0 : pct < 0.35 ? 1 : pct < 0.7 ? 2 : 3;
    tierCache.set(m, t);
  }
  return t;
}

export function conceptsAtOrBelow(tier: Tier): readonly Meaning[] {
  return CONCEPT_IDS.filter((m) => tierOf(m) <= tier);
}

/** Phase 6a: Zipfian seed frequency by tier (forager-core → modern-rare); tier now derived. */
const TIER_BASE_FREQ: Record<Tier, number> = { 0: 0.88, 1: 0.58, 2: 0.36, 3: 0.2 };
export function zipfFrequencyFor(m: Meaning): number {
  const base = TIER_BASE_FREQ[tierOf(m)];
  const jitter = ((fnv1a(m) % 1000) / 1000 - 0.5) * 0.18; // ±0.09 continuous spread
  return Math.max(0.08, Math.min(0.93, base + jitter));
}
