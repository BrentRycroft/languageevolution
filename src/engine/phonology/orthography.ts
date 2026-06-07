import type { Language, Phoneme, WordForm } from "../types";
import { satGet } from "../lexicon/satellites";
import type { Rng } from "../rng";
import { stripTone } from "./tone";
import { lexGet, lexKeys } from "../lexicon/access";
import { featuresOf } from "./features";

/**
 * orthography.ts
 *
 * Phonological feature geometry, sound-change rules, syllable shape, stress, tone, sandhi, and inventory homeostasis. Key exports: DEFAULT_ORTHOGRAPHY, romanize, seedTierTwoOrthography.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const DEFAULT_ORTHOGRAPHY: Record<Phoneme, string> = {
  "θ": "th",
  "ð": "th",
  "ʃ": "sh",
  "ʒ": "zh",
  "ŋ": "ng",
  "ɲ": "ny",
  "ɳ": "rn",
  "ʂ": "sh",
  "ʐ": "zh",
  "ʈ": "tr",
  "ɖ": "dr",
  "tʃ": "ch",
  "dʒ": "j",
  "ts": "ts",
  "dz": "dz",
  "j": "y",
  "ɛ": "e",
  "ɔ": "o",
  "ə": "e",
  "ʌ": "u",
  "æ": "a",
  "ɪ": "i",
  "ʊ": "oo",
  "ɑ": "a",
  "ɒ": "o",
  "ʏ": "y",
  "ɨ": "y",
  "ɯ": "u",
  "ø": "oe",
  "y": "y",
  "œ": "oe",
  "ħ": "hh",
  "ɣ": "gh",
  "ʀ": "r",
  "ɹ": "r",
  "ɾ": "r",
  "β": "v",
  "ʔ": "q",
  "ⁿ": "n",
  "ǀ": "c",
  "ǃ": "q",
  "ǂ": "ch",
  "ǁ": "x",
  "ʘ": "p",
  "h₁": "h",
  "h₂": "h",
  "h₃": "h",
  "r̩": "r",
  "l̩": "l",
  "m̩": "m",
  "n̩": "n",
  "r̥": "r",
  "l̥": "l",
  "m̥": "m",
  "n̥": "n",
  "w̥": "w",
  "y̥": "y",
  "ḱ": "k",
  "ǵ": "g",
  "kʲ": "ky",
  "gʲ": "gy",
  "gʲʰ": "gyh",
  "tʲ": "ty",
  "dʲ": "dy",
  "kʷ": "kw",
  "gʷ": "gw",
  "g̑": "g",
  "bʰ": "bh",
  "dʰ": "dh",
  "gʰ": "gh",
  "ǵʰ": "gh",
  "gʷʰ": "gwh",
  "aː": "a",
  "eː": "e",
  "iː": "ee",
  "oː": "o",
  "uː": "oo",
  // Lane I (2026-06): the IPA-2020 pulmonic consonants and cardinal
  // vowels added in Phase 48 (features.ts T6/T7) had no romanization,
  // so they fell through to the raw IPA glyph and were then stripped by
  // sanitizeLatin → EMPTY surface forms (vanished words). Every one
  // gets an explicit conventional Latin spelling here. The
  // feature-based fallback in romanize() is the final safety net for
  // anything still unmapped (e.g. length/nasal variants).
  "ɥ": "y",
  "c": "ky",
  "ɟ": "gy",
  "ɢ": "g",
  "ɱ": "m",
  "ɴ": "ng",
  "ʙ": "br",
  "ⱱ": "v",
  "ɽ": "r",
  "ɸ": "f",
  "ç": "h",
  "ʝ": "y",
  "χ": "kh",
  "ʁ": "r",
  "ʕ": "a",
  "ɦ": "h",
  "ɬ": "hl",
  "ɮ": "lh",
  "ʋ": "v",
  "ɻ": "r",
  "ɰ": "w",
  "ɭ": "l",
  "ʎ": "ly",
  "ʟ": "l",
  "ɓ": "b",
  "ɗ": "d",
  "ʄ": "j",
  "ɠ": "g",
  "ʛ": "g",
  "ɘ": "e",
  "ɵ": "o",
  "ɤ": "u",
  "ɞ": "oe",
  "ɜ": "e",
  "ɐ": "a",
  "ɶ": "oe",
  "ä": "a",
};

const DIPHTHONG_COMBINE_MEDIAL: Record<string, string> = {
  "a+j": "i",
  "e+j": "ay",
  "o+j": "oy",
  "i+j": "y",
  "u+j": "ui",
  "ə+j": "ay",
  "ɔ+j": "oy",
  "ɛ+j": "ay",
  "æ+j": "i",
  "ʌ+j": "i",
  "ɪ+j": "y",
  "a+w": "ow",
  "e+w": "ew",
  "o+w": "ow",
  "i+w": "ew",
  "u+w": "u",
  "ə+w": "ow",
  "ɔ+w": "ow",
  "ɛ+w": "ew",
  "æ+w": "ow",
  "ʌ+w": "ow",
};

const DIPHTHONG_COMBINE_FINAL: Record<string, string> = {
  "a+j": "y",
  "e+j": "ay",
  "o+j": "oy",
  "i+j": "y",
  "u+j": "uy",
  "ə+j": "ay",
  "ɔ+j": "oy",
  "ɛ+j": "ay",
  "æ+j": "y",
  "ʌ+j": "y",
  "ɪ+j": "y",
  "a+w": "ow",
  "e+w": "ew",
  "o+w": "ow",
  "i+w": "ew",
  "u+w": "u",
  "ə+w": "ow",
  "ɔ+w": "ow",
  "ɛ+w": "ew",
  "æ+w": "ow",
  "ʌ+w": "ow",
};

function toneToLatinDiacritic(tone: string): string {
  switch (tone) {
    case "˥":
      return "́";
    case "˩":
      return "̀";
    case "˧":
      return "";
    case "˧˥":
      return "̌";
    case "˥˩":
      return "̂";
    default:
      return "";
  }
}

const LATIN_LETTER = /[A-Za-z]/;
const COMBINING_DIACRITIC = /[̀-ͯ]/;
function sanitizeLatin(s: string): string {
  let out = "";
  for (const ch of s) {
    if (LATIN_LETTER.test(ch)) {
      out += ch;
      continue;
    }
    if (COMBINING_DIACRITIC.test(ch)) {
      out += ch;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x00c0 && code <= 0x024f) ||
      (code >= 0x1e00 && code <= 0x1eff)
    ) {
      out += ch;
      continue;
    }
  }
  return out;
}

// Lane I (2026-06): feature-based last-resort glyph. Used when a phoneme
// has no entry in the per-language or default orthography map (and its
// length-stripped base also has none). Without this, romanize() fell
// through to the raw IPA string, which sanitizeLatin then deleted —
// producing EMPTY surface forms and words that vanished from the UI.
// Every phoneme — including length-marked, nasal, and syllabic
// segments not yet in the explicit map — gets a sensible non-empty
// Latin letter here, derived from its phonological features.
const VOWEL_LETTER_BY_BACKHEIGHT: Record<string, string> = {
  "high-front": "i",
  "high-central": "i",
  "high-back": "u",
  "mid-high-front": "e",
  "mid-high-central": "e",
  "mid-high-back": "o",
  "mid-front": "e",
  "mid-central": "e",
  "mid-back": "o",
  "mid-low-front": "e",
  "mid-low-central": "e",
  "mid-low-back": "o",
  "low-front": "a",
  "low-central": "a",
  "low-back": "a",
};

const CONSONANT_LETTER_BY_PLACE: Record<string, string> = {
  labial: "p",
  labiodental: "f",
  dental: "t",
  alveolar: "t",
  postalveolar: "s",
  retroflex: "r",
  palatal: "y",
  velar: "k",
  uvular: "k",
  pharyngeal: "h",
  glottal: "h",
};

function glyphFromFeatures(f: ReturnType<typeof featuresOf>): string | undefined {
  if (!f) return undefined;
  if (f.type === "vowel") {
    return VOWEL_LETTER_BY_BACKHEIGHT[`${f.height}-${f.backness}`] ?? "a";
  }
  // consonant
  if (f.manner === "nasal") {
    return f.place === "velar" || f.place === "uvular" ? "ng" : f.place === "palatal" ? "ny" : "n";
  }
  if (f.manner === "lateral-approximant" || f.manner === "lateral-fricative") return "l";
  if (f.manner === "trill" || f.manner === "tap" || f.manner === "liquid") return "r";
  return CONSONANT_LETTER_BY_PLACE[f.place] ?? "h";
}

// Combining marks + length + modifier-letter diacritics that may sit on
// a base segment (combining tilde for nasal vowels, ː for length, the
// ̩/̥ syllabic/voiceless marks, etc.). Stripping these recovers the core
// segment so we can still spell e.g. /ɛ̃ː/ via /ɛ/.
const SEGMENT_DIACRITICS = /[̀-ͯʰ-˿ːˑ]/g;

function featureFallbackGlyph(base: Phoneme): string {
  const direct = glyphFromFeatures(featuresOf(base));
  if (direct) return direct;
  // Strip secondary diacritics and retry against the explicit map and
  // feature table on the recovered core (e.g. /ɛ̃/, /ɛ̃ː/ → /ɛ/ → "e").
  const core = base.replace(SEGMENT_DIACRITICS, "");
  if (core && core !== base) {
    const mapped = DEFAULT_ORTHOGRAPHY[core as Phoneme];
    if (mapped !== undefined) return mapped;
    const viaFeatures = glyphFromFeatures(featuresOf(core as Phoneme));
    if (viaFeatures) return viaFeatures;
    const coreLatin = sanitizeLatin(core);
    if (coreLatin.length > 0) return coreLatin;
  }
  // No features at all (truly unknown segment): keep any Latin-safe
  // characters, else emit a visible placeholder so nothing vanishes.
  const kept = sanitizeLatin(base);
  return kept.length > 0 ? kept : "'";
}

/**
 * Resolve a single phoneme `base` (tone already stripped) to a
 * guaranteed-non-empty Latin glyph. Order: per-language override →
 * default map → (length-stripped) base in either map → feature-based
 * fallback. The final fallback can never return "" so a word can never
 * lose a segment or render empty.
 */
function glyphFor(base: Phoneme, lang: Language): string {
  const direct = lang.orthography[base] ?? DEFAULT_ORTHOGRAPHY[base];
  if (direct !== undefined) return direct;
  // Preserve the historical identity path: phonemes that are already
  // plain Latin letters (p b t d k g f v s z h l r m n w …) or
  // precomposed accented/nasal vowels (á ã ē …) used to fall through to
  // the raw glyph and survive sanitizeLatin unchanged. Keep that exact
  // behaviour so only genuinely-dropped segments change.
  const selfLatin = sanitizeLatin(base);
  if (selfLatin.length > 0 && selfLatin === base) return base;
  // Length-marked vowels (əː, ɛː, ɪː, …) and other ː-suffixed segments
  // that the explicit maps only cover in their short form: reuse the
  // short-form spelling rather than dropping the whole segment.
  if (base.endsWith("ː")) {
    const short = base.slice(0, -1);
    const shortGlyph = lang.orthography[short] ?? DEFAULT_ORTHOGRAPHY[short];
    if (shortGlyph !== undefined) return shortGlyph;
  }
  return featureFallbackGlyph(base);
}

export function romanize(form: WordForm, lang: Language, meaning?: string): string {
  // Word-level lexical spelling override: if the language has frozen a
  // historical spelling for this meaning, use it verbatim. Models the
  // English pattern where "knight" stayed spelled with k-n-i-g-h-t even
  // after k-, gh deleted from pronunciation.
  if (meaning && lang.lexicalSpelling?.[meaning]) {
    return lang.lexicalSpelling[meaning]!;
  }
  let out = "";
  let i = 0;
  while (i < form.length) {
    const p = form[i]!;
    const base = stripTone(p);
    const rawTone = p.length > base.length ? p.slice(base.length) : "";
    const diacritic = toneToLatinDiacritic(rawTone);

    if (i + 1 < form.length && !lang.orthography[base]) {
      const next = stripTone(form[i + 1]!);
      const dipKey = `${base}+${next}`;
      const isFinal = i + 2 === form.length;
      const combined = isFinal
        ? DIPHTHONG_COMBINE_FINAL[dipKey]
        : DIPHTHONG_COMBINE_MEDIAL[dipKey];
      if (combined) {
        out += diacritic ? combined.charAt(0) + diacritic + combined.slice(1) : combined;
        i += 2;
        continue;
      }
    }

    const letter = glyphFor(base, lang);
    if (diacritic && letter.length > 0) {
      out += letter.charAt(0) + diacritic + letter.slice(1);
    } else {
      out += letter;
    }
    i++;
  }
  return sanitizeLatin(out);
}

const ALT_SPELLINGS: Record<Phoneme, readonly string[]> = {
  "θ": ["th", "z", "s"],
  "ð": ["dh", "d", "th"],
  "ʃ": ["sh", "sch", "ch", "x"],
  "ʒ": ["zh", "j", "g"],
  "ŋ": ["ng", "n", "gn"],
  "k": ["k", "c", "q"],
  "g": ["g", "gh"],
  "j": ["y", "j"],
  "w": ["w", "v", "u"],
  "v": ["v", "w", "f"],
  "x": ["x", "kh", "h"],
  "r̥": ["r", "rh", "rr"],
  "h": ["h", "gh"],
  "a": ["a", "á"],
  "e": ["e", "é"],
  "i": ["i", "y"],
  "u": ["u", "ou"],
};

/**
 * Phase 34 Tranche 34e: at the moment a language crosses into tier
 * 2 (literacy), its scribes commit to a writing convention by
 * picking an alternative for each phoneme that has multiple options
 * in ALT_SPELLINGS. This is what makes English's "sh" different
 * from German's "sch" different from French's "ch" different from
 * Polish's "sz" — same phoneme /ʃ/, different scribal traditions.
 * Pre-Phase-34 every language used the same DEFAULT_ORTHOGRAPHY
 * forever; only sporadic per-gen drift could create variance, and
 * only after tier 2 (which then ALREADY had no orthography seeded).
 */
export function seedTierTwoOrthography(
  lang: { orthography: Record<Phoneme, string>; phonemeInventory: { segmental: readonly Phoneme[] } },
  rng: { int: (n: number) => number },
): { adoptions: Array<{ phoneme: Phoneme; spelling: string }> } {
  const adoptions: Array<{ phoneme: Phoneme; spelling: string }> = [];
  const phonemes = Object.keys(ALT_SPELLINGS) as Phoneme[];
  for (const phoneme of phonemes) {
    if (!lang.phonemeInventory.segmental.includes(phoneme)) continue;
    if (lang.orthography[phoneme]) continue; // already settled
    const options = ALT_SPELLINGS[phoneme]!;
    if (options.length === 0) continue;
    const choice = options[rng.int(options.length)]!;
    lang.orthography[phoneme] = choice;
    adoptions.push({ phoneme, spelling: choice });
  }
  return { adoptions };
}

export interface OrthographyShift {
  phoneme: Phoneme;
  from: string;
  to: string;
}

/**
 * Tier-gated multiplier for orthographic drift probability. Tier 0/1 have
 * no writing tradition, so spelling can't lock in or drift independently
 * of sound. Tier 2 (iron-age) is the writing threshold — drift at the
 * baseline rate as scribes still adjust to the language. Tier 3 (modern,
 * with print + schools + dictionaries) DAMPENS drift: institutional
 * pressure (academies, dictionaries, schools) preserves established
 * spellings against phonological pressure (cf. English "knight",
 * French "oignon"). Phase 72a fix: pre-72a this returned 3 (3× faster
 * drift at tier 3), which inverted the historical reality. Now 0.2
 * (drift slows to 1/5 of tier-2 rate).
 */
export function tierOrthographyMultiplier(tier: number | undefined): number {
  if (tier === undefined || tier < 2) return 0;
  if (tier === 2) return 1;
  return 0.2; // tier 3+: standardised, prescriptive, drift dampened
}

export function driftOrthography(
  lang: Language,
  rng: Rng,
  probability: number,
): OrthographyShift | null {
  const tierMul = tierOrthographyMultiplier(lang.culturalTier);
  if (tierMul === 0) return null;
  if (!rng.chance(probability * tierMul)) return null;
  const candidates = Object.keys(ALT_SPELLINGS);
  const inLang = candidates.filter((p) => lang.phonemeInventory.segmental.includes(p));
  const pool = inLang.length > 0 ? inLang : candidates;
  const phoneme = pool[rng.int(pool.length)]!;
  const options = ALT_SPELLINGS[phoneme]!;
  const current = lang.orthography[phoneme] ?? DEFAULT_ORTHOGRAPHY[phoneme] ?? phoneme;
  const others = options.filter((o) => o !== current);
  if (others.length === 0) return null;
  const to = others[rng.int(others.length)]!;
  lang.orthography[phoneme] = to;
  return { phoneme, from: current, to };
}

/**
 * Per-word lexical spelling freeze — only fires for tier-3 languages.
 * Picks a high-frequency word that doesn't already have a frozen spelling
 * and captures its current romanization. From then on, romanize() will
 * return the frozen string for this meaning regardless of how the
 * phonemic form drifts.
 *
 * Returns the meaning that got frozen, or null if no eligible word found
 * (tier &lt; 3, low gate, or no high-frequency unspelled word).
 */
export function freezeLexicalSpelling(
  lang: Language,
  rng: Rng,
  probability: number,
): { meaning: string; spelling: string } | null {
  if ((lang.culturalTier ?? 0) < 3) return null;
  if (!rng.chance(probability)) return null;

  // Candidates: high-frequency meanings (>=0.6) without a frozen spelling.
  const candidates: string[] = [];
  for (const m of lexKeys(lang)) {
    if (lang.lexicalSpelling?.[m]) continue;
    const f = satGet(lang, "wordFrequencyHints", m) ?? 0.4;
    if (f >= 0.6 && lexGet(lang, m)!.length > 0) candidates.push(m);
  }
  if (candidates.length === 0) return null;

  const meaning = candidates[rng.int(candidates.length)]!;
  const form = lexGet(lang, meaning)!;
  // Capture the current romanization at this moment.
  const spelling = romanize(form, { ...lang, lexicalSpelling: undefined }, undefined);
  if (!lang.lexicalSpelling) lang.lexicalSpelling = {};
  lang.lexicalSpelling[meaning] = spelling;
  return { meaning, spelling };
}
