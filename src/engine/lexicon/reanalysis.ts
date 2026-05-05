import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";
import { posOf } from "./pos";

export interface ReanalysisEvent {
  source: Meaning;
  promotedTag: string;
  affix: WordForm;
}

const GRAMMATICAL_VERB_PATHWAYS: Record<string, string> = {
  // Cross-linguistic cycles: motion verb → future marker (English
  // "going to → -gonna"), possession verb → perfect (Latin "habere →
  // Romance perfects), copula → progressive (English "be V-ing").
  go: "verb.tense.fut",
  come: "verb.tense.fut",
  have: "verb.aspect.perf",
  be: "verb.aspect.prog",
};

function maybeCompoundReanalysis(
  lang: Language,
  rng: Rng,
): ReanalysisEvent | null {
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

/**
 * Phase 28e: grammaticalise a high-frequency verb into an inflectional
 * paradigm. Models the analytic-→-synthetic side of the
 * grammaticalisation cycle:
 *   English "going to" → "gonna" → future inflection
 *   Latin "habere" → Romance perfect endings (-ai/-as/-a/...)
 *   English "be V-ing" → progressive aspect
 *
 * Only triggers in tier 1+ languages whose lexicon still contains an
 * unbleached source verb at high frequency. The grammaticalised
 * form lives in `lang.morphology.paradigms` so the inflection
 * pipeline picks it up; the source verb is left in place (the cycle
 * preserves the word as a content lexeme in parallel with its new
 * grammatical role — exactly how English "going" still means motion
 * even after "gonna" became a future marker).
 */
function maybeVerbGrammaticalization(
  lang: Language,
  rng: Rng,
): ReanalysisEvent | null {
  if ((lang.culturalTier ?? 0) < 1) return null;
  if (!lang.morphology?.paradigms) return null;
  const candidates: Array<{ meaning: Meaning; tag: string }> = [];
  for (const [meaning, tag] of Object.entries(GRAMMATICAL_VERB_PATHWAYS)) {
    if (!lang.lexicon[meaning]) continue;
    if (posOf(meaning) !== "verb") continue;
    const freq = lang.wordFrequencyHints[meaning] ?? 0;
    if (freq < 0.7) continue;
    if (lang.morphology.paradigms[tag as keyof typeof lang.morphology.paradigms]) continue;
    candidates.push({ meaning, tag });
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[rng.int(candidates.length)]!;
  const sourceForm = lang.lexicon[chosen.meaning]!;
  const len = sourceForm.length;
  if (len < 2) return null;
  // Take the last 1-2 phonemes as the new inflection. Models the
  // erosion-on-grammaticalization pattern: "going to" → "-gonna".
  const affixLen = Math.min(2, len);
  const affix = sourceForm.slice(len - affixLen);
  lang.morphology.paradigms[chosen.tag as keyof typeof lang.morphology.paradigms] = {
    affix: affix.slice(),
    position: "suffix",
    category: chosen.tag as never,
  };
  return {
    source: chosen.meaning,
    promotedTag: chosen.tag,
    affix: affix.slice(),
  };
}

/**
 * Phase 36 Tranche 36p: detect shared edge sequences across
 * fossilised compounds and promote them to productive bound
 * morphemes. When ≥ 3 fossilised compounds share the same trailing
 * 1-3 segments, that string becomes a candidate derivational suffix
 * registered in `lang.boundMorphemes` and `lang.derivationalSuffixes`.
 *
 * Models the iterative reanalysis loop: univerbation produces
 * fossilised compounds, which then template a new derivational
 * morpheme, which then becomes available to coin further words.
 */
function detectReanalysisTemplate(
  lang: Language,
  rng: Rng,
): ReanalysisEvent | null {
  const compounds = lang.compounds;
  if (!compounds) return null;
  const fossilised: Array<{ meaning: string; form: WordForm }> = [];
  for (const meaning of Object.keys(compounds)) {
    const meta = compounds[meaning]!;
    if (!meta.fossilized) continue;
    const form = lang.lexicon[meaning];
    if (!form || form.length < 3) continue;
    fossilised.push({ meaning, form });
  }
  if (fossilised.length < 3) return null;

  // Tally trailing 2- and 3-segment suffixes across the fossilised
  // pool. A suffix attested in ≥ 3 distinct compounds is a template.
  const suffixCounts = new Map<string, { count: number; affix: WordForm }>();
  for (const { form } of fossilised) {
    for (const len of [2, 3]) {
      if (form.length <= len) continue;
      const tail = form.slice(form.length - len);
      const key = tail.join("|");
      const existing = suffixCounts.get(key);
      if (existing) existing.count++;
      else suffixCounts.set(key, { count: 1, affix: tail });
    }
  }
  const candidates = Array.from(suffixCounts.values()).filter((c) => c.count >= 3);
  if (candidates.length === 0) return null;

  const chosen = candidates[rng.int(candidates.length)]!;
  const tag = `-${chosen.affix.join("")}.reanalysed`;

  // Skip if already registered.
  const existing = lang.derivationalSuffixes ?? [];
  if (existing.some((s) => s.tag === tag)) return null;

  if (!lang.derivationalSuffixes) lang.derivationalSuffixes = [];
  lang.derivationalSuffixes.push({ affix: chosen.affix.slice(), tag });

  // Register as a bound morpheme so productive derivation can use
  // it via the genesis pathway.
  if (!lang.boundMorphemes) lang.boundMorphemes = new Set();
  if (!lang.lexicon[tag]) {
    lang.lexicon[tag] = chosen.affix.slice();
    lang.boundMorphemes.add(tag);
    if (!lang.boundMorphemeOrigin) lang.boundMorphemeOrigin = {};
    lang.boundMorphemeOrigin[tag] = {
      introducedGen: 0,
      pathway: "reanalysis-template",
    };
  }

  return { source: tag, promotedTag: tag, affix: chosen.affix.slice() };
}

export function maybeReanalyse(
  lang: Language,
  rng: Rng,
  probability: number,
): ReanalysisEvent | null {
  if (!rng.chance(probability)) return null;
  // Try grammaticalization first (rarer, more impactful); fall back
  // to compound reanalysis, then iterative reanalysis from fossilised
  // compounds.
  if (rng.chance(0.4)) {
    const grammaticalized = maybeVerbGrammaticalization(lang, rng);
    if (grammaticalized) return grammaticalized;
  }
  const compoundReanalysed = maybeCompoundReanalysis(lang, rng);
  if (compoundReanalysed) return compoundReanalysed;
  // Phase 36 Tranche 36p: try the fossilised-compound template path.
  return detectReanalysisTemplate(lang, rng);
}
