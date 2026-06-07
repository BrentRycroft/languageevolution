import type { Language, Meaning } from "../types";
import { satGet, satSet } from "../lexicon/satellites";
import type { Rng } from "../rng";
import { colexWith, isRegisteredConcept } from "../lexicon/concepts";
import { isFormLegal } from "../phonology/wordShape";
import { recordOneSidedColexification } from "./colexification";
import { deleteMeaning, setLexiconForm } from "../lexicon/mutate";
import { lexGet, lexHas, lexKeys } from "../lexicon/access";

/**
 * recarve.ts
 *
 * Semantic drift, recarving (split / merge), bleaching, colexification, neighbour relations. Key exports: RecarveEventKind, RecarveEvent, maybeRecarve.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export type RecarveEventKind = "merge" | "split";

export interface RecarveEvent {
  kind: RecarveEventKind;
  loser?: Meaning;
  winner?: Meaning;
  source?: Meaning;
  newTarget?: Meaning;
}

/**
 * Evolution-realism Phase 3e: a colexified pair that just merged (or split)
 * cannot recarve again for this many generations. Without it, merge and split
 * are exact inverses on the same colexWith pair, so a single pair (cold/cool,
 * arm/hand) flip-flops merge→split→merge every few gens — a deterministic
 * oscillation, not language change. Cross-linguistically, semantic reanalysis
 * of a given pair is a rare once-off, so a long cooldown is the realistic gate.
 */
const RECARVE_COOLDOWN = 50;

/**
 * LANE-C — strength of the frequency-retention skip on mergers (see
 * tryMerge). A pair's merger is skipped with probability `loserFreq ×
 * MERGE_RETENTION_STRENGTH`, so a colexified pair whose weaker member is
 * still high-frequency (≈0.85 skip) survives, while a pair with a rare
 * loser (≈0.07 skip) merges almost freely. < 1 so a core sense can still
 * occasionally lose a merger over deep time.
 */
const MERGE_RETENTION_STRENGTH = 0.85;

function pairKey(a: Meaning, b: Meaning): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function recarvedRecently(
  lang: Language,
  a: Meaning,
  b: Meaning,
  generation: number,
): boolean {
  const last = lang.recarveHistory?.[pairKey(a, b)];
  return last !== undefined && generation - last < RECARVE_COOLDOWN;
}

function stampRecarve(lang: Language, a: Meaning, b: Meaning, generation: number): void {
  if (!lang.recarveHistory) lang.recarveHistory = {};
  lang.recarveHistory[pairKey(a, b)] = generation;
}

export function maybeRecarve(
  lang: Language,
  rng: Rng,
  probability: number,
  generation: number = 0,
): RecarveEvent | null {
  if (!rng.chance(probability)) return null;
  if (rng.chance(0.55)) {
    const merged = tryMerge(lang, rng, generation);
    if (merged) return merged;
    return trySplit(lang, rng, generation);
  }
  const split = trySplit(lang, rng, generation);
  if (split) return split;
  return tryMerge(lang, rng, generation);
}

function tryMerge(lang: Language, rng: Rng, generation: number): RecarveEvent | null {
  const meanings = lexKeys(lang).filter(isRegisteredConcept);
  const pairs: Array<readonly [Meaning, Meaning]> = [];
  const seen = new Set<string>();
  for (const a of meanings) {
    for (const b of colexWith(a)) {
      if (!lexHas(lang, b)) continue;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // Phase 3e: skip a pair that merged/split within the cooldown.
      if (recarvedRecently(lang, a, b, generation)) continue;
      pairs.push([a, b]);
    }
  }
  if (pairs.length === 0) return null;
  const [a, b] = pairs[rng.int(pairs.length)]!;
  const fa = satGet(lang, "wordFrequencyHints", a) ?? 0.4;
  const fb = satGet(lang, "wordFrequencyHints", b) ?? 0.4;
  const winner = fa > fb ? a : fa < fb ? b : a < b ? a : b;
  const loser = winner === a ? b : a;
  // LANE-C — frequency-retention on merger (Zipf / entrenchment): a
  // well-entrenched high-frequency sense resists being absorbed and erased.
  // Skip the merger with probability proportional to the LOSER's frequency,
  // so colexified pairs whose weaker member is still common stay distinct
  // (two frequent senses collapsing into one is rare), while low-frequency
  // losers merge freely. The draw is APPENDED after the pair-selection draw
  // above; it consumes the event when it fires (anti-runaway-merger).
  const loserFreq = winner === a ? fb : fa;
  if (rng.chance(loserFreq * MERGE_RETENTION_STRENGTH)) return null;
  // Phase 29 Tranche 1a: route through chokepoint so words stays in sync.
  // Phase 72d-2 (defer-1a): pass merger context so meaningHistory
  // records the pathway loser → winner. Reverse translation /
  // reconstruction can recover the loser via mergedInto.
  deleteMeaning(lang, loser, {
    mergedInto: winner,
    generation,
    reason: "semantic-merger",
  });
  if (lang.suppletion) delete lang.suppletion[loser];
  recordOneSidedColexification(lang, winner, loser);
  stampRecarve(lang, winner, loser, generation);
  return { kind: "merge", winner, loser };
}

export function applyKinshipSimplification(
  lang: Language,
  rng: Rng,
  maxEvents = 2,
  generation: number = 0,
): RecarveEvent[] {
  const out: RecarveEvent[] = [];
  const KINSHIP_PAIRS: ReadonlyArray<readonly [Meaning, Meaning]> = [
    ["mother", "aunt"],
    ["father", "uncle"],
    ["brother", "cousin"],
    ["sister", "cousin"],
    ["child", "son"],
    ["child", "baby"],
    ["friend", "neighbor"],
  ];
  for (let attempts = 0; attempts < maxEvents * 3 && out.length < maxEvents; attempts++) {
    const [a, b] = KINSHIP_PAIRS[rng.int(KINSHIP_PAIRS.length)]!;
    if (!lexHas(lang, a) || !lexHas(lang, b)) continue;
    const fa = satGet(lang, "wordFrequencyHints", a) ?? 0.4;
    const fb = satGet(lang, "wordFrequencyHints", b) ?? 0.4;
    const winner = fa >= fb ? a : b;
    const loser = winner === a ? b : a;
    // Phase 72d-2 (defer-1a): record kinship-simplification pathway.
    deleteMeaning(lang, loser, {
      mergedInto: winner,
      generation,
      reason: "kinship-simplification",
    });
    if (lang.suppletion) delete lang.suppletion[loser];
    recordOneSidedColexification(lang, winner, loser);
    out.push({ kind: "merge", winner, loser });
  }
  return out;
}

function trySplit(lang: Language, rng: Rng, generation: number): RecarveEvent | null {
  const meanings = lexKeys(lang).filter(isRegisteredConcept);
  const candidates: Array<{ source: Meaning; target: Meaning }> = [];
  for (const source of meanings) {
    for (const target of colexWith(source)) {
      if (lexHas(lang, target)) continue;
      // Phase 3e: skip a pair that merged/split within the cooldown.
      if (recarvedRecently(lang, source, target, generation)) continue;
      candidates.push({ source, target });
    }
  }
  if (candidates.length === 0) return null;
  const pick = candidates[rng.int(candidates.length)]!;
  const form = lexGet(lang, pick.source)!;
  if (!isFormLegal(pick.target, form)) return null;
  // Phase 29 Tranche 1 round 3: route through chokepoint.
  setLexiconForm(lang, pick.target, form.slice(), {
    bornGeneration: 0,
    origin: "recarve-split",
  });
  const freq = satGet(lang, "wordFrequencyHints", pick.source) ?? 0.4;
  satSet(lang, "wordFrequencyHints", pick.target, freq);
  const reg = lang.registerOf?.[pick.source];
  if (reg !== undefined) {
    if (!lang.registerOf) lang.registerOf = {};
    lang.registerOf[pick.target] = reg;
  }
  lang.wordOrigin[pick.target] = `split:${pick.source}`;
  stampRecarve(lang, pick.source, pick.target, generation);
  return { kind: "split", source: pick.source, newTarget: pick.target };
}
