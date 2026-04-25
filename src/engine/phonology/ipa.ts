import type { Phoneme } from "../primitives";

export const VOWELS: ReadonlySet<Phoneme> = new Set([
  "a", "e", "i", "o", "u",
  "ɛ", "ɔ", "ə", "ɨ", "ɯ", "ø", "y", "œ",
  // Near-open / open / lax series. Produced by umlaut/harmony rules
  // and used in narrow transcription (laxing of i/u/e/o). Previously
  // absent from the canonical set, which caused `isVowel` to reject
  // umlaut outputs like `æ` and `ʏ` even though the catalog rule
  // deliberately emits them.
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
  // Ejectives (Caucasian, Salishan, Ethio-Semitic, Andean).
  "pʼ", "tʼ", "kʼ", "qʼ", "tsʼ", "tʃʼ",
  // Preglottalised stops (Vietnamese, SE Asian, Cockney).
  "ʔp", "ʔt", "ʔk",
  "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "ħ", "ɣ", "x", "β",
  "m", "n", "ŋ", "ɲ", "ɳ",
  "l", "r", "ɾ", "ɹ", "ʀ",
  "w", "j", "ɥ",
  "tʃ", "dʒ", "ts", "dz",
  // Retroflex series
  "ʂ", "ʐ", "ʈ", "ɖ",
  // Laryngeals (PIE convention — no dedicated IPA letters exist)
  "h₁", "h₂", "h₃",
  // Syllabic resonants. IPA uses combining vertical line below (U+0329);
  // Indo-European studies historically used combining ring below (U+0325).
  // Both are accepted so older saves and hand-typed forms still work.
  "r̩", "l̩", "m̩", "n̩",
  "r̥", "l̥", "m̥", "n̥", "w̥", "y̥",
  // PIE labiovelars and palatalised consonants. The engine accepts the
  // Indo-Europeanist acute-over-consonant (`ḱ`, `ǵ`) as deprecated
  // aliases. Canonical form uses U+02B2 superscript j for palatalisation.
  "kʷ", "gʷ", "gʷʰ",
  "kʲ", "gʲ", "gʲʰ", "tʲ", "dʲ",
  "ḱ", "ǵ", "g̑",
  // Voiced aspirated stops (PIE)
  "bʰ", "dʰ", "gʰ",
  // Clicks
  "ǀ", "ǃ", "ǂ", "ǁ", "ʘ",
  // Nasalization diacritic (pre-nasal cluster marker)
  "ⁿ",
  // Prenasalised consonants (Bantu, Austronesian, Mande). Written as
  // superscript-n + stop since Bantu phonology treats them as single
  // segments, not clusters. The homorganic nasal assimilates to the
  // following stop's place, so a single `ⁿ` modifier is sufficient.
  "ⁿp", "ⁿb", "ⁿt", "ⁿd", "ⁿk", "ⁿg", "ⁿj",
]);

export function isVowel(p: Phoneme): boolean {
  if (VOWELS.has(p)) return true;
  // Strip IPA length mark and re-check (/aː/, /ɛː/, etc.).
  if (p.endsWith("ː") && VOWELS.has(p.slice(0, -1))) return true;
  // Handle tone-marked vowels: strip trailing tone mark and re-check.
  const toneMarks = ["˥", "˧", "˩", "˧˥", "˥˩"];
  for (const m of toneMarks) {
    if (p.endsWith(m)) {
      const base = p.slice(0, -m.length);
      if (VOWELS.has(base)) return true;
      // Length + tone: `/aː˥/`.
      if (base.endsWith("ː") && VOWELS.has(base.slice(0, -1))) return true;
    }
  }
  return false;
}

export function isConsonant(p: Phoneme): boolean {
  return CONSONANTS.has(p);
}

/**
 * Segments that can serve as a syllable nucleus. A syllable — and
 * therefore a word — needs at least one of these.
 *
 * Members:
 * - any vowel (via `isVowel`);
 * - the PIE syllabic resonants `m̥ n̥ l̥ r̥ w̥ y̥` (explicitly marked
 *   with U+0325 combining-below).
 *
 * Deliberately excluded: bare sonorants /m n l r/ etc. — these can be
 * syllabic in a handful of languages (Czech "strč", Nuxalk, some Berber)
 * but there the inventory contains the marked syllabic variant. The
 * simulator expresses that fact by having the marked variant in the
 * inventory; callers should never assume a bare sonorant is syllabic.
 */
const SYLLABIC_RESONANTS: ReadonlySet<Phoneme> = new Set([
  // IPA (combining vertical line below, U+0329)
  "m̩",
  "n̩",
  "l̩",
  "r̩",
  // Indo-Europeanist (combining ring below, U+0325) — legacy alias
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
  // Fall through to the combining-below check so unusual marked forms
  // (e.g. `ḿ̥`, `s̩`) still count as nuclei.
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
  // ASCII palatalisation fallbacks — map to the canonical IPA
  // superscript-j form so the engine's stored phonemes stay uniform
  // regardless of how a user types them. Added when the non-IPA
  // `kj/gj/tj/dj` duplicates were removed from the CONSONANTS set.
  kj: "kʲ",
  gj: "gʲ",
  tj: "tʲ",
  dj: "dʲ",
};

export function asciiToIpa(s: string): Phoneme {
  return ASCII_TO_IPA[s] ?? s;
}

/**
 * Best-effort conversion from an arbitrary user-entered Latin string to
 * a sequence of IPA phonemes the engine can consume. Greedy-longest
 * match over the digraph table, with single-letter substitutions for
 * the few that differ between orthography and IPA (`c` before front
 * vowels → `s`, `j` → `dʒ`, `y` as vowel vs glide, etc.), and silent
 * final `e` stripped. Already-IPA grapheme clusters (with combining
 * diacritics) pass through unchanged because we walk the input as
 * grapheme clusters, not UTF-16 code units.
 *
 * This is deliberately coarse — it's enough to let a user type "think"
 * and have the engine receive `[θ, i, n, k]`, not a perfect spelling-
 * to-sound model. Callers that need strict IPA should lay it in
 * directly.
 */
export function textToIpa(input: string): Phoneme[] {
  if (!input) return [];
  // Split into grapheme clusters so combining-diacritic sequences
  // (e.g. `m̩`, `á`) stay glued to their base.
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
  // Drop a silent word-final `e` when it follows a consonant (only the
  // most common silent-e pattern; not a full rulebook).
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
    // Greedy digraph lookup.
    const pair = cur + next;
    const digraph = ASCII_TO_IPA[pair];
    if (digraph !== undefined) {
      out.push(digraph);
      i++;
      continue;
    }
    // Context-sensitive singles.
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
      // `qu` → `kw`; bare q → k.
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
      // Final / sole y tends to be vowel /i/; initial or prevocalic is /j/.
      if (i === 0 && "aeiou".includes(next)) out.push("j");
      else if (i === work.length - 1) out.push("i");
      else if ("aeiou".includes(next)) out.push("j");
      else out.push("i");
      continue;
    }
    // Collapse doubled consonants to a single phoneme (surface geminates
    // are rare in typed English).
    if (cur === next && /^[bcdfgklmnprstvz]$/.test(cur)) {
      out.push(cur);
      i++;
      continue;
    }
    // Skip obvious non-letter noise.
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

/**
 * ASCII-ify for export formats (Newick) that dislike IPA characters.
 * Accepts either a plain string or a `Phoneme[]`; the array variant is
 * preferred because it preserves multi-codepoint grapheme clusters
 * (e.g. `m̩`, `kʷ`) as single tokens. The string variant iterates grapheme
 * clusters with `Intl.Segmenter` when available to avoid shredding
 * combining diacritics — earlier iterations used `Array.from(s)`, which
 * split `m̩` into two separate escapes.
 */
export function sanitizeForNewick(input: string | Phoneme[]): string {
  const tokens: string[] = Array.isArray(input)
    ? input
    : splitGraphemes(input);
  return tokens
    .map((ch) => {
      if (/^[(),:;\s]+$/.test(ch)) return "_";
      if (ch.length === 1 && ch.charCodeAt(0) < 128) return ch;
      // Encode each grapheme cluster as `%xx_xx_...` (underscore-joined
      // hex) so a multi-codepoint phoneme like `m̩` round-trips through
      // Newick parsers without breaking on the underscore-as-space
      // convention.
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

/**
 * Split a string into grapheme clusters. Uses `Intl.Segmenter` if the
 * runtime supports it (all modern browsers + Node 18+), otherwise falls
 * back to `Array.from` (code-point split) — that fallback path will
 * still shred combining diacritics, but it keeps older targets working.
 */
function splitGraphemes(s: string): string[] {
  const Seg = (globalThis as unknown as { Intl?: { Segmenter?: typeof Intl.Segmenter } })
    .Intl?.Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(s), (x) => x.segment);
  }
  return Array.from(s);
}
