/**
 * Phase 48 D4-B: cross-linguistic markedness scores per phoneme.
 *
 * Linguistic basis: Greenberg 1966 ("Language Universals"); Jakobson
 * 1941 ("Kindersprache, Aphasie und allgemeine Lautgesetze");
 * Maddieson 1984 ("Patterns of Sounds"); PHOIBLE 2.0 (Moran &
 * McCloy 2019). Marked phonemes are typologically rarer
 * cross-linguistically AND more prone to merger, loss, or
 * lenition diachronically. Unmarked phonemes resist these changes
 * and are more often the OUTPUT of sound-change rules.
 *
 * Scores in [0, 1]:
 *   0.0  — universal core (almost every language has it)
 *   0.1  — very common
 *   0.3  — common but not universal (English-style fricatives)
 *   0.4  — less common (ŋ, ɲ, ʔ)
 *   0.7  — marked (ɸ, ʝ, χ, ʁ, ʕ, retroflex)
 *   0.9  — very marked (clicks, implosives, ejectives, lateral
 *           fricatives, lateral approximants)
 *
 * Used by `apply.ts` to bias rule selection:
 *   - Rules eliminating a marked segment fire MORE often (boosted by
 *     ~0.5×markedness).
 *   - Rules producing a marked segment fire LESS often (damped by
 *     ~0.5×markedness).
 *
 * Numbers are approximations of PHOIBLE typology data, not exact.
 * Refining against PHOIBLE-derived constants is future work; the
 * direction-of-bias is what matters for "outputs feel typologically
 * plausible".
 */

import type { Phoneme } from "../primitives";

/**
 * Markedness map. Phonemes not in the map default to MARKEDNESS_DEFAULT.
 * The default is intentionally low so that unfamiliar phonemes
 * (e.g., simulator-internal placeholders) don't get hyper-biased.
 */
export const MARKEDNESS_DEFAULT = 0.2;

const MARKEDNESS: Readonly<Record<Phoneme, number>> = {
  // Universal core consonants
  p: 0.0, t: 0.0, k: 0.0, m: 0.0, n: 0.0,
  // Very common
  b: 0.1, d: 0.1, g: 0.1, s: 0.1, f: 0.1, l: 0.1, r: 0.1, ɹ: 0.15,
  w: 0.1, j: 0.1, h: 0.1,
  // Common but not universal — English-style fricatives + affricates
  v: 0.3, z: 0.3, ʃ: 0.3, ʒ: 0.4, θ: 0.6, ð: 0.6, "tʃ": 0.3, "dʒ": 0.4,
  ts: 0.3, dz: 0.4,
  // Less common — uvular q, glottal stop, palatal nasal, velar nasal
  q: 0.5, ʔ: 0.4, ŋ: 0.4, ɲ: 0.4,
  // Aspirated stops (Hindi, Korean, Mandarin)
  pʰ: 0.3, tʰ: 0.3, kʰ: 0.3,
  // Voiced aspirated (Indo-Aryan only — quite marked)
  bʰ: 0.7, dʰ: 0.7, gʰ: 0.7, gʷʰ: 0.85, gʲʰ: 0.85,
  // Ejectives (Caucasian, !Xóõ, Salishan)
  pʼ: 0.8, tʼ: 0.8, kʼ: 0.8, qʼ: 0.85, tsʼ: 0.85, "tʃʼ": 0.85,
  // Glottalized
  ʔp: 0.85, ʔt: 0.85, ʔk: 0.85,
  // Voiced implosives (Khoisan, some Niger-Congo)
  ɓ: 0.85, ɗ: 0.85, ʄ: 0.9, ɠ: 0.9, ʛ: 0.95,
  // Retroflex
  ʈ: 0.7, ɖ: 0.7, ɳ: 0.7, ɽ: 0.85, ʂ: 0.7, ʐ: 0.75, ɻ: 0.85, ɭ: 0.85,
  // Palatal stops + fricatives
  c: 0.6, ɟ: 0.7, ç: 0.6, ʝ: 0.7, ʎ: 0.85,
  // Uvular fricatives
  χ: 0.5, ʁ: 0.5,
  // Pharyngeal + glottal voiced
  ħ: 0.7, ʕ: 0.7, ɦ: 0.5,
  // Bilabial fricatives + tap + trill
  ɸ: 0.7, β: 0.6, ʙ: 0.95,
  // Velar/uvular nasals
  ɴ: 0.9,
  // Labiodental nasal/tap
  ɱ: 0.8, ⱱ: 0.95,
  // Velar fricative (Greek χ, Spanish j) — common enough
  x: 0.4, ɣ: 0.5,
  // Lateral fricatives (Welsh ll, Zulu, Navajo)
  ɬ: 0.85, ɮ: 0.95,
  // Velar lateral
  ʟ: 0.95,
  // Velar approximant
  ɰ: 0.9,
  // Labiodental approximant
  ʋ: 0.6,
  // Other approximants
  ɥ: 0.85,
  // Trills (alveolar trill is moderately common; uvular trill is rare)
  ʀ: 0.7, ɾ: 0.3,
  // Click consonants
  ǀ: 0.95, ǃ: 0.95, ǂ: 0.95, ǁ: 0.95, ʘ: 0.97,
  // Labialized stops/fricatives (PIE-style)
  kʷ: 0.5, gʷ: 0.5, xʷ: 0.6,
  // Palatalized stops (PIE-style)
  kʲ: 0.5, gʲ: 0.5, tʲ: 0.5, dʲ: 0.5,
  // Prenasalized stops (Bantu, Austronesian)
  "ⁿp": 0.7, "ⁿb": 0.7, "ⁿt": 0.7, "ⁿd": 0.7, "ⁿk": 0.7, "ⁿg": 0.7, "ⁿj": 0.85,

  // Universal core vowels
  a: 0.0, i: 0.0, u: 0.0, e: 0.05, o: 0.05,
  // Length-marked
  "aː": 0.15, "eː": 0.2, "iː": 0.15, "oː": 0.2, "uː": 0.15,
  // Common but not universal
  ɛ: 0.2, ɔ: 0.2, ə: 0.15,
  // Front rounded (typologically marked)
  y: 0.7, ø: 0.7, œ: 0.85, ʏ: 0.75,
  // Lax / near-close
  ɪ: 0.2, ʊ: 0.3,
  // Open
  æ: 0.3, ɑ: 0.2, ɒ: 0.6, ʌ: 0.5,
  // Central
  ɨ: 0.5, ɯ: 0.6, ɘ: 0.85, ɵ: 0.9, ɤ: 0.7, ɞ: 0.95, ɜ: 0.9, ɐ: 0.6,
  ɶ: 0.97, ä: 0.7,
  // Nasal vowels (French, Portuguese)
  "ã": 0.5, "ẽ": 0.6, "ĩ": 0.6, "õ": 0.5, "ũ": 0.6,
  "ɛ̃": 0.5, "ɔ̃": 0.5, "ɑ̃": 0.5, "œ̃": 0.85,
};

/**
 * Look up a phoneme's markedness score. Strips tone diacritics first
 * (markedness is segmental, not tonal).
 */
export function markednessOf(p: Phoneme): number {
  if (p in MARKEDNESS) return MARKEDNESS[p]!;
  // Strip a single trailing tone mark (˥ ˧ ˩ etc.) and retry.
  const stripped = p.replace(/[˥˦˧˨˩]+$/, "");
  if (stripped !== p && stripped in MARKEDNESS) return MARKEDNESS[stripped]!;
  return MARKEDNESS_DEFAULT;
}

/**
 * Compute the markedness change for a sound change that maps `before`
 * → `after`. Positive ⇒ change ELIMINATES marked segments (boost
 * desirable); negative ⇒ change INTRODUCES marked segments (damp
 * application).
 *
 * Sums per-segment markedness over both forms, returns the delta.
 */
export function markednessDelta(before: Phoneme[], after: Phoneme[]): number {
  let sumBefore = 0;
  let sumAfter = 0;
  for (const p of before) sumBefore += markednessOf(p);
  for (const p of after) sumAfter += markednessOf(p);
  return sumBefore - sumAfter;
}
