import type { Language, WordForm } from "../types";
import type { DerivationCategory } from "./derivation";
import { otFit } from "../phonology/ot";
import { markednessOf } from "../phonology/markedness";
import { hasSyllabicNucleus } from "../phonology/wordShape";

/**
 * Phase 49: language-agnostic affix selector. Given a semantic
 * category and a stem, picks the productive affix in `lang` whose
 * concatenation with the stem scores best on phonological fit. This
 * is the output side of the abstraction split — the input parser
 * (`parseEnglishAffix`) is hardcoded English; the selector below is
 * fully language-agnostic.
 *
 * Linguistic basis: Aronoff (1976) Word Formation in Generative
 * Grammar — word-formation rules operate on abstract semantic
 * categories with phonologically conditioned allomorphs. Hammond
 * (1988) / Anttila (2002) on rivalry: when two affixes compete in
 * the same semantic slot, phonological fit selects between them.
 *
 * Scoring weights are deliberately simple and tunable. A single test
 * with two candidate suffixes whose only difference is a coda
 * cluster is enough to verify the OT term swings the choice.
 */

interface AffixCandidate {
  affix: WordForm;
  tag: string;
  position: "prefix" | "suffix";
  usageCount: number;
}

/**
 * Score a candidate result. Higher is better. Components:
 *   - phonotacticFit  : 1 if the result has a syllabic nucleus, else 0.
 *                       Hard constraint — can't pronounce a non-syllabic
 *                       result.
 *   - otFit           : exp(-otScore/1.2) ∈ (0,1], existing OT score.
 *   - 1-boundaryPen   : how unmarked the segments at the stem-affix
 *                       boundary are.
 *   - usageBias       : capped Bybee-style frequency tiebreaker.
 *
 * Weights (0.45 / 0.45 / 0.10 / 0.05) chosen so phonotactic legality
 * and OT fit dominate, with markedness of the boundary as a tiebreaker
 * and usage count as a final nudge.
 */
function scoreCandidate(
  candidate: AffixCandidate,
  stem: WordForm,
  lang: Language,
): number {
  const result = candidate.position === "suffix"
    ? [...stem, ...candidate.affix]
    : [...candidate.affix, ...stem];
  const phonotacticFit = hasSyllabicNucleus(result) ? 1 : 0;
  const otFitScore = otFit(result, lang);
  const boundaryIdx = candidate.position === "suffix"
    ? stem.length - 1
    : candidate.affix.length - 1;
  const left = result[boundaryIdx];
  const right = result[boundaryIdx + 1];
  const boundaryPen = left && right
    ? Math.min(1, (markednessOf(left) + markednessOf(right)) / 2)
    : 0;
  const usageBias = Math.min(1, (candidate.usageCount ?? 0) / 20);
  return (
    0.45 * phonotacticFit
    + 0.45 * otFitScore
    + 0.10 * (1 - boundaryPen)
    + 0.05 * usageBias
  );
}

/**
 * Pick the productive affix in `lang.derivationalSuffixes` whose
 * concatenation with `stem` scores highest, restricted to the
 * requested category and position.
 *
 * Returns null when no productive affix exists in the category — the
 * caller should treat that as "this language can't realise this
 * derivation" and fall back to the next resolution rung.
 */
export function selectAffixForCategory(
  lang: Language,
  category: DerivationCategory,
  stem: WordForm,
  position: "prefix" | "suffix",
): { affix: WordForm; tag: string; position: "prefix" | "suffix" } | null {
  const all = lang.derivationalSuffixes;
  if (!all || all.length === 0) return null;
  const candidates: AffixCandidate[] = [];
  for (const s of all) {
    if (!s.affix || s.affix.length === 0) continue;
    if (s.productive !== true) continue;
    if (s.category !== category) continue;
    const candPos: "prefix" | "suffix" =
      s.position
      ?? (s.tag.endsWith("-") && !s.tag.startsWith("-") ? "prefix" : "suffix");
    if (candPos !== position) continue;
    candidates.push({
      affix: s.affix,
      tag: s.tag,
      position: candPos,
      usageCount: s.usageCount ?? 0,
    });
  }
  if (candidates.length === 0) return null;

  let best: AffixCandidate | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score = scoreCandidate(c, stem, lang);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  if (!best) return null;
  return { affix: best.affix.slice(), tag: best.tag, position: best.position };
}
