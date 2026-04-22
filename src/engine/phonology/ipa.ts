import type { Phoneme } from "../types";

export const VOWELS: ReadonlySet<Phoneme> = new Set([
  "a", "e", "i", "o", "u",
  "ɛ", "ɔ", "ə", "ɨ", "ɯ", "ø", "y", "œ",
  "aː", "eː", "iː", "oː", "uː",
  "á", "é", "í", "ó", "ú",
  "à", "è", "ì", "ò", "ù",
  "â", "ê", "î", "ô", "û",
  "ā", "ē", "ī", "ō", "ū",
  "ã", "ẽ", "ĩ", "õ", "ũ",
]);

export const CONSONANTS: ReadonlySet<Phoneme> = new Set([
  "p", "b", "t", "d", "k", "g", "q", "ʔ",
  "pʰ", "tʰ", "kʰ",
  "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "ħ", "ɣ", "x", "β",
  "m", "n", "ŋ", "ɲ", "ɳ",
  "l", "r", "ɾ", "ɹ", "ʀ",
  "w", "j", "ɥ",
  "tʃ", "dʒ", "ts", "dz",
  // Retroflex series
  "ʂ", "ʐ", "ʈ", "ɖ",
  // Laryngeals (PIE)
  "h₁", "h₂", "h₃",
  // Syllabic sonorants (PIE)
  "r̥", "l̥", "m̥", "n̥", "w̥", "y̥",
  // PIE palatovelars / labiovelars
  "ḱ", "ǵ", "kʷ", "gʷ", "g̑",
  // Clicks
  "ǀ", "ǃ", "ǂ", "ǁ", "ʘ",
  // Palatalized segments
  "kj", "gj", "tj", "dj",
  // Nasalization diacritic (pre-nasal cluster marker)
  "ⁿ",
]);

export function isVowel(p: Phoneme): boolean {
  if (VOWELS.has(p)) return true;
  // Handle tone-marked vowels: strip trailing tone mark and re-check.
  const toneMarks = ["˥", "˧", "˩", "˧˥", "˥˩"];
  for (const m of toneMarks) {
    if (p.endsWith(m)) {
      const base = p.slice(0, -m.length);
      if (VOWELS.has(base)) return true;
    }
  }
  return false;
}

export function isConsonant(p: Phoneme): boolean {
  return CONSONANTS.has(p);
}

const ASCII_TO_IPA: Record<string, Phoneme> = {
  th: "θ",
  dh: "ð",
  sh: "ʃ",
  zh: "ʒ",
  ch: "tʃ",
  jh: "dʒ",
  ng: "ŋ",
  aa: "aː",
  ee: "eː",
  ii: "iː",
  oo: "oː",
  uu: "uː",
  eh: "ɛ",
  oh: "ɔ",
};

export function asciiToIpa(s: string): Phoneme {
  return ASCII_TO_IPA[s] ?? s;
}

export function formToString(form: Phoneme[]): string {
  return form.join("");
}

export function levenshtein(a: Phoneme[], b: Phoneme[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1,
        prev[j]! + 1,
        prev[j - 1]! + cost,
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]!;
  }
  return prev[n]!;
}

/**
 * ASCII-ify a string for export formats (Newick) that dislike IPA characters.
 * Replaces each non-ASCII character with a URL-encoded percent-escape, and
 * strips structural characters that would break the grammar.
 */
export function sanitizeForNewick(s: string): string {
  return Array.from(s)
    .map((ch) => {
      if (/[(),:;\s]/.test(ch)) return "_";
      if (ch.charCodeAt(0) < 128) return ch;
      return "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
}
