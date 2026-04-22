import type { Language, Lexicon, SoundChange, WordForm } from "../types";
import type { Rng } from "../rng";

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
  for (const m of Object.keys(lang.lexicon)) {
    let form = lang.lexicon[m]!;
    // Apply repeatedly until no more sites match (exception-less).
    for (let safety = 0; safety < form.length; safety++) {
      if (picked.probabilityFor(form) <= 0) break;
      const after = picked.apply(form, rng);
      if (after === form || after.join("") === form.join("")) break;
      form = after as WordForm;
    }
    next[m] = form;
  }
  lang.lexicon = next;
  return picked.id;
}
