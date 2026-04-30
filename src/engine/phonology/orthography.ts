import type { Language, Phoneme, WordForm } from "../types";
import type { Rng } from "../rng";
import { stripTone } from "./tone";

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
  "aː": "aa",
  "eː": "ee",
  "iː": "ii",
  "oː": "oo",
  "uː": "uu",
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

export function romanize(form: WordForm, lang: Language): string {
  let out = "";
  for (const p of form) {
    const base = stripTone(p);
    const rawTone = p.length > base.length ? p.slice(base.length) : "";
    const diacritic = toneToLatinDiacritic(rawTone);
    const letter = lang.orthography[base] ?? DEFAULT_ORTHOGRAPHY[base] ?? base;
    if (diacritic && letter.length > 0) {
      out += letter.charAt(0) + diacritic + letter.slice(1);
    } else {
      out += letter;
    }
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
