import type { Language, Phoneme, WordForm } from "../types";
import type { Rng } from "../rng";
import { stripTone } from "./tone";

/**
 * Default orthography: IPA phonemes romanised into ASCII / near-ASCII.
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
  "ʔ": "'",
  "ⁿ": "n",
  "ǀ": "|",
  "ǃ": "!",
  "ǂ": "+",
  "ǁ": "||",
  "ʘ": "o",
  "h₁": "h",
  "h₂": "h",
  "h₃": "h",
  "r̥": "r",
  "l̥": "l",
  "m̥": "m",
  "n̥": "n",
  "w̥": "w",
  "y̥": "y",
  "ḱ": "k",
  "ǵ": "g",
  "kʷ": "kw",
  "gʷ": "gw",
  "g̑": "g",
  "kj": "ky",
  "gj": "gy",
  "tj": "ty",
  "dj": "dy",
  "aː": "aa",
  "eː": "ee",
  "iː": "ii",
  "oː": "oo",
  "uː": "uu",
};

/** Produce the romanized string for a form using the language's orthography. */
export function romanize(form: WordForm, lang: Language): string {
  let out = "";
  for (const p of form) {
    const base = stripTone(p);
    // Honour tone in the romanization only with an accent if present.
    const tone = p.length > base.length ? p.slice(base.length) : "";
    const letter = lang.orthography[base] ?? DEFAULT_ORTHOGRAPHY[base] ?? base;
    out += letter + tone;
  }
  return out;
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
