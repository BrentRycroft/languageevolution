import type { Phoneme } from "../types";

export const VOWELS: ReadonlySet<Phoneme> = new Set([
  "a", "e", "i", "o", "u", "ɛ", "ɔ", "ə", "aː", "eː", "iː", "oː", "uː",
]);

export const CONSONANTS: ReadonlySet<Phoneme> = new Set([
  "p", "b", "t", "d", "k", "g",
  "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h",
  "m", "n", "ŋ", "l", "r", "w", "j",
  "tʃ", "dʒ",
]);

export function isVowel(p: Phoneme): boolean {
  return VOWELS.has(p);
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
