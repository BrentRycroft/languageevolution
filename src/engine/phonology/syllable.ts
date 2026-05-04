import type { Phoneme, WordForm } from "../types";
import { isSyllabic, isVowel } from "./ipa";

export interface Syllable {
  onset: number[];
  nucleus: number;
  coda: number[];
}

export type StressRule =
  | "initial"
  | "final"
  | "penult"
  | "antepenult"
  | "lexical";

const SONORITY: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const v of ["a", "e", "i", "o", "u", "ɛ", "ɔ", "ə", "ɨ", "ɯ", "ø", "y", "œ", "æ", "ɑ", "ɒ", "ʏ", "ɪ", "ʊ"]) {
    m[v] = 5;
  }
  for (const r of ["r̩", "l̩", "m̩", "n̩", "r̥", "l̥", "m̥", "n̥"]) {
    m[r] = 5;
  }
  for (const g of ["j", "w", "ɥ"]) m[g] = 4;
  for (const l of ["l", "r", "ɾ", "ɹ", "ʀ"]) m[l] = 3;
  for (const n of ["m", "n", "ŋ", "ɲ", "ɳ"]) m[n] = 2;
  for (const f of [
    "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "ħ", "ɣ", "x", "β",
    "ʂ", "ʐ", "h₁", "h₂", "h₃", "xʷ",
  ]) m[f] = 1;
  return m;
})();

function sonorityOf(p: Phoneme): number {
  if (SONORITY[p] !== undefined) return SONORITY[p]!;
  if (p.endsWith("ː")) {
    const b = p.slice(0, -1);
    if (SONORITY[b] !== undefined) return SONORITY[b]!;
  }
  for (const t of ["˥˩", "˧˥", "˥", "˧", "˩"]) {
    if (p.endsWith(t)) {
      const b = p.slice(0, -t.length);
      if (SONORITY[b] !== undefined) return SONORITY[b]!;
      if (b.endsWith("ː")) {
        const c = b.slice(0, -1);
        if (SONORITY[c] !== undefined) return SONORITY[c]!;
      }
    }
  }
  if (p.endsWith("ʰ") || p.endsWith("ʲ") || p.endsWith("ʷ") || p.endsWith("ʼ")) {
    return 0;
  }
  if (isVowel(p)) return 5;
  return 0;
}

// Phase 29 Tranche 5q: per-language licit-cluster overrides. The
// English-only s+stop exception was inadequate for Slavic /sm-/, /vz-/,
// Greek /pn-/, /pt-/, Tibeto-Burman /sl-/, /sn-/, etc. Rather than
// hard-code dozens of exceptions, declare cluster patterns that bypass
// the sonority-rise requirement when the cluster has cross-linguistic
// precedent. Forms can match by (a, b) prefix pair.
const SONORITY_VIOLATION_EXCEPTIONS: ReadonlyArray<readonly [string, string]> = [
  // s + stop (English, German, Greek, Slavic, Romance)
  ["s", "p"], ["s", "t"], ["s", "k"],
  // s + nasal (Slavic /sm-/, /sn-/, Greek /sm-/, /sn-/)
  ["s", "m"], ["s", "n"],
  // s + lateral (Tibeto-Burman /sl-/, English "slow")
  ["s", "l"],
  // s + glide (Slavic /sv-/-style mapped to /sw/, Russian /sv-/)
  ["s", "w"], ["s", "j"],
  // Greek-style stop + nasal (/pn-/, /kn-/, /tn-/). Keep stop+stop
  // out — those break the existing "apti → ap.ti" split rule and
  // aren't licit onsets in the languages we model.
  ["p", "n"], ["k", "n"], ["t", "n"],
  // Voiced fricative + sonorant clusters (Slavic /vz-/, /vj-/)
  ["v", "z"], ["v", "j"], ["z", "v"],
];

function legalOnset(form: WordForm, start: number, nucleus: number): boolean {
  for (let k = start; k < nucleus - 1; k++) {
    const a = form[k]!;
    const b = form[k + 1]!;
    let isException = false;
    for (const [ea, eb] of SONORITY_VIOLATION_EXCEPTIONS) {
      if (a === ea && b === eb) { isException = true; break; }
    }
    if (isException) continue;
    if (sonorityOf(a) >= sonorityOf(b)) return false;
  }
  return true;
}

export function syllabify(form: WordForm): Syllable[] {
  const nuclei: number[] = [];
  for (let i = 0; i < form.length; i++) {
    if (isSyllabic(form[i]!)) nuclei.push(i);
  }
  if (nuclei.length === 0) return [];

  const syllables: Syllable[] = [];
  for (let s = 0; s < nuclei.length; s++) {
    const nucleus = nuclei[s]!;
    let onsetStart: number;
    if (s === 0) {
      onsetStart = 0;
    } else {
      const prevNuc = nuclei[s - 1]!;
      const between = nucleus - prevNuc - 1;
      if (between === 0) {
        onsetStart = nucleus;
      } else if (between === 1) {
        onsetStart = nucleus - 1;
      } else {
        let split = nucleus;
        for (let cs = nucleus - 1; cs > prevNuc; cs--) {
          if (legalOnset(form, cs, nucleus)) split = cs;
          else break;
        }
        onsetStart = split;
      }
    }
    const onset: number[] = [];
    for (let k = onsetStart; k < nucleus; k++) onset.push(k);
    syllables.push({ onset, nucleus, coda: [] });
  }
  for (let s = 0; s < syllables.length; s++) {
    const cur = syllables[s]!;
    const start = cur.nucleus + 1;
    let end: number;
    if (s === syllables.length - 1) {
      end = form.length;
    } else {
      const next = syllables[s + 1]!;
      end = next.onset.length > 0 ? next.onset[0]! : next.nucleus;
    }
    const coda: number[] = [];
    for (let k = start; k < end; k++) coda.push(k);
    cur.coda = coda;
  }
  return syllables;
}

export function assignStress(
  syllables: Syllable[],
  rule: StressRule,
  lexicalOverride?: number,
): number {
  if (syllables.length === 0) return -1;
  if (lexicalOverride !== undefined && lexicalOverride >= 0 && lexicalOverride < syllables.length) {
    return lexicalOverride;
  }
  switch (rule) {
    case "initial":
      return 0;
    case "final":
      return syllables.length - 1;
    case "penult":
    case "lexical":
      return Math.max(0, syllables.length - 2);
    case "antepenult":
      return Math.max(0, syllables.length - 3);
  }
}

export function syllabifyAndStress(
  form: WordForm,
  rule: StressRule,
  lexicalOverride?: number,
): { syllables: Syllable[]; stressedIdx: number } {
  const syllables = syllabify(form);
  const stressedIdx = assignStress(syllables, rule, lexicalOverride);
  return { syllables, stressedIdx };
}

export function formatStressedIpa(
  form: WordForm,
  syllables: Syllable[],
  stressedIdx: number,
): string {
  if (form.length === 0) return "[]";
  if (syllables.length === 0) return `[${form.join("")}]`;
  const parts: string[] = [];
  for (let s = 0; s < syllables.length; s++) {
    const syl = syllables[s]!;
    const indices = [...syl.onset, syl.nucleus, ...syl.coda];
    const sylStr = indices.map((i) => form[i]!).join("");
    const prefix = s === stressedIdx ? "ˈ" : (s === 0 ? "" : ".");
    parts.push(prefix + sylStr);
  }
  return "[" + parts.join("") + "]";
}
