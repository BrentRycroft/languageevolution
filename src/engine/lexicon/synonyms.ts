import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";
import { addSynonym, setLexiconForm } from "./mutate";
import { selectSynonyms, formKeyOf, findWordsByMeaning } from "./word";
import { posOf, isClosedClass } from "./pos";

/**
 * Phase 37: synonym genesis + homonym suppression.
 *
 * Real languages have many more synonyms than homonyms — most
 * meanings have 2-5 attested forms (with register/connotation
 * differences); genuine homonyms are rarer and usually disambiguated
 * by context. The simulator's pre-37 dynamics let homonymy
 * accumulate freely while synonymy only emerged via borrows.
 *
 * This module adds two opposing pressures:
 *
 * 1. `maybeSpawnSynonym` — at low rate, derive a stylistic synonym
 *    from a high-frequency content word (mirroring English
 *    house/abode, big/large, start/begin). The synonym gets a
 *    register tag distinct from the primary so the composer can
 *    pick it in the right genre.
 *
 * 2. `maybeSuppressHomonym` — when two non-core meanings share a
 *    form AND the loser has a synonym available, swap the loser's
 *    primary form to its synonym, vacating the homonym pair.
 *
 * Combined, these tilt the steady-state distribution toward more
 * synonyms-per-meaning and fewer homonyms-per-form.
 */

export interface SynonymGenesisEvent {
  meaning: Meaning;
  synonym: WordForm;
  pathway: "stylistic-split" | "literary-borrow" | "register-split";
}

export function maybeSpawnSynonym(
  lang: Language,
  rng: Rng,
  probability: number,
): SynonymGenesisEvent | null {
  if (!rng.chance(probability)) return null;
  // Candidates: open-class meanings already in the lexicon with
  // frequency ≥ 0.4 (frequent enough to stylistically split, not so
  // rare that nobody would coin an alternative).
  const candidates: Array<{ meaning: Meaning; form: WordForm }> = [];
  for (const m of Object.keys(lang.lexicon)) {
    if (isClosedClass(posOf(m))) continue;
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    if (freq < 0.4) continue;
    if (selectSynonyms(lang, m).length >= 3) continue; // already saturated
    const f = lang.lexicon[m]!;
    if (f.length < 2) continue;
    candidates.push({ meaning: m, form: f });
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[rng.int(candidates.length)]!;
  // Generate a stylistic synonym by perturbing the primary form:
  // duplicate a vowel, swap a final consonant, or prepend a vowel.
  // The synonym's surface should clearly differ from the primary.
  const synonym = perturbForSynonym(chosen.form, rng);
  if (!synonym || synonym.length === 0) return null;
  if (formKeyOf(synonym) === formKeyOf(chosen.form)) return null;
  // Avoid creating a homonym by accident — if this synonym already
  // serves a different meaning, skip.
  if (findWordsByMeaning(lang, chosen.meaning).some((w) => w.formKey === formKeyOf(synonym))) {
    return null;
  }
  const ok = addSynonym(lang, chosen.meaning, synonym, {
    bornGeneration: 0,
    register: "high", // stylistic synonyms tend to register-split
    origin: "synonym-genesis",
  });
  if (!ok) return null;
  return {
    meaning: chosen.meaning,
    synonym,
    pathway: "stylistic-split",
  };
}

function perturbForSynonym(form: WordForm, rng: Rng): WordForm | null {
  // A few simple perturbations — pick one. Stays within the existing
  // phoneme inventory by drawing from the form's own segments.
  const variants: WordForm[] = [];
  if (form.length >= 2) {
    // Swap last two segments.
    const swapped = form.slice();
    const a = swapped[swapped.length - 1]!;
    const b = swapped[swapped.length - 2]!;
    swapped[swapped.length - 1] = b;
    swapped[swapped.length - 2] = a;
    variants.push(swapped);
  }
  if (form.length >= 3) {
    // Drop the second segment (vowel/consonant deletion).
    const dropped = form.slice(0, 1).concat(form.slice(2));
    variants.push(dropped);
  }
  // Prepend a vowel from the form itself.
  const firstVowel = form.find((p) => /^[aeiouəɛɔæ]/.test(p));
  if (firstVowel) {
    variants.push([firstVowel, ...form]);
  }
  if (variants.length === 0) return null;
  return variants[rng.int(variants.length)]!;
}

/**
 * Phase 37: when a non-core homonym pair exists and the lower-
 * frequency meaning has a synonym available, swap that meaning's
 * primary form to the synonym and remove the homonymous form's
 * sense for that meaning. The result is one fewer homonym in the
 * lexicon. Run rarely (low rate per gen) — natural homonyms
 * persist when no synonym alternative exists.
 */
export function maybeSuppressHomonym(
  lang: Language,
  rng: Rng,
  probability: number,
): { meaning: Meaning; vacatedForm: WordForm; replacementForm: WordForm } | null {
  if (!rng.chance(probability)) return null;
  if (!lang.words) return null;
  // Find a Word with ≥ 2 senses (homonym); among its senses, look
  // for a non-core, lower-frequency one that has a synonym available.
  for (const w of lang.words) {
    if (w.senses.length < 2) continue;
    // Skip the primary sense; only candidates are non-primary senses
    // that aren't already flagged as synonyms (i.e., genuine homonyms).
    for (let i = 0; i < w.senses.length; i++) {
      if (i === w.primarySenseIndex) continue;
      const sense = w.senses[i]!;
      if (sense.synonym) continue;
      const m = sense.meaning;
      if (isClosedClass(posOf(m))) continue;
      const synonyms = selectSynonyms(lang, m).filter((sw) => sw !== w);
      if (synonyms.length === 0) continue;
      // Found a candidate. Pick the highest-weighted synonym as the
      // new primary and demote the homonym.
      const replacement = synonyms[0]!;
      const oldForm = w.form.slice();
      setLexiconForm(lang, m, replacement.form.slice(), {
        bornGeneration: 0,
        origin: "homonym-suppression",
      });
      return {
        meaning: m,
        vacatedForm: oldForm,
        replacementForm: replacement.form.slice(),
      };
    }
  }
  void rng;
  return null;
}

/**
 * Phase 37: coinage gate. Called by genesis before committing a new
 * (meaning, form) pair. Returns true if the new entry is acceptable;
 * false if it would create accidental homonymy (the form already
 * carries an unrelated meaning) so genesis should pick a different
 * candidate.
 *
 * Allows polysemy when the new meaning is in the same semantic
 * cluster as an existing sense — e.g., "bank.financial" + "bank.river"
 * could be allowed as historic polysemy if both share the cluster
 * "edge", but for this simple gate we treat any existing sense on
 * the form as a homonym risk and refuse.
 */
export function isHomonymCollision(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
): boolean {
  if (!lang.words) return false;
  const key = formKeyOf(form);
  const existing = lang.words.find((w) => w.formKey === key);
  if (!existing) return false;
  // If the meaning is already a sense on this word, it's not a
  // collision (it's a re-coinage of the same meaning).
  if (existing.senses.some((s) => s.meaning === meaning)) return false;
  return true;
}
