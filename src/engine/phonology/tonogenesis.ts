import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { isVowel } from "./ipa";
import { HIGH, LOW, toneOf, stripTone, capToneStacking } from "./tone";
import { VOICED_OBSTRUENTS, VOICELESS_OBSTRUENTS } from "./inventory";
import { lexIds, lexFormById, lexSetFormById } from "../lexicon/access";
import { orderedLexemeIds } from "../lexicon/lexemeIdentity";

/**
 * tonogenesis.ts — ask #7 (realism overhaul §4).
 *
 * Tonogenesis as a LANGUAGE-LEVEL regime shift (non-tonal → tonal), NOT
 * a per-word drift. The historical mechanism was a per-word sound-change
 * rule (`tonogenesis.voiced_coda`) firing at ~0.04/word in any language
 * with a voicing-contrasting coda — which sprinkled random tones across
 * otherwise non-tonal lexicons ("5% of English words have a tone"). Phase
 * 31c plugged that leak by disabling the per-word rule for non-tonal
 * languages, but that left tonogenesis-the-PROCESS dead (a non-tonal
 * language could never bootstrap its first tone).
 *
 * This module reinstates the process properly, behind the
 * `config.modes.tonogenesis` toggle (default OFF). When the toggle is on,
 * a non-tonal language whose lexicon carries a robust word-final
 * voicing contrast on coda obstruents may, with low per-generation
 * probability, undergo a one-shot transphonologisation: the vowel before
 * a voiced-obstruent coda lowers (˩), the vowel before a voiceless-
 * obstruent coda raises (˥), and the now-redundant coda voicing contrast
 * is free to neutralise afterwards. After the cascade the language's
 * `refreshInventory` reclassifies it as tonal.
 *
 * Linguistic basis: Haudricourt (1954); the classic Vietnamese / Lhasa
 * Tibetan / Punjabi pathway — transphonologisation of a laryngeal /
 * voicing contrast into a pitch contrast. The conditioning environment
 * is REAL (it reads the actual coda inventory of the lexicon), and the
 * shift is a single regime flip, not stochastic per-word sprinkling.
 */

/** Minimum number of words exhibiting a final-obstruent coda of EACH
 *  voicing value for the contrast to count as "robust" — a handful of
 *  accidental codas should not actuate a whole-language regime shift. */
const MIN_CONTRAST_WORDS = 6;

/** Minimum share of the eligible (vowel + final obstruent) lexicon that
 *  must carry the contrasting environment. */
const MIN_CONTRAST_SHARE = 0.12;

/** Per-language per-generation probability that a language meeting the
 *  conditioning environment actually actuates the split. Tonogenesis is
 *  a rare, punctuated event in real diachrony, so this is deliberately
 *  small; the contrast usually has to persist for many generations
 *  before the language tips over. */
const TONOGENESIS_ACTUATION_PROB = 0.02;

export interface TonogenesisResult {
  /** Number of words that received a tone in the cascade. */
  toned: number;
  /** Words whose final vowel went LOW (preceding a voiced coda). */
  lowered: number;
  /** Words whose final vowel went HIGH (preceding a voiceless coda). */
  raised: number;
}

/** Classify the conditioning coda of a word: the last segment must be a
 *  coda obstruent and the segment before it a (untoned) vowel. Returns
 *  "voiced" / "voiceless" for an obstruent coda, else null. */
function conditioningCoda(form: WordForm): "voiced" | "voiceless" | null {
  if (form.length < 2) return null;
  const last = form[form.length - 1]!;
  const prev = form[form.length - 2]!;
  if (!isVowel(stripTone(prev))) return null;
  if (toneOf(prev)) return null;
  if (VOICED_OBSTRUENTS.has(last)) return "voiced";
  if (VOICELESS_OBSTRUENTS.has(last)) return "voiceless";
  return null;
}

/**
 * Attempt a language-level tonogenesis regime shift. Returns a result
 * describing the cascade if it actuated this generation, else null.
 *
 * Callers MUST gate this on `config.modes.tonogenesis` — when the toggle
 * is off this function is never invoked, keeping behaviour byte-identical
 * to the no-tonogenesis baseline.
 *
 * Only non-tonal languages are eligible: this is the PROCESS of becoming
 * tonal. Already-tonal languages (e.g. a `seedToneRegime: "tonal"`
 * preset) keep their tone via the existing maintenance machinery and are
 * left untouched here.
 */
export function maybeTonogenesis(
  lang: Language,
  rng: Rng,
): TonogenesisResult | null {
  if ((lang.toneRegime ?? "non-tonal") !== "non-tonal") return null;

  // Measure the conditioning environment across the lexicon. `lexIds`
  // is insertion-ordered, not sorted; we only COUNT here (order-
  // insensitive), so no sort is needed for this pass.
  let voiced = 0;
  let voiceless = 0;
  let eligible = 0;
  for (const id of lexIds(lang)) {
    const form = lexFormById(lang, id)!;
    if (form.length >= 2 && isVowel(stripTone(form[form.length - 2]!))) {
      eligible++;
    }
    const c = conditioningCoda(form);
    if (c === "voiced") voiced++;
    else if (c === "voiceless") voiceless++;
  }
  if (eligible === 0) return null;
  // A true split needs BOTH series present (the contrast must exist) and
  // a meaningful share of the lexicon to carry it.
  if (voiced < MIN_CONTRAST_WORDS || voiceless < MIN_CONTRAST_WORDS) return null;
  const share = (voiced + voiceless) / eligible;
  if (share < MIN_CONTRAST_SHARE) return null;

  // Rare actuation: roll once per language per generation.
  if (!rng.chance(TONOGENESIS_ACTUATION_PROB)) return null;

  // Cascade: transphonologise the coda voicing contrast into a pitch
  // contrast on the preceding vowel. Iterate in the canonical sorted
  // LexemeId order (S5) so the regime flip is deterministic regardless
  // of lexicon insertion order (this rewrites forms, an order-sensitive
  // mutation).
  let lowered = 0;
  let raised = 0;
  for (const id of orderedLexemeIds(lang.lexemes)) {
    const form = lexFormById(lang, id)!;
    const c = conditioningCoda(form);
    if (!c) continue;
    const tone = c === "voiced" ? LOW : HIGH;
    const next = form.slice();
    const idx = next.length - 2;
    next[idx] = capToneStacking(next[idx]! + tone);
    lexSetFormById(lang, id, next);
    if (c === "voiced") lowered++;
    else raised++;
  }
  const toned = lowered + raised;
  if (toned === 0) return null;
  return { toned, lowered, raised };
}
