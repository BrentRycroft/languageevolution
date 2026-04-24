import type { Language } from "../types";
import type { Rng } from "../rng";
import { neighborsOf } from "./neighbors";
import { relatedMeanings, clusterOf } from "./clusters";
import { nearestMeanings, embed, cosine } from "./embeddings";
import { complexityFor } from "../lexicon/complexity";
import { isFormLegal } from "../phonology/wordShape";
import { samePOS } from "../lexicon/pos";
import { corenessResistance } from "../lexicon/coreness";

export type SemanticShiftKind =
  | "metonymy"
  | "metaphor"
  | "narrowing"
  | "broadening";

export interface SemanticDrift {
  from: string;
  to: string;
  kind: SemanticShiftKind;
  /** True when the target slot already held a form; the drift displaced it. */
  takeover?: boolean;
  /**
   * True when the source meaning was retained rather than deleted, so
   * the form now carries both meanings (classic polysemy, as in
   * English "foot" of body / "foot" of mountain).
   */
  polysemous?: boolean;
}

/**
 * Classify a drift event. Richer than the original "cluster + complexity"
 * heuristic:
 *  - If the two meanings share a cluster AND their embeddings are very
 *    close (cosine > 0.6), call it metonymy — conceptually adjacent.
 *  - Otherwise use complexity delta to separate narrowing (more specific)
 *    from broadening (more general), but only when the delta is clear.
 *  - Embedding distance disambiguates the remaining cases: close meanings
 *    with equal complexity are metonymy; distant ones are metaphor.
 */
export function classifyShift(from: string, to: string): SemanticShiftKind {
  const cFrom = clusterOf(from);
  const cTo = clusterOf(to);
  const similarity = cosine(embed(from), embed(to));
  const sameCluster = cFrom && cTo && cFrom === cTo;
  const complexityDelta = complexityFor(to) - complexityFor(from);

  // Strong semantic adjacency (same cluster + high cosine) → metonymy.
  if (sameCluster && similarity >= 0.6) return "metonymy";
  // Clear complexity delta wins when the embedding is ambiguous.
  if (complexityDelta <= -1) return "narrowing";
  if (complexityDelta >= 1) return "broadening";
  // Fall back to semantic distance: close meanings are metonymy,
  // distant are metaphor.
  if (similarity >= 0.45) return "metonymy";
  return "metaphor";
}

export type NeighborOverride = Record<string, string[]>;

/**
 * Attempt one semantic drift event on the language's lexicon.
 * Picks a meaning with semantic neighbors and reassigns its current form to
 * a neighbor meaning. The old meaning is removed (the word "shifted").
 * Returns null if no applicable meaning was found.
 *
 * If `override` is provided (e.g. an LLM-populated neighbor map), it is
 * consulted before the built-in static table.
 */
export function driftOneMeaning(
  lang: Language,
  rng: Rng,
  override?: NeighborOverride,
): SemanticDrift | null {
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length === 0) return null;
  const shuffled: string[] = [];
  const used = new Set<number>();
  while (shuffled.length < meanings.length) {
    const idx = rng.int(meanings.length);
    if (used.has(idx)) continue;
    used.add(idx);
    shuffled.push(meanings[idx]!);
  }
  // Two passes: first try to drift into an EMPTY slot (the clean case),
  // then allow crowded drift where the target already has a form (the
  // new form replaces the old one — a realistic "meaning-takeover").
  // Dense lexicons (like the Basic-240 expansion) rarely have empty
  // slots, so without pass 2 drift would almost never fire.
  for (const strict of [true, false]) {
    for (const m of shuffled) {
      // Register gate: high-register ("formal") words resist drift;
      // low-register words embrace it. 50% skip on high, 0% on low.
      // Default (no register tag) passes through.
      const reg = lang.registerOf?.[m];
      if (reg === "high" && rng.chance(0.5)) continue;
      // Swadesh tier: core vocabulary (water, mother, two…) resists
      // meaning shift. `corenessResistance` returns a factor in (0,1];
      // treat it as a skip probability so Swadesh-100 items drift at
      // roughly half the rate of ordinary words.
      if (rng.chance(1 - corenessResistance(m))) continue;
      const overrideNeighbors = override?.[m];
      // Preference order:
      //   1. Explicit override (AI-generated LLM neighbors if enabled).
      //   2. Embedding-space nearest meanings (cosine similarity).
      //   3. Hand-curated semantic cluster (relatedMeanings()).
      //   4. Static neighbor table (neighborsOf()).
      const embeddingNearest = nearestMeanings(m, meanings, 5);
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
      // Filter the neighbour list to keep only POS-compatible
      // targets. Without this, a form for "water" (noun) could drift
      // into the "drink" (verb) slot — semantically adjacent but
      // part-of-speech-crossing, which real languages basically
      // never do without an intermediate derivation step.
      const posCompatible = neighbors.filter((n) => samePOS(m, n));
      const pool = posCompatible.length > 0 ? posCompatible : neighbors;
      const target = pool[rng.int(pool.length)]!;
      if (target === m) continue;
      const targetOccupied = !!lang.lexicon[target];
      if (strict && targetOccupied) continue;
      const form = lang.lexicon[m]!;
      // Word-shape gate: a form that's legal for `m` (e.g. a length-1
      // vowel on the pronoun "i") may be illegal for `target` (any
      // content word). Skip the drift in that case — a subsequent
      // generation with a longer form is free to carry it over.
      if (!isFormLegal(target, form)) continue;
      const kind = classifyShift(m, target);
      // Polysemy: with some probability, the source meaning is NOT
      // deleted — the form acquires the new meaning alongside the
      // old one (English "foot" / "foot of mountain"; "mouth" /
      // "mouth of river"; Spanish "pierna" / "pierna de mesa"). We
      // only allow this for metaphor and metonymy — narrowing and
      // broadening are by definition replacements, not parallel
      // senses. Takeover drifts (already-occupied target) also
      // skip polysemy because we want a clean winner there.
      const polysemous =
        !targetOccupied &&
        (kind === "metaphor" || kind === "metonymy") &&
        rng.chance(0.3);
      lang.lexicon[target] = form;
      // Transfer frequency + register from the old slot so the new
      // incarnation keeps its usage profile. Without this, a takeover
      // silently reset the word's frequency hint to default. For
      // polysemy, *copy* rather than *move* so both senses retain it.
      const oldFreq = lang.wordFrequencyHints[m];
      if (oldFreq !== undefined) {
        lang.wordFrequencyHints[target] = oldFreq;
      }
      if (!polysemous) delete lang.wordFrequencyHints[m];
      if (lang.registerOf?.[m] !== undefined) {
        lang.registerOf[target] = lang.registerOf[m]!;
      }
      if (!polysemous && lang.registerOf?.[m] !== undefined) delete lang.registerOf[m];
      // Clean the remaining auxiliary maps so the old meaning leaves no
      // orphans. wordOrigin and lastChangeGeneration are preserved on the
      // target if not already set — the takeover inherits the form's
      // age-grading + origin so age-sensitive change rates are correct.
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
