import type { Language, WordForm } from "../types";
import { isVowel, isSyllabic } from "./ipa";

/**
 * Render a phoneme array as a narrow phonetic transcription:
 *   [ˈkɔr.pʊs]   (stress + syllable break + laxed vowels)
 *
 * The engine stores broad phonemes — /k/ /o/ /r/ /p/ /u/ /s/ — so this
 * is a view-layer enrichment, not a change to the underlying lexicon.
 *
 * Steps:
 *   1. Split the form into syllables via the maximum-onset principle:
 *      every intervocalic consonant cluster is given to the following
 *      syllable's onset unless it'd create a bare onsetless syllable.
 *   2. Mark primary stress on the first syllable (simple default — a
 *      future per-language stress pass could override this).
 *   3. Lax the mid/high vowels into their narrow-transcription forms:
 *        o → ɔ    u → ʊ
 *        e → ɛ    i → ɪ
 *      Applied to every vowel regardless of stress for now; closer to
 *      what a beginner would expect when reading the form aloud.
 *   4. Join with `.` between syllables, `ˈ` before the stressed one.
 *
 * Returns the bare string (no delimiters); the caller wraps in `[…]`.
 */

const LAXING: Record<string, string> = {
  o: "ɔ",
  u: "ʊ",
  e: "ɛ",
  i: "ɪ",
  // Long variants keep their closed quality — they're the tense ones.
  // Nasalized / stressed-acute variants already carry their own marking
  // and aren't laxed.
};

function laxen(p: string): string {
  // Strip trailing length mark / tone mark so we can lookup the base,
  // then re-attach the suprasegmental after substitution.
  let base = p;
  let suffix = "";
  while (base.length > 1 && /[ːˈˌ˥˧˩]/.test(base.slice(-1))) {
    suffix = base.slice(-1) + suffix;
    base = base.slice(0, -1);
  }
  const lax = LAXING[base];
  return (lax ?? base) + suffix;
}

interface Syllable {
  onset: string[];
  nucleus: string[];
  coda: string[];
}

function syllabify(form: WordForm): Syllable[] {
  // Walk the form finding nuclei (vowels + syllabic resonants). Each
  // nucleus anchors one syllable. Consonants between nuclei are split
  // by the max-onset principle: as many as possible attach to the
  // following syllable's onset, with the first consonant always going
  // to the following onset when there's one nucleus left.
  const nucleusIdx: number[] = [];
  for (let i = 0; i < form.length; i++) {
    if (isVowel(form[i]!) || isSyllabic(form[i]!)) nucleusIdx.push(i);
  }
  if (nucleusIdx.length === 0) {
    // No real nucleus — emit one syllable with whatever we have.
    return [{ onset: [], nucleus: form.slice(), coda: [] }];
  }

  const sylls: Syllable[] = [];
  // Initial onset: everything before the first nucleus.
  const firstNuc = nucleusIdx[0]!;
  sylls.push({
    onset: form.slice(0, firstNuc),
    nucleus: [form[firstNuc]!],
    coda: [],
  });

  for (let n = 1; n < nucleusIdx.length; n++) {
    const prevNuc = nucleusIdx[n - 1]!;
    const thisNuc = nucleusIdx[n]!;
    const between = form.slice(prevNuc + 1, thisNuc);
    // Max-onset: give the following onset as many consonants as we
    // can, leaving at most `between.length - 1` for the previous coda.
    // Simple heuristic: one C between → all to onset; two C → 1 coda + 1
    // onset; three+ C → split evenly, favouring onset.
    let codaCount = 0;
    if (between.length >= 2) codaCount = Math.floor(between.length / 2);
    const coda = between.slice(0, codaCount);
    const onset = between.slice(codaCount);
    sylls[sylls.length - 1]!.coda = coda;
    sylls.push({
      onset,
      nucleus: [form[thisNuc]!],
      coda: [],
    });
  }

  // Final coda: everything after the last nucleus.
  const lastNuc = nucleusIdx[nucleusIdx.length - 1]!;
  sylls[sylls.length - 1]!.coda = form.slice(lastNuc + 1);
  return sylls;
}

function renderSyllable(s: Syllable, laxVowels: boolean): string {
  const nucleus = s.nucleus.map((p) => (laxVowels ? laxen(p) : p)).join("");
  return s.onset.join("") + nucleus + s.coda.join("");
}

export function narrowTranscribe(form: WordForm, lang?: Language): string {
  if (form.length === 0) return "";
  const sylls = syllabify(form);
  if (sylls.length === 0) return form.join("");
  // Primary stress position follows the language's stressPattern
  // (default penult for back-compat when the field is absent). For
  // single-syllable words the stress mark is suppressed.
  const pattern = lang?.stressPattern ?? "penult";
  let stressedIdx: number;
  if (sylls.length <= 1) {
    stressedIdx = 0;
  } else if (pattern === "initial") {
    stressedIdx = 0;
  } else if (pattern === "final") {
    stressedIdx = sylls.length - 1;
  } else {
    stressedIdx = sylls.length - 2;
  }
  const parts = sylls.map((s, i) => {
    const body = renderSyllable(s, true);
    return (i === stressedIdx && sylls.length > 1 ? "ˈ" : "") + body;
  });
  return parts.join(".");
}
