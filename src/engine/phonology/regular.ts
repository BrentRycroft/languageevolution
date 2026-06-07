import type { Language, Lexicon, Meaning, SoundChange, WordForm } from "../types";
import { satDelete } from "../lexicon/satellites";
import type { Rng } from "../rng";
import { isFormLegal } from "./wordShape";
import {
  introducesViolation,
  violatesProfile,
  repairToProfile,
  pickEpentheticVowel,
  PERMISSIVE_PROFILE,
} from "./phonotactics";
import { lexGet, lexKeys, lexDelete } from "../lexicon/access";
import { lexemeIdFor, keylessGloss } from "../lexicon/lexemeIdentity";
import { setRecordForm } from "../lexicon/store";

/**
 * regular.ts
 *
 * Phonological feature geometry, sound-change rules, syllable shape, stress, tone, sandhi, and inventory homeostasis. Key exports: applyOneRegularChange.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export function applyOneRegularChange(
  lang: Language,
  changes: SoundChange[],
  rng: Rng,
): string | null {
  const applicable = changes.filter((c) => {
    for (const m of lexKeys(lang)) {
      if (c.probabilityFor(lexGet(lang, m)!) > 0) return true;
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
  // Ask #4: the regular law respects the language's evolving syllable
  // structure. When the law's output newly violates the profile, epenthesis
  // repairs it where possible (the attested "sound law triggers a repair"
  // pattern); where repair fails the law is blocked for that word. The
  // profile read here is the SAME structure Lane B reads when building words.
  const profile = lang.phonotacticProfile ?? PERMISSIVE_PROFILE;
  const epentheticVowel = pickEpentheticVowel(lang);
  for (const m of lexKeys(lang)) {
    const original = lexGet(lang, m)!;
    let form = original;
    for (let safety = 0; safety < MAX_PER_MEANING_PASSES; safety++) {
      if (picked.probabilityFor(form) <= 0) break;
      const after = picked.apply(form, rng);
      if (after === form || after.join("") === form.join("")) break;
      if (!isFormLegal(m, after as WordForm)) break;
      let accepted = after as WordForm;
      if (introducesViolation(form, accepted, profile)) {
        const repaired = repairToProfile(accepted, profile, epentheticVowel);
        if (!violatesProfile(repaired, profile) && isFormLegal(m, repaired)) {
          accepted = repaired;
        } else {
          break;
        }
      }
      form = accepted;
    }
    if (form.length === 0) {
      dropped.push(m);
      continue;
    }
    next[m] = form;
  }
  // S1 task 4: keyless words are first-class in the regular (exceptionless) sweep too. Apply the SAME
  // picked rule to every gloss-less record, using its EMERGENT gloss (`keylessGloss`) for legality.
  // These draws come AFTER all seeded draws above, so seeded outcomes stay byte-identical; the extra
  // shared-rng advance is the deliberate re-bake. Forms are written in place; a keyless word that
  // erodes to empty is dropped.
  for (const id of Object.keys(lang.lexemes)) {
    const rec = lang.lexemes[id]!;
    if (rec.gloss !== undefined) continue; // seeded handled above
    const km = keylessGloss(rec);
    let form = rec.form;
    for (let safety = 0; safety < MAX_PER_MEANING_PASSES; safety++) {
      if (picked.probabilityFor(form) <= 0) break;
      const after = picked.apply(form, rng);
      if (after === form || after.join("") === form.join("")) break;
      if (!isFormLegal(km, after as WordForm)) break;
      let accepted = after as WordForm;
      if (introducesViolation(form, accepted, profile)) {
        const repaired = repairToProfile(accepted, profile, epentheticVowel);
        if (!violatesProfile(repaired, profile) && isFormLegal(km, repaired)) {
          accepted = repaired;
        } else {
          break;
        }
      }
      form = accepted;
    }
    if (form.length === 0) delete lang.lexemes[id];
    else rec.form = form;
  }
  // `next` was built gloss-keyed (preserving the per-meaning RNG draw order
  // above). Store unification (S1): write each survivor's new form into its
  // existing record in place (lexemeIdFor is a lookup — the record already has
  // its point + gloss), and DROP the records that merged away. Updating in place
  // keeps the store's key order (minus dropped) byte-identical to the old
  // wholesale-replace, and leaves keyless records untouched.
  for (const m of Object.keys(next)) {
    setRecordForm(lang.lexemes, lexemeIdFor(lang, m as Meaning), next[m as Meaning]!);
  }
  for (const m of dropped) {
    lexDelete(lang, m);
    satDelete(lang, "wordFrequencyHints", m);
    satDelete(lang, "lastChangeGeneration", m);
    satDelete(lang, "wordOrigin", m);
    satDelete(lang, "localNeighbors", m);
    if (lang.registerOf) satDelete(lang, "registerOf", m);
  }
  return picked.id;
}
