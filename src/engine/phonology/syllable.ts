import type { Phoneme, WordForm } from "../types";
import { isSyllabic, isVowel } from "./ipa";

/**
 * Syllabification + stress assignment for the engine. First-class
 * suprasegmental machinery — stress and syllable structure aren't
 * just display metadata; downstream sound-change rules in `apply.ts`
 * filter match sites by syllable position (`stressed` / `unstressed`)
 * and read syllable boundaries (onset / nucleus / coda).
 *
 * Sonority hierarchy used here is the standard one:
 *
 *   vowel (5) > glide (4) > liquid (3) > nasal (2) > fricative (1) > stop (0)
 *
 * Onset clusters must rise (or stay flat) in sonority toward the
 * nucleus; codas mirror the rising-then-falling shape. Maximum-onset
 * principle splits intervocalic clusters: as many consonants as can
 * legally cluster as an onset go to the following syllable.
 */

export interface Syllable {
  /** Phoneme indices in the source `WordForm` array. */
  onset: number[];
  /** Single phoneme index — the syllabic segment (vowel or syllabic
   *  resonant). */
  nucleus: number;
  coda: number[];
}

/** How a language assigns primary stress when no lexical override
 *  is set. */
export type StressRule =
  | "initial"     // First syllable (Czech, Hungarian, Finnish, Latvian, Proto-Germanic)
  | "final"       // Last syllable (French phrase-final, Persian)
  | "penult"      // Second-to-last (Latin, Polish, Bantu, Toki Pona-style)
  | "antepenult"  // Third-from-last (Macedonian, some Romance reflexes)
  | "lexical";    // Per-word; falls back to `penult` if no override

const SONORITY: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  // Vowels: highest sonority. Syllabic resonants count too.
  for (const v of ["a", "e", "i", "o", "u", "ɛ", "ɔ", "ə", "ɨ", "ɯ", "ø", "y", "œ", "æ", "ɑ", "ɒ", "ʏ", "ɪ", "ʊ"]) {
    m[v] = 5;
  }
  // Syllabic resonants: nucleus-eligible, treat as 5 for sonority
  // purposes (they win over plain resonants when scored).
  for (const r of ["r̩", "l̩", "m̩", "n̩", "r̥", "l̥", "m̥", "n̥"]) {
    m[r] = 5;
  }
  // Glides
  for (const g of ["j", "w", "ɥ"]) m[g] = 4;
  // Liquids
  for (const l of ["l", "r", "ɾ", "ɹ", "ʀ"]) m[l] = 3;
  // Nasals
  for (const n of ["m", "n", "ŋ", "ɲ", "ɳ"]) m[n] = 2;
  // Fricatives + h-ish + laryngeals
  for (const f of [
    "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "ħ", "ɣ", "x", "β",
    "ʂ", "ʐ", "h₁", "h₂", "h₃", "xʷ",
  ]) m[f] = 1;
  // Stops + affricates + clicks. (Default 0 covers anything missing.)
  return m;
})();

/**
 * Strip length / tone / aspiration / palatalisation marks before
 * looking up sonority. Aspirated stops still act as stops; long
 * vowels still act as vowels; tone-marked vowels still act as vowels.
 */
function sonorityOf(p: Phoneme): number {
  if (SONORITY[p] !== undefined) return SONORITY[p]!;
  // Strip length
  if (p.endsWith("ː")) {
    const b = p.slice(0, -1);
    if (SONORITY[b] !== undefined) return SONORITY[b]!;
  }
  // Strip tone
  for (const t of ["˥˩", "˧˥", "˥", "˧", "˩"]) {
    if (p.endsWith(t)) {
      const b = p.slice(0, -t.length);
      if (SONORITY[b] !== undefined) return SONORITY[b]!;
      // Recursive strip in case length+tone stack
      if (b.endsWith("ː")) {
        const c = b.slice(0, -1);
        if (SONORITY[c] !== undefined) return SONORITY[c]!;
      }
    }
  }
  // Aspirated / palatalised / labialised stops still rank as stops.
  if (p.endsWith("ʰ") || p.endsWith("ʲ") || p.endsWith("ʷ") || p.endsWith("ʼ")) {
    return 0;
  }
  // Fallback: vowel-by-isVowel-check (catches any vowel we missed).
  if (isVowel(p)) return 5;
  // Unknown → assume stop.
  return 0;
}

/**
 * True when phonemes[start..nucleus] form a legal onset cluster.
 * Sonority must rise strictly toward the nucleus (consonant before
 * consonant). The universal s+voiceless-stop exception (`st`, `sp`,
 * `sk`) is honoured because cross-linguistically those clusters
 * surface as onsets even though they violate strict sonority rise.
 */
function legalOnset(form: WordForm, start: number, nucleus: number): boolean {
  for (let k = start; k < nucleus - 1; k++) {
    const a = form[k]!;
    const b = form[k + 1]!;
    if (a === "s" && (b === "p" || b === "t" || b === "k")) continue;
    if (sonorityOf(a) >= sonorityOf(b)) return false;
  }
  return true;
}

/**
 * Walk a phoneme array and produce a list of syllables. Empty array
 * (or one with no nucleus) returns `[]`. Each syllable's onset, nucleus,
 * and coda indices point back into the original form.
 *
 * Algorithm:
 *   1. Find every nucleus (vowel or syllabic resonant).
 *   2. For each adjacent nucleus pair, split the intervening
 *      consonants by maximum-onset: as many consonants as possible
 *      attach to the right syllable's onset, subject to onset clusters
 *      rising in sonority toward the nucleus.
 *   3. Word-initial consonants all go to the first syllable's onset.
 *   4. Word-final consonants all go to the last syllable's coda.
 */
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
        onsetStart = nucleus; // hiatus
      } else if (between === 1) {
        onsetStart = nucleus - 1; // single intervocalic C → onset
      } else {
        // Maximum-onset principle: greedily attach as many leftward
        // consonants to the onset as form a legal cluster (strictly
        // rising sonority, with an s + voiceless-stop exception).
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
  // Codas: everything between this nucleus and the next syllable's
  // first onset index (or end of form for the last syllable).
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

/**
 * Pick the stressed syllable index given a rule. `lexical` falls back
 * to `penult` when no per-word override is supplied. Returns -1 when
 * the form has no syllables.
 */
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

/**
 * Convenience: syllabify + stress in one call. Returns the stressed
 * syllable index alongside the structure.
 */
export function syllabifyAndStress(
  form: WordForm,
  rule: StressRule,
  lexicalOverride?: number,
): { syllables: Syllable[]; stressedIdx: number } {
  const syllables = syllabify(form);
  const stressedIdx = assignStress(syllables, rule, lexicalOverride);
  return { syllables, stressedIdx };
}

/**
 * Format a form as IPA with stress + syllable boundaries: `[ˈwɔ.dr̩]`.
 * The stress mark `ˈ` precedes the stressed syllable; `.` separates
 * non-initial unstressed syllables; the entire form is wrapped in
 * `[ ]` brackets per IPA convention.
 *
 * Falls back to the bare-joined form when there are no syllables
 * (typically all-consonant fragments — shouldn't happen post-
 * `repairSyllabicity`).
 */
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
