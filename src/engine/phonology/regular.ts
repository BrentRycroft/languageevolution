import type { Language, Lexicon, SoundChange, WordForm } from "../types";
import type { Rng } from "../rng";
import { isFormLegal } from "./wordShape";

/**
 * Apply one sound change to every word in the lexicon simultaneously, at
 * every matching site. This simulates the Neogrammarian "sound laws"
 * hypothesis: a change, once it begins, operates without exception.
 *
 * Returns the id of the change that fired, or null if none did.
 */
export function applyOneRegularChange(
  lang: Language,
  changes: SoundChange[],
  rng: Rng,
): string | null {
  const applicable = changes.filter((c) => {
    // Pick changes that have at least one matching site somewhere.
    for (const m of Object.keys(lang.lexicon)) {
      if (c.probabilityFor(lang.lexicon[m]!) > 0) return true;
    }
    return false;
  });
  if (applicable.length === 0) return null;
  const picked = applicable[rng.int(applicable.length)]!;

  const next: Lexicon = {};
  const dropped: string[] = [];
  for (const m of Object.keys(lang.lexicon)) {
    const original = lang.lexicon[m]!;
    let form = original;
    // Apply repeatedly until no more sites match (exception-less).
    for (let safety = 0; safety < form.length; safety++) {
      if (picked.probabilityFor(form) <= 0) break;
      const after = picked.apply(form, rng);
      if (after === form || after.join("") === form.join("")) break;
      // Word-shape gate: the exception-less loop is otherwise capable
      // of compressing a content word down to a single vowel (via
      // compensatory lengthening on a 2-phoneme form) or a single lone
      // consonant (via a substitution that strips the last nucleus).
      // `isFormLegal` encodes the full rule:
      //   - length ≥ 2 + has nucleus: fine
      //   - length 1: only pronouns/deictics, and only if the segment
      //     is a nucleus
      //   - length 0: never
      if (!isFormLegal(m, after as WordForm)) break;
      form = after as WordForm;
    }
    // Drop meanings whose form collapsed to zero segments — same policy
    // as applyChangesToLexicon. Keeping an empty form around produces
    // orphan lexicon entries whose registerOf / wordOrigin etc. stay
    // behind and accumulate over long runs.
    if (form.length === 0) {
      dropped.push(m);
      continue;
    }
    next[m] = form;
  }
  lang.lexicon = next;
  // Clean every per-meaning auxiliary map for the dropped meanings so the
  // orphan entries don't pile up (bantu with its regular-change cadence
  // produced ~880 dangling registerOf entries over 2000 gens before this).
  for (const m of dropped) {
    delete lang.wordFrequencyHints[m];
    delete lang.lastChangeGeneration[m];
    delete lang.wordOrigin[m];
    delete lang.localNeighbors[m];
    if (lang.registerOf) delete lang.registerOf[m];
  }
  return picked.id;
}
