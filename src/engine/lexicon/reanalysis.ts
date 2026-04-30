import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";

export interface ReanalysisEvent {
  source: Meaning;
  promotedTag: string;
  affix: WordForm;
}

export function maybeReanalyse(
  lang: Language,
  rng: Rng,
  probability: number,
): ReanalysisEvent | null {
  if (!rng.chance(probability)) return null;
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
  const len = sourceForm.length;
  if (len < 3) return null;
  const affixLen = Math.min(3, Math.max(2, Math.floor(len / 2)));
  const affix = sourceForm.slice(len - affixLen);
  const parts = source.split("-");
  const tag = `-${parts[1]}`;
  const existing = lang.derivationalSuffixes ?? [];
  if (existing.some((s) => s.tag === tag)) return null;
  if (!lang.derivationalSuffixes) lang.derivationalSuffixes = [];
  lang.derivationalSuffixes.push({ affix: affix.slice(), tag });
  return { source, promotedTag: tag, affix: affix.slice() };
}
