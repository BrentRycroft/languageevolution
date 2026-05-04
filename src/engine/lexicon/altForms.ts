import type { Language, Meaning, WordForm } from "../types";
import { setLexiconForm } from "./mutate";

/**
 * Helpers for managing alternative forms (synonyms / lexical doublets) on a
 * Language. The primary form for a meaning lives in `lang.lexicon[m]`;
 * alternates live in `lang.altForms[m]` ranked by descending frequency.
 *
 * Key invariant: an alternate must never equal the primary. addAlt enforces
 * this by skipping form-string-equal duplicates.
 */

const MAX_ALTS_PER_MEANING = 4;

function formKey(form: WordForm): string {
  return form.join("|");
}

/**
 * Append `form` as an alternate for `meaning`, with optional register tag.
 * No-ops if the form already equals the primary or is already an alternate.
 */
export function addAlt(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
  register: "high" | "low" | "neutral" = "neutral",
): boolean {
  if (form.length === 0) return false;
  const primary = lang.lexicon[meaning];
  if (primary && formKey(primary) === formKey(form)) return false;

  if (!lang.altForms) lang.altForms = {};
  if (!lang.altRegister) lang.altRegister = {};
  const existing = lang.altForms[meaning] ?? [];
  if (existing.some((f) => formKey(f) === formKey(form))) return false;

  existing.push(form.slice());
  const registers = lang.altRegister[meaning] ?? [];
  registers.push(register);

  // Cap at MAX_ALTS_PER_MEANING; drop the oldest (front) if over.
  while (existing.length > MAX_ALTS_PER_MEANING) {
    existing.shift();
    registers.shift();
  }

  lang.altForms[meaning] = existing;
  lang.altRegister[meaning] = registers;
  return true;
}

/**
 * Drop alternates whose meaning has low overall frequency. Called per gen
 * with a small probability so the simulator doesn't grow alts unboundedly.
 */
export function pruneAlts(lang: Language, decayProbability: number, rng: { chance: (p: number) => boolean }): void {
  if (!lang.altForms) return;
  const meanings = Object.keys(lang.altForms);
  for (const m of meanings) {
    const alts = lang.altForms[m];
    if (!alts || alts.length === 0) continue;
    const freq = lang.wordFrequencyHints[m] ?? 0.4;
    // Higher freq = lower decay. The "primary plus alts" stays alive
    // while frequency holds; once a meaning's freq drops, alts go first.
    const effectiveDecay = decayProbability * Math.max(0.2, 1 - freq);
    if (rng.chance(effectiveDecay)) {
      // Drop the last (least-frequent) alt.
      alts.pop();
      const regs = lang.altRegister?.[m];
      if (regs) regs.pop();
      if (alts.length === 0) {
        delete lang.altForms[m];
        if (lang.altRegister) delete lang.altRegister[m];
      } else {
        lang.altForms[m] = alts;
      }
    }
  }
}

/**
 * If a meaning's primary form has been removed (semantic obsolescence) but
 * it still has alternates, promote the highest-ranked alt to primary so the
 * concept doesn't disappear from the lexicon.
 */
export function promoteAltOnPrimaryLoss(lang: Language, meaning: Meaning): WordForm | null {
  if (lang.lexicon[meaning]) return null; // primary still exists
  const alts = lang.altForms?.[meaning];
  if (!alts || alts.length === 0) return null;
  const promoted = alts.shift()!;
  // Phase 29 Tranche 1 round 2: route through chokepoint.
  setLexiconForm(lang, meaning, promoted, { bornGeneration: 0, origin: "altform-promoted" });
  const regs = lang.altRegister?.[meaning];
  if (regs) regs.shift();
  if (alts.length === 0) {
    delete lang.altForms![meaning];
    if (lang.altRegister) delete lang.altRegister[meaning];
  }
  return promoted;
}

/**
 * Return all forms for a meaning (primary + alternates) in descending
 * preference order. Used by narrative composers and translator reverse
 * indices.
 */
export function allFormsFor(lang: Language, meaning: Meaning): WordForm[] {
  const out: WordForm[] = [];
  const primary = lang.lexicon[meaning];
  if (primary) out.push(primary);
  const alts = lang.altForms?.[meaning];
  if (alts) out.push(...alts);
  return out;
}
