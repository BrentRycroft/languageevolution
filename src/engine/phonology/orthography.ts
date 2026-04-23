import type { Language, Phoneme, WordForm } from "../types";
import type { Rng } from "../rng";
import { stripTone } from "./tone";

/**
 * Default orthography: IPA phonemes romanised into the 26 basic Latin
 * letters + common diacritics (acute, grave, circumflex, macron, caron,
 * tilde, diaeresis). Nothing outside that — clicks and glottal stops
 * get their nearest Latin approximation rather than punctuation so the
 * output is always legible as writing.
 *
 * The goal isn't perfect transliteration — it's a visibly distinct
 * spelling stratum that can drift independently of the phonology.
 */
export const DEFAULT_ORTHOGRAPHY: Record<Phoneme, string> = {
  "θ": "th",
  "ð": "dh",
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
  "ɛ": "e",
  "ɔ": "o",
  "ə": "e",
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
  // Glottal stop: use "q" as its Latin-letter stand-in (attested in
  // Polynesian-style romanisations of the glottal stop) rather than
  // apostrophe, which isn't a letter.
  "ʔ": "q",
  "ⁿ": "n",
  // Clicks are rare; give each a one-letter Latin stand-in rather than
  // punctuation. Users in click-bearing languages can remap via the
  // per-language `orthography` field.
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
  "kʷ": "kw",
  "gʷ": "gw",
  "g̑": "g",
  "kj": "ky",
  "gj": "gy",
  "tj": "ty",
  "dj": "dy",
  // PIE aspirated stops: Romanised with digraph <h> as is traditional.
  "bʰ": "bh",
  "dʰ": "dh",
  "gʰ": "gh",
  "ǵʰ": "gh",
  "gʷʰ": "gwh",
  // Long vowels.
  "aː": "aa",
  "eː": "ee",
  "iː": "ii",
  "oː": "oo",
  "uː": "uu",
};

/**
 * Map an IPA tone mark onto a Latin combining diacritic so the
 * romanisation stays within the 26-letter alphabet plus diacritics.
 * Returns an empty string for unknown tones so we never leak a raw
 * IPA glyph.
 */
function toneToLatinDiacritic(tone: string): string {
  switch (tone) {
    case "˥":
      return "́"; // combining acute → high
    case "˩":
      return "̀"; // combining grave → low
    case "˧":
      return ""; // mid tone: unmarked
    case "˧˥":
      return "̌"; // caron → rising
    case "˥˩":
      return "̂"; // circumflex → falling
    default:
      return "";
  }
}

/**
 * Final pass over the romanised string: anything outside the 26-letter
 * Latin alphabet (plus the combining diacritics we explicitly use and
 * ASCII whitespace/punctuation) is stripped. Without this, unmapped
 * phonemes would leak raw IPA into the romanisation.
 */
const LATIN_LETTER = /[A-Za-z]/;
const COMBINING_DIACRITIC = /[̀-ͯ]/; // combining marks block
function sanitizeLatin(s: string): string {
  let out = "";
  // Iterate by code point so we don't cleave multi-unit combining chars.
  for (const ch of s) {
    if (LATIN_LETTER.test(ch)) {
      out += ch;
      continue;
    }
    if (COMBINING_DIACRITIC.test(ch)) {
      out += ch;
      continue;
    }
    // Precomposed Latin letters + diacritic (À, é, ñ, ū, ǎ…) live in
    // the Latin-1 Supplement / Latin Extended-A/B blocks.
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x00c0 && code <= 0x024f) ||
      (code >= 0x1e00 && code <= 0x1eff)
    ) {
      out += ch;
      continue;
    }
    // Drop everything else (IPA blocks, clicks, tone marks we haven't
    // rewritten, arrows, punctuation that doesn't belong in a word).
  }
  return out;
}

/**
 * Produce the romanized string for a form using the language's
 * orthography. The output is constrained to the 26 basic Latin letters
 * plus combining diacritics (acute, grave, circumflex, macron, caron,
 * tilde, diaeresis, etc.). Any residual IPA that slips through
 * `DEFAULT_ORTHOGRAPHY` is stripped by the final `sanitizeLatin` pass.
 */
export function romanize(form: WordForm, lang: Language): string {
  let out = "";
  for (const p of form) {
    const base = stripTone(p);
    const rawTone = p.length > base.length ? p.slice(base.length) : "";
    const diacritic = toneToLatinDiacritic(rawTone);
    const letter = lang.orthography[base] ?? DEFAULT_ORTHOGRAPHY[base] ?? base;
    // Attach the tone diacritic to the FIRST letter of the romanised
    // segment (so "tá˥" → "tá", not "táˊ" at the end).
    if (diacritic && letter.length > 0) {
      out += letter.charAt(0) + diacritic + letter.slice(1);
    } else {
      out += letter;
    }
  }
  return sanitizeLatin(out);
}

/**
 * Small random drift step for the orthography map — a ~1/gen probability
 * picks one phoneme whose romanization flips to a new plausible spelling.
 * Orthographies evolve slowly; this reflects the lag between speech and
 * writing reforms.
 */
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

export interface OrthographyShift {
  phoneme: Phoneme;
  from: string;
  to: string;
}

export function driftOrthography(
  lang: Language,
  rng: Rng,
  probability: number,
): OrthographyShift | null {
  if (!rng.chance(probability)) return null;
  const candidates = Object.keys(ALT_SPELLINGS);
  // Prefer phonemes actually in the language's inventory.
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
