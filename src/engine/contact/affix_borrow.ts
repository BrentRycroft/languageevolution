import type { Language, LanguageTree } from "../types";
import type { DerivationCategory } from "../lexicon/derivation";

/**
 * Phase 57 T2: translator-driven (and contact-driven) affix borrowing.
 *
 * When the translator encounters a lemma whose affix decomposition
 * targets a `DerivationCategory` for which the recipient language
 * has no productive affix, the language can BORROW the affix from a
 * typological neighbour. Models how speaker pressure + contact
 * drives morphological acquisition (Romance `-ist` filtering into
 * non-Romance contact languages; Old English `-ess` borrowed from
 * French).
 *
 * The borrowed affix carries `donorLanguageId` + `borrowedGeneration`
 * so the Compare tab can show provenance ("this `-ist` came from
 * Romance"). Phase 56 T1's productivity-decay applies normally to
 * borrowed affixes — they decay if speakers stop using them.
 *
 * Selection: among the recipient's neighbours, pick the affix with
 * the highest combined score of:
 *   - bilingual-link weight (Phase 41+ areal): high contact = more
 *     likely transfer.
 *   - donor's usage count: established affixes transfer; one-offs
 *     don't.
 *   - phonotactic compatibility (skipped here — borrowed forms can
 *     undergo adaptation post-transfer).
 */

export interface BorrowedAffix {
  donorLanguageId: string;
  affix: import("../types").Phoneme[];
  tag: string;
  category: DerivationCategory;
  position: "prefix" | "suffix";
  donorUsageCount: number;
}

function neighboursOf(
  recipient: Language,
  tree: LanguageTree,
): Language[] {
  // First pass: bilingual links (Phase 41+) if populated.
  const out: Language[] = [];
  if (recipient.bilingualLinks) {
    for (const id of Object.keys(recipient.bilingualLinks)) {
      const node = tree[id];
      if (node && !node.language.extinct) out.push(node.language);
    }
  }
  // Fallback: every alive leaf except recipient.
  if (out.length === 0) {
    for (const id of Object.keys(tree)) {
      const node = tree[id];
      if (!node || node.language.extinct) continue;
      if (node.childrenIds.length > 0) continue; // only leaves
      if (node.language.id === recipient.id) continue;
      out.push(node.language);
    }
  }
  return out;
}

export function findBorrowableAffix(
  recipient: Language,
  category: DerivationCategory,
  tree: LanguageTree,
): BorrowedAffix | null {
  const neighbours = neighboursOf(recipient, tree);
  let best: BorrowedAffix | null = null;
  let bestScore = -Infinity;
  for (const donor of neighbours) {
    if (!donor.derivationalSuffixes) continue;
    for (const s of donor.derivationalSuffixes) {
      if (s.category !== category) continue;
      if (!s.productive) continue;
      const score = (s.usageCount ?? 0)
        + (recipient.bilingualLinks?.[donor.id] ?? 0) * 5;
      if (score > bestScore) {
        best = {
          donorLanguageId: donor.id,
          affix: s.affix.slice(),
          tag: s.tag,
          category,
          position: s.position ?? "suffix",
          donorUsageCount: s.usageCount ?? 0,
        };
        bestScore = score;
      }
    }
  }
  return best;
}

export function borrowAffixIntoRecipient(
  recipient: Language,
  borrowed: BorrowedAffix,
  generation: number,
): boolean {
  if (!recipient.derivationalSuffixes) recipient.derivationalSuffixes = [];
  // Idempotency: if recipient already carries this exact tag, skip.
  if (recipient.derivationalSuffixes.some((s) => s.tag === borrowed.tag)) {
    return false;
  }
  recipient.derivationalSuffixes.push({
    affix: borrowed.affix.slice(),
    tag: borrowed.tag,
    category: borrowed.category,
    position: borrowed.position,
    productive: true,
    usageCount: 1,
    establishedGeneration: generation,
    lastUsedGeneration: generation,
    donorLanguageId: borrowed.donorLanguageId,
    borrowedGeneration: generation,
  });
  if (!recipient.events) recipient.events = [];
  recipient.events.push({
    generation,
    kind: "borrow",
    description: `borrowed affix ${borrowed.tag} (${borrowed.category}) from ${borrowed.donorLanguageId}`,
    meta: {
      donorId: borrowed.donorLanguageId,
      category: borrowed.category,
    },
  });
  return true;
}
