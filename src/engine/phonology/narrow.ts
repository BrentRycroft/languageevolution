import type { Language, WordForm } from "../types";
import { syllabify as sonoritySyllabify } from "./syllable";

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

/**
 * Project the engine's index-based syllable structure (from
 * `phonology/syllable.ts`) into the phoneme-string view this module
 * uses. Going through the proper sonority-aware syllabifier means
 * `matre` parses as `[ma.tre]` (rising-sonority `tr` onset) rather
 * than the old 50/50 heuristic's `[mat.re]`.
 */
function syllabify(form: WordForm): Syllable[] {
  const sylls = sonoritySyllabify(form);
  if (sylls.length === 0) {
    return form.length > 0
      ? [{ onset: [], nucleus: form.slice(), coda: [] }]
      : [];
  }
  return sylls.map((s) => ({
    onset: s.onset.map((i) => form[i]!),
    nucleus: [form[s.nucleus]!],
    coda: s.coda.map((i) => form[i]!),
  }));
}

function renderSyllable(s: Syllable, laxVowels: boolean): string {
  const nucleus = s.nucleus.map((p) => (laxVowels ? laxen(p) : p)).join("");
  return s.onset.join("") + nucleus + s.coda.join("");
}

export function narrowTranscribe(
  form: WordForm,
  lang?: Language,
  meaning?: string,
): string {
  if (form.length === 0) return "";
  const sylls = syllabify(form);
  if (sylls.length === 0) return form.join("");
  // Stress placement: read the language's `stressPattern`, falling
  // back to `penult` (back-compat). When the language uses
  // `lexical` accent (PIE mobile-accent style), consult
  // `lang.lexicalStress[meaning]` for a per-word syllable override.
  const pattern = lang?.stressPattern ?? "penult";
  const lexicalIdx = pattern === "lexical" && meaning && lang?.lexicalStress
    ? lang.lexicalStress[meaning]
    : undefined;
  let stressedIdx: number;
  if (sylls.length <= 1) {
    stressedIdx = 0;
  } else if (pattern === "initial") {
    stressedIdx = 0;
  } else if (pattern === "final") {
    stressedIdx = sylls.length - 1;
  } else if (pattern === "antepenult") {
    stressedIdx = Math.max(0, sylls.length - 3);
  } else if (pattern === "lexical" && lexicalIdx !== undefined && lexicalIdx >= 0 && lexicalIdx < sylls.length) {
    stressedIdx = lexicalIdx;
  } else {
    // penult (also the lexical fallback)
    stressedIdx = sylls.length - 2;
  }
  const parts = sylls.map((s, i) => {
    const body = renderSyllable(s, true);
    return (i === stressedIdx && sylls.length > 1 ? "ˈ" : "") + body;
  });
  return parts.join(".");
}
