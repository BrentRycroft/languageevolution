import type { Language } from "../types";
import type { Rng } from "../rng";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { phonotacticScore } from "../phonology/phonotactics";
import { pushEvent } from "./helpers";

/**
 * Phase 27c: phonotactic-aware repair pass.
 *
 * Sound changes can produce surface forms that violate the language's
 * phonotactic profile (e.g. a CCC onset in a strict-CV language after
 * an erosion rule deleted a vowel). Phase 27a introduced the gradient
 * `phonotacticScore` but only used it as a soft bias on coinage. This
 * step actively REPAIRS heavy violations by trying the existing
 * insertion-based catalog rules in turn until the score lifts above
 * the repair threshold.
 *
 * Capped at MAX_REPAIRS_PER_GEN to avoid mass restructuring; some
 * marked / loanword violations are allowed to persist.
 */

const REPAIR_RULE_IDS = [
  "insertion.shape_repair_epenthesis",
  "insertion.prothetic_e",
  "insertion.anaptyxis",
] as const;

const REPAIR_THRESHOLD = 0.5;
const MIN_IMPROVEMENT = 0.05;
const MAX_REPAIRS_PER_GEN = 3;

export function stepPhonotacticRepair(
  lang: Language,
  rng: Rng,
  generation: number,
): void {
  const profile = lang.phonotacticProfile;
  if (!profile || profile.strictness <= 0) return;

  const meanings = Object.keys(lang.lexicon);
  // Find candidates ordered by worst score first so we spend the
  // repair budget on the worst offenders.
  const violators: { meaning: string; score: number }[] = [];
  for (const m of meanings) {
    const form = lang.lexicon[m];
    if (!form || form.length === 0) continue;
    const score = phonotacticScore(form, profile);
    if (score < REPAIR_THRESHOLD) violators.push({ meaning: m, score });
  }
  if (violators.length === 0) return;
  violators.sort((a, b) => a.score - b.score);

  let repairs = 0;
  for (const { meaning, score: before } of violators) {
    if (repairs >= MAX_REPAIRS_PER_GEN) break;
    const form = lang.lexicon[meaning];
    if (!form) continue;

    for (const ruleId of REPAIR_RULE_IDS) {
      const rule = CATALOG_BY_ID[ruleId];
      if (!rule) continue;
      // Only fire the rule if it actually matches this word; we don't
      // need to roll its probability — repair is an explicit fix-up.
      if (rule.probabilityFor(form) <= 0) continue;
      const repaired = rule.apply(form, rng);
      if (repaired === form || repaired.length === form.length) continue;
      const after = phonotacticScore(repaired, profile);
      if (after - before < MIN_IMPROVEMENT) continue;
      // Take the first rule that lifts the form's score above the
      // threshold (or, failing that, makes a meaningful improvement).
      lang.lexicon[meaning] = repaired;
      pushEvent(lang, {
        generation,
        kind: "sound_change",
        description: `phonotactic repair (${rule.id}): /${form.join("")}/ → /${repaired.join("")}/ for "${meaning}" (score ${before.toFixed(2)} → ${after.toFixed(2)})`,
        meta: { meaning, category: "phonotactic_repair" },
      });
      repairs++;
      break;
    }
  }
}
