import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import { leafIds } from "../tree/split";
import { isVowel } from "../phonology/ipa";
import { isFormLegal } from "../phonology/wordShape";
import { geoDistance } from "../geo";

export interface LoanEvent {
  donor: string;
  donorId: string;
  meaning: string;
  originalForm: string;
  adaptedForm: string;
  /**
   * Map-space distance between donor and recipient at the moment of
   * borrowing. Used by the UI to scale the borrow-arrow length and by
   * tests to verify the distance-decay weighting.
   */
  distance: number;
}

/**
 * Distance at which borrow affinity drops to half. Split-step size at
 * generation 0 is 80 px (see `tree/split.ts`), so this keeps sister-to-
 * sister borrows common while making great-great-aunt contact rare —
 * roughly how cultural borrowing falls off in real geography.
 */
const BORROW_HALF_LIFE = 200;

/**
 * Attempt one loanword event: pick a living sibling language, copy one of its
 * words that our language doesn't yet have (or has a very different form for),
 * adapting the phonemes to segments our language actually uses.
 * Returns a description or null.
 */
export function tryBorrow(
  recipient: Language,
  tree: LanguageTree,
  rng: Rng,
  probability: number,
): LoanEvent | null {
  const donors = leafIds(tree).filter(
    (id) =>
      id !== recipient.id &&
      tree[id]!.language.extinct !== true &&
      !isAncestor(tree, id, recipient.id),
  );
  if (donors.length === 0) return null;

  // Weight each candidate donor by its map-space proximity to the
  // recipient: affinity = half-life / (half-life + d). At d=0 this is 1;
  // at d=half-life it's 0.5; at d→∞ it decays to 0. If none of the
  // donors have coords yet (pre-Update-1 saves), fall back to uniform.
  const recipCoords = recipient.coords;
  const weighted: Array<{ id: string; weight: number }> = donors.map((id) => {
    const donorCoords = tree[id]!.language.coords;
    if (!recipCoords || !donorCoords) {
      return { id, weight: 1 };
    }
    const d = geoDistance(recipCoords, donorCoords);
    return { id, weight: BORROW_HALF_LIFE / (BORROW_HALF_LIFE + d) };
  });
  // Scale the Poisson-gated probability by the best available affinity
  // so a tribe with no nearby neighbours borrows rarely — distance
  // throttles the event rate, not just the donor pick.
  const maxWeight = weighted.reduce((m, w) => (w.weight > m ? w.weight : m), 0);
  if (!rng.chance(probability * maxWeight)) return null;

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  let r = rng.next() * totalWeight;
  let donorId = weighted[0]!.id;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) {
      donorId = w.id;
      break;
    }
  }
  const donor = tree[donorId]!.language;
  const distance =
    recipCoords && donor.coords ? geoDistance(recipCoords, donor.coords) : 0;

  // Prefer meanings that exist in the donor but not in the recipient —
  // that's the canonical "cultural loanword" case.
  const donorMeanings = Object.keys(donor.lexicon);
  const candidates = donorMeanings.filter((m) => !recipient.lexicon[m]);
  const pool = candidates.length > 0 ? candidates : donorMeanings;
  if (pool.length === 0) return null;
  const meaning = pool[rng.int(pool.length)]!;
  const originalForm = donor.lexicon[meaning]!;
  const adapted = adaptPhonemes(originalForm, recipient, rng);
  if (adapted.length === 0) return null;
  // Word-shape gate: a borrowed form must still be pronounceable and
  // long enough for a content word. Full rule in
  // `phonology/wordShape.ts::isFormLegal`.
  if (!isFormLegal(meaning, adapted)) return null;
  recipient.lexicon[meaning] = adapted;
  // Loanwords typically enter with medium frequency.
  recipient.wordFrequencyHints[meaning] = Math.max(
    recipient.wordFrequencyHints[meaning] ?? 0,
    0.45,
  );
  return {
    donor: donor.name,
    donorId,
    meaning,
    originalForm: originalForm.join(""),
    adaptedForm: adapted.join(""),
    distance,
  };
}

function isAncestor(tree: LanguageTree, candidateAncestorId: string, descendantId: string): boolean {
  let cur: string | null = descendantId;
  while (cur) {
    if (cur === candidateAncestorId) return true;
    cur = tree[cur]?.parentId ?? null;
  }
  return false;
}

function adaptPhonemes(form: string[], recipient: Language, rng: Rng): string[] {
  const inv = new Set(recipient.phonemeInventory.segmental);
  if (inv.size === 0) return form.slice();
  return form.map((p) => {
    if (inv.has(p)) return p;
    // Nearest-neighbour substitution: pick a phoneme of the same class
    // (vowel/consonant) that the recipient actually has.
    const targetVowel = isVowel(p);
    const candidates = recipient.phonemeInventory.segmental.filter(
      (q) => isVowel(q) === targetVowel,
    );
    if (candidates.length === 0) return p;
    return candidates[rng.int(candidates.length)]!;
  });
}
