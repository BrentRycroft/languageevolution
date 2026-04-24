import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";

/**
 * Morphological reanalysis: a fossilised compound gets re-segmented
 * and one of its parts becomes a productive derivational suffix.
 * Classic case: English "ham + burger" (originally Hamburg-er, "from
 * Hamburg") → reanalysed "ham + burger" so "burger" is now a free
 * morpheme. Another: French "déconfiture" → "dé + confiture" so
 * "dé-" became a productive negative prefix.
 *
 * In the simulator we look for compound meanings (those that contain
 * a hyphen, e.g. "water-er", "stone-foot") and occasionally promote
 * the second component into the language's `derivationalSuffixes`
 * list. The compound stays in the lexicon — only the suffix is now
 * available for new coinages too.
 */

export interface ReanalysisEvent {
  source: Meaning;
  promotedTag: string;
  affix: WordForm;
}

/**
 * Try one reanalysis event. Returns null if no compound is
 * available, or the trailing slice can't form a sensible suffix.
 */
export function maybeReanalyse(
  lang: Language,
  rng: Rng,
  probability: number,
): ReanalysisEvent | null {
  if (!rng.chance(probability)) return null;
  // Candidates: meanings keyed `a-b` where both `a` and `b` exist
  // (or the compound was coined from them) and the resulting suffix
  // would be at least 1 phoneme long.
  const compounds: Meaning[] = [];
  for (const m of Object.keys(lang.lexicon)) {
    if (!m.includes("-")) continue;
    const parts = m.split("-");
    if (parts.length !== 2) continue;
    if (!parts[0] || !parts[1]) continue;
    compounds.push(m);
  }
  if (compounds.length === 0) return null;
  const source = compounds[rng.int(compounds.length)]!;
  const sourceForm = lang.lexicon[source]!;
  // Pull off the trailing 2-3 phonemes as the new affix. Don't
  // promote longer chunks — those don't survive as productive
  // suffixes in attested cases.
  const len = sourceForm.length;
  if (len < 3) return null;
  const affixLen = Math.min(3, Math.max(2, Math.floor(len / 2)));
  const affix = sourceForm.slice(len - affixLen);
  // Generate a tag from the second part of the compound name.
  const parts = source.split("-");
  const tag = `-${parts[1]}`;
  // Skip if the language already has this tag.
  const existing = lang.derivationalSuffixes ?? [];
  if (existing.some((s) => s.tag === tag)) return null;
  if (!lang.derivationalSuffixes) lang.derivationalSuffixes = [];
  lang.derivationalSuffixes.push({ affix: affix.slice(), tag });
  return { source, promotedTag: tag, affix: affix.slice() };
}
