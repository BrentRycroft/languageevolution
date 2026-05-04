import type { Language, Lexicon, Phoneme, WordForm } from "../types";
import { stripTone } from "./tone";

/**
 * Phase 29 Tranche 5d: sound correspondence law tracker.
 *
 * After each generation's phonology step, walk the (before, after)
 * lexicon pair and record every position-aligned substitution. Each
 * (proto, daughter, environment) triple gets a `fires` increment plus
 * a `total` increment that counts how often the SAME proto phoneme
 * appears in the SAME environment across the lexicon. The fires/total
 * ratio is the correspondence's "regularity" — a Grimm's-Law-grade
 * systematic shift exhibits ≥ 0.8 across hundreds of words.
 *
 * Recording is best-effort and skips meanings whose form lengths
 * differ between before and after (insertion / deletion rules — those
 * don't yield a clean position-aligned correspondence). The
 * regularity stat still works because we count `total` from the
 * post-rule lexicon, not the pre-rule one.
 */

export type CorrespondenceEnv = "any" | "initial" | "final" | "intervocalic";

const ENV_PRECEDENCE: ReadonlyArray<CorrespondenceEnv> = [
  "initial",
  "final",
  "intervocalic",
  "any",
];

function envOf(form: WordForm, idx: number): CorrespondenceEnv {
  if (idx === 0) return "initial";
  if (idx === form.length - 1) return "final";
  // intervocalic: surrounded by vowels (using stripTone for tone-bearing).
  const prev = stripTone(form[idx - 1] ?? "");
  const next = stripTone(form[idx + 1] ?? "");
  if (isVowelLike(prev) && isVowelLike(next)) return "intervocalic";
  return "any";
}

function isVowelLike(p: Phoneme): boolean {
  // Cheap check — anything that's not a consonantal symbol.
  if (!p) return false;
  return /^[aeiouɛɔæəɪʊɯɨyʌʉøœ]/i.test(p);
}

function correspondenceKey(
  from: Phoneme,
  to: Phoneme,
  env: CorrespondenceEnv,
): string {
  return `${from}>${to}@${env}`;
}

export function recordCorrespondences(
  lang: Language,
  before: Lexicon,
  after: Lexicon,
  generation: number,
): void {
  if (!lang.correspondences) lang.correspondences = {};
  const corr = lang.correspondences;

  for (const meaning of Object.keys(after)) {
    const beforeForm = before[meaning];
    const afterForm = after[meaning];
    if (!beforeForm || !afterForm) continue;
    if (beforeForm.length !== afterForm.length) continue; // skip insertion/deletion
    if (beforeForm === afterForm) {
      // Form unchanged: tally `total` for every position so the
      // regularity denominator reflects unchanged sites too.
      for (let i = 0; i < afterForm.length; i++) {
        const p = stripTone(afterForm[i]!);
        const env = envOf(afterForm, i);
        const k = correspondenceKey(p, p, env);
        const entry = corr[k];
        if (entry) {
          entry.total++;
        } else {
          corr[k] = {
            from: p,
            to: p,
            environment: env,
            fires: 0,
            total: 1,
            firstSeenGeneration: generation,
            lastFireGeneration: generation,
          };
        }
      }
      continue;
    }
    for (let i = 0; i < afterForm.length; i++) {
      const beforeP = stripTone(beforeForm[i]!);
      const afterP = stripTone(afterForm[i]!);
      const env = envOf(afterForm, i);
      if (beforeP === afterP) {
        // Position unchanged — tally `total` for the identity
        // correspondence so the regularity denominator includes
        // unchanged sites. Create the entry on first sight.
        const k = correspondenceKey(beforeP, beforeP, env);
        const entry = corr[k];
        if (entry) {
          entry.total++;
        } else {
          corr[k] = {
            from: beforeP,
            to: beforeP,
            environment: env,
            fires: 0,
            total: 1,
            firstSeenGeneration: generation,
            lastFireGeneration: generation,
          };
        }
        continue;
      }
      const k = correspondenceKey(beforeP, afterP, env);
      const entry = corr[k];
      if (entry) {
        entry.fires++;
        entry.total++;
        entry.lastFireGeneration = generation;
      } else {
        corr[k] = {
          from: beforeP,
          to: afterP,
          environment: env,
          fires: 1,
          total: 1,
          firstSeenGeneration: generation,
          lastFireGeneration: generation,
        };
      }
    }
  }
}

/**
 * Surface the most "regular" correspondences — the ones that look
 * Grimm's-Law-grade systematic. Filters by:
 *   - total ≥ minTotal (need enough evidence)
 *   - fires/total ≥ minRegularity
 *   - from !== to (skip identity correspondences)
 */
export function topRegularCorrespondences(
  lang: Language,
  minTotal = 5,
  minRegularity = 0.4,
  limit = 10,
): Array<{
  from: Phoneme;
  to: Phoneme;
  environment: CorrespondenceEnv;
  fires: number;
  total: number;
  regularity: number;
}> {
  if (!lang.correspondences) return [];
  const out: Array<{
    from: Phoneme;
    to: Phoneme;
    environment: CorrespondenceEnv;
    fires: number;
    total: number;
    regularity: number;
  }> = [];
  for (const entry of Object.values(lang.correspondences)) {
    if (entry.from === entry.to) continue;
    if (entry.total < minTotal) continue;
    const regularity = entry.fires / entry.total;
    if (regularity < minRegularity) continue;
    out.push({ ...entry, regularity });
  }
  // Sort by regularity, then by fires (more attestations = more reliable).
  out.sort((a, b) => {
    const r = b.regularity - a.regularity;
    if (Math.abs(r) > 0.001) return r;
    return b.fires - a.fires;
  });
  return out.slice(0, limit);
}

void ENV_PRECEDENCE; // reserved for future env-precedence sort
