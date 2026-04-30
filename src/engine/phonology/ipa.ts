import type { Phoneme } from "../primitives";

export const VOWELS: ReadonlySet<Phoneme> = new Set([
  "a", "e", "i", "o", "u",
  "ɛ", "ɔ", "ə", "ɨ", "ɯ", "ø", "y", "œ",
  "æ", "ɑ", "ɒ", "ʏ", "ɪ", "ʊ",
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
  "pʼ", "tʼ", "kʼ", "qʼ", "tsʼ", "tʃʼ",
  "ʔp", "ʔt", "ʔk",
  "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "ħ", "ɣ", "x", "β",
  "m", "n", "ŋ", "ɲ", "ɳ",
  "l", "r", "ɾ", "ɹ", "ʀ",
  "w", "j", "ɥ",
  "tʃ", "dʒ", "ts", "dz",
  "ʂ", "ʐ", "ʈ", "ɖ",
  "h₁", "h₂", "h₃",
  "r̩", "l̩", "m̩", "n̩",
  "r̥", "l̥", "m̥", "n̥", "w̥", "y̥",
  "kʷ", "gʷ", "gʷʰ", "xʷ",
  "kʲ", "gʲ", "gʲʰ", "tʲ", "dʲ",
  "ḱ", "ǵ", "g̑",
  "bʰ", "dʰ", "gʰ",
  "ǀ", "ǃ", "ǂ", "ǁ", "ʘ",
  "ⁿ",
  "ⁿp", "ⁿb", "ⁿt", "ⁿd", "ⁿk", "ⁿg", "ⁿj",
]);

export function isVowel(p: Phoneme): boolean {
  if (VOWELS.has(p)) return true;
  if (p.endsWith("ː") && VOWELS.has(p.slice(0, -1))) return true;
  const toneMarks = ["˥", "˧", "˩", "˧˥", "˥˩"];
  for (const m of toneMarks) {
    if (p.endsWith(m)) {
      const base = p.slice(0, -m.length);
      if (VOWELS.has(base)) return true;
      if (base.endsWith("ː") && VOWELS.has(base.slice(0, -1))) return true;
    }
  }
  return false;
}

export function isConsonant(p: Phoneme): boolean {
  return CONSONANTS.has(p);
}

const SYLLABIC_RESONANTS: ReadonlySet<Phoneme> = new Set([
  "m̩",
  "n̩",
  "l̩",
  "r̩",
  "m̥",
  "n̥",
  "l̥",
  "r̥",
  "w̥",
  "y̥",
]);

export function isSyllabic(p: Phoneme): boolean {
  if (isVowel(p)) return true;
  if (SYLLABIC_RESONANTS.has(p)) return true;
  if (p.endsWith("̥") || p.endsWith("̩")) return true;
  return false;
}

const ASCII_TO_IPA: Record<string, Phoneme> = {
  th: "θ",
  dh: "ð",
  sh: "ʃ",
  zh: "ʒ",
  ch: "tʃ",
  jh: "dʒ",
  ph: "f",
  ng: "ŋ",
  ny: "ɲ",
  gh: "ɣ",
  kh: "x",
  aa: "aː",
  ee: "eː",
  ii: "iː",
  oo: "oː",
  uu: "uː",
  eh: "ɛ",
  oh: "ɔ",
  ae: "æ",
  kj: "kʲ",
  gj: "gʲ",
  tj: "tʲ",
  dj: "dʲ",
};

export function asciiToIpa(s: string): Phoneme {
  return ASCII_TO_IPA[s] ?? s;
}

export function textToIpa(input: string): Phoneme[] {
  if (!input) return [];
  const graphemes: string[] = (() => {
    const Seg = (globalThis as unknown as { Intl?: { Segmenter?: typeof Intl.Segmenter } })
      .Intl?.Segmenter;
    if (Seg) {
      return Array.from(
        new Seg(undefined, { granularity: "grapheme" }).segment(input.trim().toLowerCase()),
        (x) => x.segment,
      );
    }
    return Array.from(input.trim().toLowerCase());
  })();
  const len = graphemes.length;
  const stripFinalE =
    len >= 2 &&
    graphemes[len - 1] === "e" &&
    /^[a-z]$/.test(graphemes[len - 2] ?? "") &&
    !"aeiouy".includes(graphemes[len - 2] ?? "");
  const work = stripFinalE ? graphemes.slice(0, -1) : graphemes;

  const out: Phoneme[] = [];
  for (let i = 0; i < work.length; i++) {
    const cur = work[i]!;
    const next = work[i + 1] ?? "";
    const pair = cur + next;
    const digraph = ASCII_TO_IPA[pair];
    if (digraph !== undefined) {
      out.push(digraph);
      i++;
      continue;
    }
    if (cur === "c") {
      if ("eiy".includes(next)) out.push("s");
      else out.push("k");
      continue;
    }
    if (cur === "x") {
      out.push("k");
      out.push("s");
      continue;
    }
    if (cur === "q") {
      if (next === "u") {
        out.push("k");
        out.push("w");
        i++;
      } else {
        out.push("k");
      }
      continue;
    }
    if (cur === "j") {
      out.push("dʒ");
      continue;
    }
    if (cur === "y") {
      if (i === 0 && "aeiou".includes(next)) out.push("j");
      else if (i === work.length - 1) out.push("i");
      else if ("aeiou".includes(next)) out.push("j");
      else out.push("i");
      continue;
    }
    if (cur === next && /^[bcdfgklmnprstvz]$/.test(cur)) {
      out.push(cur);
      i++;
      continue;
    }
    if (/^\s$/.test(cur)) continue;
    out.push(cur);
  }
  return out;
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

export function sanitizeForNewick(input: string | Phoneme[]): string {
  const tokens: string[] = Array.isArray(input)
    ? input
    : splitGraphemes(input);
  return tokens
    .map((ch) => {
      if (/^[(),:;\s]+$/.test(ch)) return "_";
      if (ch.length === 1 && ch.charCodeAt(0) < 128) return ch;
      return (
        "%" +
        Array.from(ch)
          .map((cp) =>
            cp
              .codePointAt(0)!
              .toString(16)
              .toUpperCase()
              .padStart(2, "0"),
          )
          .join("_")
      );
    })
    .join("");
}

function splitGraphemes(s: string): string[] {
  const Seg = (globalThis as unknown as { Intl?: { Segmenter?: typeof Intl.Segmenter } })
    .Intl?.Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(s), (x) => x.segment);
  }
  return Array.from(s);
}
