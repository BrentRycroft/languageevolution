import type { Language, Lexicon, SoundChange, WordForm } from "../types";
import type { Rng } from "../rng";
import { isFormLegal } from "./wordShape";

export function applyOneRegularChange(
  lang: Language,
  changes: SoundChange[],
  rng: Rng,
): string | null {
  const applicable = changes.filter((c) => {
    for (const m of Object.keys(lang.lexicon)) {
      if (c.probabilityFor(lang.lexicon[m]!) > 0) return true;
    }
    return false;
  });
  if (applicable.length === 0) return null;
  const picked = applicable[rng.int(applicable.length)]!;

  const next: Lexicon = {};
  const dropped: string[] = [];
  // Phase 29 Tranche 7b: hard cap on per-meaning iteration. The
  // previous bound of `form.length` could become an infinite loop if
  // `picked.apply(form)` returns a longer form (e.g., an insertion
  // rule that always fires) — the bound grows with the form. Even
  // with no insertion, capping prevents pathological catalog
  // interactions where `probabilityFor` can stay > 0 across many
  // applications without `after === form` triggering.
  const MAX_PER_MEANING_PASSES = 10;
  for (const m of Object.keys(lang.lexicon)) {
    const original = lang.lexicon[m]!;
    let form = original;
    for (let safety = 0; safety < MAX_PER_MEANING_PASSES; safety++) {
      if (picked.probabilityFor(form) <= 0) break;
      const after = picked.apply(form, rng);
      if (after === form || after.join("") === form.join("")) break;
      if (!isFormLegal(m, after as WordForm)) break;
      form = after as WordForm;
    }
    if (form.length === 0) {
      dropped.push(m);
      continue;
    }
    next[m] = form;
  }
  lang.lexicon = next;
  for (const m of dropped) {
    delete lang.wordFrequencyHints[m];
    delete lang.lastChangeGeneration[m];
    delete lang.wordOrigin[m];
    delete lang.localNeighbors[m];
    if (lang.registerOf) delete lang.registerOf[m];
  }
  return picked.id;
}
