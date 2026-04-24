import type { Language, Meaning } from "../types";
import type { Rng } from "../rng";
import { colexWith, isRegisteredConcept } from "../lexicon/concepts";
import { isFormLegal } from "../phonology/wordShape";

/**
 * Re-carving events let a daughter language break from the family's
 * inherited semantic partitioning. Two shapes:
 *
 *   - **Merge**  (arm + hand → one slot): two concepts that some
 *                languages colexify fold into a single lexical slot
 *                in this daughter. One form wins; the loser is
 *                removed. Register / frequency from the winner
 *                survive; the merged slot stores both meaning ids
 *                as a polysemy chain (kept as a composite key
 *                `${winner}|${loser}` in `lang.colexifiedAs`).
 *   - **Split** (go → {go, walk}): a single lexical slot is cloned
 *                into two neighbouring concepts. Both share the
 *                form initially; subsequent sound change or drift
 *                reshapes them independently so they can diverge.
 *
 * Both events are rare — once every few hundred generations — and
 * only fire for concepts with registered colexification hints.
 * That keeps the divergence biased toward *typologically plausible*
 * re-carvings (arm/hand, sun/day, tongue/word) instead of arbitrary
 * noise.
 */

export type RecarveEventKind = "merge" | "split";

export interface RecarveEvent {
  kind: RecarveEventKind;
  /** For "merge": the concept whose slot disappears. */
  loser?: Meaning;
  /** For "merge": the concept whose slot absorbs the other's meaning. */
  winner?: Meaning;
  /** For "split": the concept whose slot was duplicated. */
  source?: Meaning;
  /** For "split": the concept that received the duplicate form. */
  newTarget?: Meaning;
}

/**
 * Try one re-carving event. Returns null if no applicable concept
 * pair was found. Typically called at a low probability per
 * generation (~0.003 — see `config.semantics.recarveProbabilityPerGeneration`).
 */
export function maybeRecarve(
  lang: Language,
  rng: Rng,
  probability: number,
): RecarveEvent | null {
  if (!rng.chance(probability)) return null;
  // Coin flip: half of re-carving events merge, half split. Real
  // distributions favour mergers slightly (more common in the
  // colexification literature) but we keep it symmetric because
  // the simulator's splits are informative even if rarer.
  if (rng.chance(0.55)) {
    const merged = tryMerge(lang, rng);
    if (merged) return merged;
    return trySplit(lang, rng);
  }
  const split = trySplit(lang, rng);
  if (split) return split;
  return tryMerge(lang, rng);
}

function tryMerge(lang: Language, rng: Rng): RecarveEvent | null {
  const lex = lang.lexicon;
  const meanings = Object.keys(lex).filter(isRegisteredConcept);
  // Build candidate (a, b) pairs where both meanings exist in the
  // lexicon AND the colexification hint lists them together.
  const pairs: Array<readonly [Meaning, Meaning]> = [];
  const seen = new Set<string>();
  for (const a of meanings) {
    for (const b of colexWith(a)) {
      if (!lex[b]) continue;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pairs.push([a, b]);
    }
  }
  if (pairs.length === 0) return null;
  const [a, b] = pairs[rng.int(pairs.length)]!;
  // Winner = the higher-frequency slot (more-used forms absorb
  // rather than get absorbed). Tie-breaker: alphabetical so the
  // event is deterministic for testing.
  const fa = lang.wordFrequencyHints[a] ?? 0.4;
  const fb = lang.wordFrequencyHints[b] ?? 0.4;
  const winner = fa > fb ? a : fa < fb ? b : a < b ? a : b;
  const loser = winner === a ? b : a;
  // Record the old form for the event payload.
  // Remove the loser's lexicon entry and all auxiliary maps.
  delete lang.lexicon[loser];
  delete lang.wordFrequencyHints[loser];
  delete lang.wordOrigin[loser];
  delete lang.localNeighbors[loser];
  delete lang.lastChangeGeneration[loser];
  if (lang.registerOf) delete lang.registerOf[loser];
  if (lang.suppletion) delete lang.suppletion[loser];
  // Track the merge in `colexifiedAs` so the UI / tests can see that
  // the winner's slot now covers both meanings. Initialized lazily
  // so pre-dictionary saves don't carry a field they don't need.
  if (!lang.colexifiedAs) lang.colexifiedAs = {};
  const bag = lang.colexifiedAs[winner] ?? [];
  bag.push(loser);
  lang.colexifiedAs[winner] = bag;
  return { kind: "merge", winner, loser };
}

/**
 * One-shot kinship-cluster simplification, triggered when a
 * language advances from tier 0 (foraging) to tier 1 (agricultural).
 * Real urbanisation tends to compress fine-grained foraging-band
 * kinship distinctions: classifictory mother-vs-aunt merges into
 * a single "mother", brother-vs-cousin into "brother", etc. We
 * apply up to two kinship-cluster merges in one go so the
 * vocabulary visibly shifts at the transition.
 *
 * Only fires when both ends of an attested kinship colexification
 * exist in the lexicon. Returns the list of merges performed.
 */
export function applyKinshipSimplification(
  lang: Language,
  rng: Rng,
  maxEvents = 2,
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
    if (!lang.lexicon[a] || !lang.lexicon[b]) continue;
    // Winner = the higher-frequency slot (mirrors the merge logic).
    const fa = lang.wordFrequencyHints[a] ?? 0.4;
    const fb = lang.wordFrequencyHints[b] ?? 0.4;
    const winner = fa >= fb ? a : b;
    const loser = winner === a ? b : a;
    delete lang.lexicon[loser];
    delete lang.wordFrequencyHints[loser];
    delete lang.wordOrigin[loser];
    delete lang.localNeighbors[loser];
    delete lang.lastChangeGeneration[loser];
    if (lang.registerOf) delete lang.registerOf[loser];
    if (lang.suppletion) delete lang.suppletion[loser];
    if (!lang.colexifiedAs) lang.colexifiedAs = {};
    const bag = lang.colexifiedAs[winner] ?? [];
    bag.push(loser);
    lang.colexifiedAs[winner] = bag;
    out.push({ kind: "merge", winner, loser });
  }
  return out;
}

function trySplit(lang: Language, rng: Rng): RecarveEvent | null {
  const lex = lang.lexicon;
  const meanings = Object.keys(lex).filter(isRegisteredConcept);
  // Candidate sources: concepts that have colex hints to at least one
  // meaning NOT yet in the lexicon (that's the slot we'll split into).
  const candidates: Array<{ source: Meaning; target: Meaning }> = [];
  for (const source of meanings) {
    for (const target of colexWith(source)) {
      if (lex[target]) continue;
      candidates.push({ source, target });
    }
  }
  if (candidates.length === 0) return null;
  const pick = candidates[rng.int(candidates.length)]!;
  const form = lex[pick.source]!;
  if (!isFormLegal(pick.target, form)) return null;
  lang.lexicon[pick.target] = form.slice();
  // Copy frequency / register over — they start the same, then drift.
  // Fall back to the default-coinage hint (0.4) so downstream code that
  // relies on `wordOrigin` also finding a frequency entry stays happy.
  const freq = lang.wordFrequencyHints[pick.source] ?? 0.4;
  lang.wordFrequencyHints[pick.target] = freq;
  const reg = lang.registerOf?.[pick.source];
  if (reg !== undefined) {
    if (!lang.registerOf) lang.registerOf = {};
    lang.registerOf[pick.target] = reg;
  }
  // Mark origin so the split is visible in the lexicon view.
  lang.wordOrigin[pick.target] = `split:${pick.source}`;
  return { kind: "split", source: pick.source, newTarget: pick.target };
}
