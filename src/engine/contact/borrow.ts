import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import { leafIds } from "../tree/split";
import { isVowel } from "../phonology/ipa";

export interface LoanEvent {
  donor: string;
  meaning: string;
  originalForm: string;
  adaptedForm: string;
}

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
  if (!rng.chance(probability)) return null;
  const donors = leafIds(tree).filter(
    (id) =>
      id !== recipient.id &&
      tree[id]!.language.extinct !== true &&
      !isAncestor(tree, id, recipient.id),
  );
  if (donors.length === 0) return null;
  const donorId = donors[rng.int(donors.length)]!;
  const donor = tree[donorId]!.language;

  // Prefer meanings that exist in the donor but not in the recipient —
  // that's the canonical "cultural loanword" case.
  const donorMeanings = Object.keys(donor.lexicon);
  const candidates = donorMeanings.filter((m) => !recipient.lexicon[m]);
  const pool = candidates.length > 0 ? candidates : donorMeanings;
  if (pool.length === 0) return null;
  const meaning = pool[rng.int(pool.length)]!;
  const originalForm = donor.lexicon[meaning]!;
  const adapted = adaptPhonemes(originalForm, recipient);
  if (adapted.length === 0) return null;
  recipient.lexicon[meaning] = adapted;
  // Loanwords typically enter with medium frequency.
  recipient.wordFrequencyHints[meaning] = Math.max(
    recipient.wordFrequencyHints[meaning] ?? 0,
    0.45,
  );
  return {
    donor: donor.name,
    meaning,
    originalForm: originalForm.join(""),
    adaptedForm: adapted.join(""),
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

function adaptPhonemes(form: string[], recipient: Language): string[] {
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
    return candidates[p.charCodeAt(0) % candidates.length]!;
  });
}
