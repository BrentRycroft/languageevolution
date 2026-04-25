import type { Phoneme } from "../types";
import { isVowel } from "./ipa";

export type Place =
  | "labial"
  | "labiodental"
  | "dental"
  | "alveolar"
  | "postalveolar"
  | "retroflex"
  | "palatal"
  | "velar"
  | "uvular"
  | "pharyngeal"
  | "glottal";

export type Manner =
  | "stop"
  | "affricate"
  | "fricative"
  | "nasal"
  | "liquid"
  | "tap"
  | "trill"
  | "glide"
  | "approximant";

export type Height = "high" | "mid-high" | "mid" | "mid-low" | "low";
export type Backness = "front" | "central" | "back";

export interface ConsonantFeatures {
  type: "consonant";
  place: Place;
  manner: Manner;
  voice: boolean;
  /** Aspirated (e.g. p^h). */
  aspirated?: boolean;
  /** Secondary palatalisation (e.g. t^j). */
  palatalised?: boolean;
  /** Lip rounding / labialisation (e.g. k^w). */
  labialised?: boolean;
}

export interface VowelFeatures {
  type: "vowel";
  height: Height;
  backness: Backness;
  round: boolean;
  nasal?: boolean;
  long?: boolean;
  /** Tense/lax distinction for /ɪ/ vs /i/ style pairs. */
  tense?: boolean;
}

export type FeatureBundle = ConsonantFeatures | VowelFeatures;

/**
 * Feature table covering the IPA inventory used across the catalog.
 * Missing entries return `undefined` and callers treat them as "opaque" —
 * they never match a feature query, which is the safe default.
 */
export const PHONE_FEATURES: Record<string, FeatureBundle> = {
  // Stops
  p: { type: "consonant", place: "labial", manner: "stop", voice: false },
  b: { type: "consonant", place: "labial", manner: "stop", voice: true },
  t: { type: "consonant", place: "alveolar", manner: "stop", voice: false },
  d: { type: "consonant", place: "alveolar", manner: "stop", voice: true },
  k: { type: "consonant", place: "velar", manner: "stop", voice: false },
  g: { type: "consonant", place: "velar", manner: "stop", voice: true },
  q: { type: "consonant", place: "uvular", manner: "stop", voice: false },
  "ʔ": { type: "consonant", place: "glottal", manner: "stop", voice: false },
  "pʰ": { type: "consonant", place: "labial", manner: "stop", voice: false, aspirated: true },
  "tʰ": { type: "consonant", place: "alveolar", manner: "stop", voice: false, aspirated: true },
  "kʰ": { type: "consonant", place: "velar", manner: "stop", voice: false, aspirated: true },
  "bʰ": { type: "consonant", place: "labial", manner: "stop", voice: true, aspirated: true },
  "dʰ": { type: "consonant", place: "alveolar", manner: "stop", voice: true, aspirated: true },
  "gʰ": { type: "consonant", place: "velar", manner: "stop", voice: true, aspirated: true },
  "ʈ": { type: "consonant", place: "retroflex", manner: "stop", voice: false },
  "ɖ": { type: "consonant", place: "retroflex", manner: "stop", voice: true },

  // IPA-style palatalised velars (preferred notation for new presets).
  "kʲ": { type: "consonant", place: "velar", manner: "stop", voice: false, palatalised: true },
  "gʲ": { type: "consonant", place: "velar", manner: "stop", voice: true, palatalised: true },
  "gʲʰ": { type: "consonant", place: "velar", manner: "stop", voice: true, palatalised: true, aspirated: true },
  // PIE studies notation — kept as aliases so legacy presets still
  // typecheck. Reflexes in daughter languages vary by satem/centum.
  "ḱ": { type: "consonant", place: "velar", manner: "stop", voice: false, palatalised: true },
  "ǵ": { type: "consonant", place: "velar", manner: "stop", voice: true, palatalised: true },
  "ǵʰ": { type: "consonant", place: "velar", manner: "stop", voice: true, palatalised: true, aspirated: true },
  // PIE labiovelars — velar stops with secondary labialisation.
  "kʷ": { type: "consonant", place: "velar", manner: "stop", voice: false, labialised: true },
  "gʷ": { type: "consonant", place: "velar", manner: "stop", voice: true, labialised: true },
  "gʷʰ": { type: "consonant", place: "velar", manner: "stop", voice: true, labialised: true, aspirated: true },

  // PIE laryngeals. Phonetic value is debated; conventional feature
  // assignments place h₁ as a neutral glottal (cf. [ʔ/h]), h₂ as a
  // pharyngeal fricative, h₃ as a labialised pharyngeal. We use these
  // so vowel-colouring rules can single them out by feature query.
  "h₁": { type: "consonant", place: "glottal", manner: "fricative", voice: false },
  "h₂": { type: "consonant", place: "pharyngeal", manner: "fricative", voice: false },
  "h₃": { type: "consonant", place: "pharyngeal", manner: "fricative", voice: true, labialised: true },

  // Fricatives
  f: { type: "consonant", place: "labiodental", manner: "fricative", voice: false },
  v: { type: "consonant", place: "labiodental", manner: "fricative", voice: true },
  "β": { type: "consonant", place: "labial", manner: "fricative", voice: true },
  "θ": { type: "consonant", place: "dental", manner: "fricative", voice: false },
  "ð": { type: "consonant", place: "dental", manner: "fricative", voice: true },
  s: { type: "consonant", place: "alveolar", manner: "fricative", voice: false },
  z: { type: "consonant", place: "alveolar", manner: "fricative", voice: true },
  "ʃ": { type: "consonant", place: "postalveolar", manner: "fricative", voice: false },
  "ʒ": { type: "consonant", place: "postalveolar", manner: "fricative", voice: true },
  "ʂ": { type: "consonant", place: "retroflex", manner: "fricative", voice: false },
  "ʐ": { type: "consonant", place: "retroflex", manner: "fricative", voice: true },
  x: { type: "consonant", place: "velar", manner: "fricative", voice: false },
  "ɣ": { type: "consonant", place: "velar", manner: "fricative", voice: true },
  "ħ": { type: "consonant", place: "pharyngeal", manner: "fricative", voice: false },
  h: { type: "consonant", place: "glottal", manner: "fricative", voice: false },

  // Affricates
  "tʃ": { type: "consonant", place: "postalveolar", manner: "affricate", voice: false },
  "dʒ": { type: "consonant", place: "postalveolar", manner: "affricate", voice: true },
  ts: { type: "consonant", place: "alveolar", manner: "affricate", voice: false },
  dz: { type: "consonant", place: "alveolar", manner: "affricate", voice: true },

  // Nasals
  m: { type: "consonant", place: "labial", manner: "nasal", voice: true },
  n: { type: "consonant", place: "alveolar", manner: "nasal", voice: true },
  "ɲ": { type: "consonant", place: "palatal", manner: "nasal", voice: true },
  "ŋ": { type: "consonant", place: "velar", manner: "nasal", voice: true },
  "ɳ": { type: "consonant", place: "retroflex", manner: "nasal", voice: true },
  // Syllabic resonants. Two conventions are accepted: U+0329
  // (combining vertical line below) is standard IPA for syllabicity;
  // U+0325 (combining ring below) is Indo-European-studies convention.
  // Share the non-syllabic counterpart's place/manner/voice — the
  // "syllabic" property is prosodic, not featural, so we leave it
  // implicit. Nucleus checks live in `ipa.ts::isSyllabic`.
  "m̩": { type: "consonant", place: "labial", manner: "nasal", voice: true },
  "n̩": { type: "consonant", place: "alveolar", manner: "nasal", voice: true },
  "m̥": { type: "consonant", place: "labial", manner: "nasal", voice: true },
  "n̥": { type: "consonant", place: "alveolar", manner: "nasal", voice: true },

  // Liquids
  l: { type: "consonant", place: "alveolar", manner: "liquid", voice: true },
  r: { type: "consonant", place: "alveolar", manner: "trill", voice: true },
  "ɾ": { type: "consonant", place: "alveolar", manner: "tap", voice: true },
  "ɹ": { type: "consonant", place: "alveolar", manner: "approximant", voice: true },
  "ʀ": { type: "consonant", place: "uvular", manner: "trill", voice: true },
  "l̩": { type: "consonant", place: "alveolar", manner: "liquid", voice: true },
  "r̩": { type: "consonant", place: "alveolar", manner: "trill", voice: true },
  "l̥": { type: "consonant", place: "alveolar", manner: "liquid", voice: true },
  "r̥": { type: "consonant", place: "alveolar", manner: "trill", voice: true },

  // Glides
  w: { type: "consonant", place: "velar", manner: "glide", voice: true, labialised: true },
  j: { type: "consonant", place: "palatal", manner: "glide", voice: true },
  "ɥ": { type: "consonant", place: "palatal", manner: "glide", voice: true, labialised: true },
  "w̥": { type: "consonant", place: "velar", manner: "glide", voice: true, labialised: true },
  "y̥": { type: "consonant", place: "palatal", manner: "glide", voice: true },

  // Vowels
  i: { type: "vowel", height: "high", backness: "front", round: false },
  y: { type: "vowel", height: "high", backness: "front", round: true },
  "ɨ": { type: "vowel", height: "high", backness: "central", round: false },
  u: { type: "vowel", height: "high", backness: "back", round: true },
  "ɯ": { type: "vowel", height: "high", backness: "back", round: false },
  e: { type: "vowel", height: "mid-high", backness: "front", round: false },
  "ø": { type: "vowel", height: "mid-high", backness: "front", round: true },
  "ə": { type: "vowel", height: "mid", backness: "central", round: false },
  o: { type: "vowel", height: "mid-high", backness: "back", round: true },
  "ɛ": { type: "vowel", height: "mid-low", backness: "front", round: false },
  "œ": { type: "vowel", height: "mid-low", backness: "front", round: true },
  "ɔ": { type: "vowel", height: "mid-low", backness: "back", round: true },
  a: { type: "vowel", height: "low", backness: "central", round: false },
  // Near-open / lax / non-central vowels. Previously absent from the
  // feature table, which meant the generative rule templates couldn't
  // target or produce them even though the hardcoded umlaut / harmony
  // rules emit them. Added so `featuresOf` returns a proper bundle for
  // every phoneme the engine can store.
  "æ": { type: "vowel", height: "low", backness: "front", round: false },
  "ɑ": { type: "vowel", height: "low", backness: "back", round: false },
  "ɒ": { type: "vowel", height: "low", backness: "back", round: true },
  "ɪ": { type: "vowel", height: "high", backness: "front", round: false, tense: false },
  "ʊ": { type: "vowel", height: "high", backness: "back", round: true, tense: false },
  "ʏ": { type: "vowel", height: "high", backness: "front", round: true, tense: false },
  // Accented vowels (PIE stress / reconstruction convention) — same as
  // their bare counterparts but let feature queries targeting "vowel"
  // still match them. Stress / tone don't propagate through `featuresOf`
  // since the feature system doesn't track them separately.
  "á": { type: "vowel", height: "low", backness: "central", round: false },
  "é": { type: "vowel", height: "mid-high", backness: "front", round: false },
  "í": { type: "vowel", height: "high", backness: "front", round: false },
  "ó": { type: "vowel", height: "mid-high", backness: "back", round: true },
  "ú": { type: "vowel", height: "high", backness: "back", round: true },
  // Long vowels (macron / IPA length mark).
  "ā": { type: "vowel", height: "low", backness: "central", round: false, long: true },
  "ē": { type: "vowel", height: "mid-high", backness: "front", round: false, long: true },
  "ī": { type: "vowel", height: "high", backness: "front", round: false, long: true },
  "ō": { type: "vowel", height: "mid-high", backness: "back", round: true, long: true },
  "ū": { type: "vowel", height: "high", backness: "back", round: true, long: true },
  "ḗ": { type: "vowel", height: "mid-high", backness: "front", round: false, long: true },
};

/**
 * Feature query — a partial bundle plus "type" narrowing. Any unspecified
 * feature is treated as "don't care".
 */
export type FeatureQuery =
  | ({ type?: "consonant" } & Partial<Omit<ConsonantFeatures, "type">>)
  | ({ type?: "vowel" } & Partial<Omit<VowelFeatures, "type">>);

const HEIGHT_ORDER: Height[] = ["low", "mid-low", "mid", "mid-high", "high"];

export function featuresOf(p: Phoneme): FeatureBundle | undefined {
  if (PHONE_FEATURES[p]) return PHONE_FEATURES[p];
  // Fall back: strip tone marks and long-vowel colon.
  const toneMarks = ["˥", "˧", "˩", "˧˥", "˥˩"];
  for (const m of toneMarks) {
    if (p.endsWith(m)) {
      const base = p.slice(0, -m.length);
      if (PHONE_FEATURES[base]) return PHONE_FEATURES[base];
    }
  }
  if (p.endsWith("ː")) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f && f.type === "vowel") return { ...f, long: true };
  }
  // Diacritic fall-throughs so the PIE preset isn't silently stripped
  // of sound-change coverage. Each branch returns a feature bundle
  // derived from the bare segment + the diacritic's phonological effect.
  //
  // Aspiration (U+02B0): bare + aspirated=true.
  if (p.endsWith("ʰ")) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f && f.type === "consonant") return { ...f, aspirated: true };
  }
  // Labialisation (U+02B7): bare + labialised=true.
  if (p.endsWith("ʷ")) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f && f.type === "consonant") return { ...f, labialised: true };
  }
  // Palatalisation (U+02B2): bare + palatalised=true.
  if (p.endsWith("ʲ")) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f && f.type === "consonant") return { ...f, palatalised: true };
  }
  // Combining below: U+0325 (ring, IE convention) or U+0329 (vertical
  // line, IPA "syllabic"). Same underlying features; `isSyllabic`
  // handles the nucleus question downstream.
  if (p.length >= 2 && (p.endsWith("̥") || p.endsWith("̩"))) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f) return f;
  }
  // Combining acute (U+0301): stress marker — no featural effect.
  if (p.length >= 2 && p.endsWith("́")) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f) return f;
  }
  // Don't fake feature bundles for opaque segments — callers should treat
  // unknowns as "won't match any feature query".
  return undefined;
}

export function matchesQuery(p: Phoneme, q: FeatureQuery | undefined): boolean {
  if (!q) return true;
  const f = featuresOf(p);
  if (!f) return false;
  if (q.type && f.type !== q.type) return false;
  for (const [k, v] of Object.entries(q)) {
    if (k === "type") continue;
    if (v === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((f as any)[k] !== v) return false;
  }
  return true;
}

/**
 * Shift a vowel's height by n steps (positive = up / higher).
 * Returns the nearest IPA symbol in our inventory, or undefined.
 * If the exact target height is not available on the same backness axis,
 * walks outward (±1, ±2 …) until a match is found.
 */
export function shiftHeight(p: Phoneme, n: number): Phoneme | undefined {
  const f = featuresOf(p);
  if (!f || f.type !== "vowel") return undefined;
  const idx = HEIGHT_ORDER.indexOf(f.height);
  if (idx < 0) return undefined;
  const target = Math.max(0, Math.min(HEIGHT_ORDER.length - 1, idx + n));
  // Try the exact target, then progressively widen the search band.
  for (let off = 0; off <= HEIGHT_ORDER.length; off++) {
    for (const sign of [1, -1]) {
      const heightIdx = target + off * sign;
      if (heightIdx < 0 || heightIdx >= HEIGHT_ORDER.length) continue;
      const wantedHeight = HEIGHT_ORDER[heightIdx]!;
      const wanted: VowelFeatures = { ...f, height: wantedHeight };
      const match = findVowel(wanted);
      if (match) return match;
      if (off === 0) break;
    }
  }
  return undefined;
}

/** Find the closest vowel in the inventory matching the given features. */
function findVowel(v: VowelFeatures): Phoneme | undefined {
  for (const [p, bundle] of Object.entries(PHONE_FEATURES)) {
    if (bundle.type !== "vowel") continue;
    if (
      bundle.height === v.height &&
      bundle.backness === v.backness &&
      bundle.round === v.round &&
      !!bundle.long === !!v.long
    ) {
      return p;
    }
  }
  // Relax the round constraint if no exact match.
  for (const [p, bundle] of Object.entries(PHONE_FEATURES)) {
    if (bundle.type !== "vowel") continue;
    if (bundle.height === v.height && bundle.backness === v.backness) return p;
  }
  return undefined;
}

/** Consonant in PHONE_FEATURES matching the given features exactly, or best fit. */
export function findConsonant(c: ConsonantFeatures): Phoneme | undefined {
  for (const [p, bundle] of Object.entries(PHONE_FEATURES)) {
    if (bundle.type !== "consonant") continue;
    if (
      bundle.place === c.place &&
      bundle.manner === c.manner &&
      bundle.voice === c.voice &&
      !!bundle.aspirated === !!c.aspirated &&
      !!bundle.palatalised === !!c.palatalised &&
      !!bundle.labialised === !!c.labialised
    ) {
      return p;
    }
  }
  // Relax secondary articulations.
  for (const [p, bundle] of Object.entries(PHONE_FEATURES)) {
    if (bundle.type !== "consonant") continue;
    if (
      bundle.place === c.place &&
      bundle.manner === c.manner &&
      bundle.voice === c.voice
    ) {
      return p;
    }
  }
  return undefined;
}

/**
 * Detect whether a phoneme sits "between vowels" given its neighbours.
 * Handles nullable neighbours at word edges.
 */
export function isIntervocalic(
  left: Phoneme | undefined,
  right: Phoneme | undefined,
): boolean {
  if (!left || !right) return false;
  return isVowel(left) && isVowel(right);
}
