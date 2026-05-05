import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";
import { setLexiconForm } from "../lexicon/mutate";

/**
 * Phase 36 Tranche 36m: calques (loan translation) and reborrowing.
 *
 * A calque copies a neighbouring language's compound STRUCTURE
 * rather than its surface form: Latin compassio (com- + passio) →
 * German Mitleid (mit + leid). The recipient already has each part
 * native, so it stitches them together morpheme-by-morpheme.
 *
 * `tryCalque` fires at low rate when:
 * - the recipient lacks a word for the meaning,
 * - a donor neighbour has a transparent compound for it,
 * - the donor's parts each map to a meaning the recipient already
 *   has in its own lexicon (cross-language semantic match).
 *
 * Returns the new compound's parts and form, or null when no
 * candidate fires.
 */
export interface CalqueEvent {
  meaning: Meaning;
  donorId: string;
  parts: Meaning[];
  form: WordForm;
}

export function tryCalque(
  recipient: Language,
  donor: Language,
  rng: Rng,
  probability: number = 0.0008,
): CalqueEvent | null {
  if (!rng.chance(probability)) return null;
  if (!donor.compounds) return null;
  for (const meaning of Object.keys(donor.compounds)) {
    const meta = donor.compounds[meaning]!;
    if (meta.fossilized) continue;
    // Recipient already has this meaning — no calque opportunity.
    if (recipient.lexicon[meaning]) continue;
    // Each part must exist in the recipient's lexicon for a
    // morpheme-by-morpheme translation to work.
    const recipientParts: Meaning[] = [];
    let ok = true;
    for (const part of meta.parts) {
      if (!recipient.lexicon[part]) {
        ok = false;
        break;
      }
      recipientParts.push(part);
    }
    if (!ok) continue;
    // Stitch the recipient's part forms together.
    const out: WordForm = [];
    for (const p of recipientParts) {
      out.push(...recipient.lexicon[p]!);
    }
    if (out.length === 0) continue;
    setLexiconForm(recipient, meaning, out, {
      bornGeneration: 0,
      origin: `calque:${donor.id}`,
    });
    if (!recipient.compounds) recipient.compounds = {};
    recipient.compounds[meaning] = {
      parts: recipientParts.slice(),
      fossilized: false,
      bornGeneration: 0,
    };
    return { meaning, donorId: donor.id, parts: recipientParts, form: out };
  }
  return null;
}
