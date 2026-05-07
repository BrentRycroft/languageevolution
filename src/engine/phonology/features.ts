import type { Phoneme } from "../primitives";
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
  | "lateral-fricative"
  | "nasal"
  | "liquid"
  | "tap"
  | "trill"
  | "glide"
  | "approximant"
  | "lateral-approximant";

export type Height = "high" | "mid-high" | "mid" | "mid-low" | "low";
export type Backness = "front" | "central" | "back";

export interface ConsonantFeatures {
  type: "consonant";
  place: Place;
  manner: Manner;
  voice: boolean;
  aspirated?: boolean;
  palatalised?: boolean;
  labialised?: boolean;
  // Phase 48 T5: phonation contrasts. Implosive (ɓ ɗ ʄ ɠ ʛ), breathy
  // (b̤ d̤ — Indo-Aryan murmured stops), creaky (b̰ — !Xóõ, Atayal).
  implosive?: boolean;
  breathy?: boolean;
  creaky?: boolean;
}

export interface VowelFeatures {
  type: "vowel";
  height: Height;
  backness: Backness;
  round: boolean;
  nasal?: boolean;
  long?: boolean;
  tense?: boolean;
  // Phase 48 T5: vowel diacritic flags for the missing IPA cardinals.
  // `centralized` → ̈ (a centralised vowel), `advanced` → ̟,
  // `retracted` → ̠. Used by `findVowel` for feature-based search.
  centralized?: boolean;
  advanced?: boolean;
  retracted?: boolean;
}

export type FeatureBundle = ConsonantFeatures | VowelFeatures;

export const PHONE_FEATURES: Record<string, FeatureBundle> = {
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
  "pʼ": { type: "consonant", place: "labial", manner: "stop", voice: false },
  "tʼ": { type: "consonant", place: "alveolar", manner: "stop", voice: false },
  "kʼ": { type: "consonant", place: "velar", manner: "stop", voice: false },
  "qʼ": { type: "consonant", place: "uvular", manner: "stop", voice: false },
  "tsʼ": { type: "consonant", place: "alveolar", manner: "affricate", voice: false },
  "tʃʼ": { type: "consonant", place: "postalveolar", manner: "affricate", voice: false },
  "ʔp": { type: "consonant", place: "labial", manner: "stop", voice: false },
  "ʔt": { type: "consonant", place: "alveolar", manner: "stop", voice: false },
  "ʔk": { type: "consonant", place: "velar", manner: "stop", voice: false },
  "ʈ": { type: "consonant", place: "retroflex", manner: "stop", voice: false },
  "ɖ": { type: "consonant", place: "retroflex", manner: "stop", voice: true },

  "kʲ": { type: "consonant", place: "velar", manner: "stop", voice: false, palatalised: true },
  "gʲ": { type: "consonant", place: "velar", manner: "stop", voice: true, palatalised: true },
  "gʲʰ": { type: "consonant", place: "velar", manner: "stop", voice: true, palatalised: true, aspirated: true },
  "ḱ": { type: "consonant", place: "velar", manner: "stop", voice: false, palatalised: true },
  "ǵ": { type: "consonant", place: "velar", manner: "stop", voice: true, palatalised: true },
  "ǵʰ": { type: "consonant", place: "velar", manner: "stop", voice: true, palatalised: true, aspirated: true },
  "kʷ": { type: "consonant", place: "velar", manner: "stop", voice: false, labialised: true },
  "gʷ": { type: "consonant", place: "velar", manner: "stop", voice: true, labialised: true },
  "gʷʰ": { type: "consonant", place: "velar", manner: "stop", voice: true, labialised: true, aspirated: true },

  "h₁": { type: "consonant", place: "glottal", manner: "fricative", voice: false },
  "h₂": { type: "consonant", place: "pharyngeal", manner: "fricative", voice: false },
  "h₃": { type: "consonant", place: "pharyngeal", manner: "fricative", voice: true, labialised: true },

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

  "tʃ": { type: "consonant", place: "postalveolar", manner: "affricate", voice: false },
  "dʒ": { type: "consonant", place: "postalveolar", manner: "affricate", voice: true },
  ts: { type: "consonant", place: "alveolar", manner: "affricate", voice: false },
  dz: { type: "consonant", place: "alveolar", manner: "affricate", voice: true },

  m: { type: "consonant", place: "labial", manner: "nasal", voice: true },
  n: { type: "consonant", place: "alveolar", manner: "nasal", voice: true },
  "ɲ": { type: "consonant", place: "palatal", manner: "nasal", voice: true },
  "ŋ": { type: "consonant", place: "velar", manner: "nasal", voice: true },
  // Prenasalised velar stop, Proto-Germanic spelling /ⁿg/. Behaves featurally
  // like a velar stop with a leading nasal release. Single-codepoint
  // representation U+207F U+0067 (modifier-N + g).
  "ⁿg": { type: "consonant", place: "velar", manner: "stop", voice: true },
  "ɳ": { type: "consonant", place: "retroflex", manner: "nasal", voice: true },
  "m̩": { type: "consonant", place: "labial", manner: "nasal", voice: true },
  "n̩": { type: "consonant", place: "alveolar", manner: "nasal", voice: true },
  "m̥": { type: "consonant", place: "labial", manner: "nasal", voice: true },
  "n̥": { type: "consonant", place: "alveolar", manner: "nasal", voice: true },

  l: { type: "consonant", place: "alveolar", manner: "liquid", voice: true },
  r: { type: "consonant", place: "alveolar", manner: "trill", voice: true },
  "ɾ": { type: "consonant", place: "alveolar", manner: "tap", voice: true },
  "ɹ": { type: "consonant", place: "alveolar", manner: "approximant", voice: true },
  "ʀ": { type: "consonant", place: "uvular", manner: "trill", voice: true },
  "l̩": { type: "consonant", place: "alveolar", manner: "liquid", voice: true },
  "r̩": { type: "consonant", place: "alveolar", manner: "trill", voice: true },
  "l̥": { type: "consonant", place: "alveolar", manner: "liquid", voice: true },
  "r̥": { type: "consonant", place: "alveolar", manner: "trill", voice: true },

  w: { type: "consonant", place: "velar", manner: "glide", voice: true, labialised: true },
  j: { type: "consonant", place: "palatal", manner: "glide", voice: true },
  "ɥ": { type: "consonant", place: "palatal", manner: "glide", voice: true, labialised: true },
  "w̥": { type: "consonant", place: "velar", manner: "glide", voice: true, labialised: true },
  "y̥": { type: "consonant", place: "palatal", manner: "glide", voice: true },

  i: { type: "vowel", height: "high", backness: "front", round: false },
  y: { type: "vowel", height: "high", backness: "front", round: true },
  "ɨ": { type: "vowel", height: "high", backness: "central", round: false },
  u: { type: "vowel", height: "high", backness: "back", round: true },
  "ɯ": { type: "vowel", height: "high", backness: "back", round: false },
  e: { type: "vowel", height: "mid-high", backness: "front", round: false },
  "ø": { type: "vowel", height: "mid-high", backness: "front", round: true },
  "ə": { type: "vowel", height: "mid", backness: "central", round: false },
  "ʌ": { type: "vowel", height: "mid-low", backness: "back", round: false },
  o: { type: "vowel", height: "mid-high", backness: "back", round: true },
  "ɛ": { type: "vowel", height: "mid-low", backness: "front", round: false },
  "œ": { type: "vowel", height: "mid-low", backness: "front", round: true },
  "ɔ": { type: "vowel", height: "mid-low", backness: "back", round: true },
  a: { type: "vowel", height: "low", backness: "central", round: false },
  "æ": { type: "vowel", height: "low", backness: "front", round: false },
  "ɑ": { type: "vowel", height: "low", backness: "back", round: false },
  "ɒ": { type: "vowel", height: "low", backness: "back", round: true },
  "ɪ": { type: "vowel", height: "high", backness: "front", round: false, tense: false },
  "ʊ": { type: "vowel", height: "high", backness: "back", round: true, tense: false },
  "ʏ": { type: "vowel", height: "high", backness: "front", round: true, tense: false },
  "á": { type: "vowel", height: "low", backness: "central", round: false },
  "é": { type: "vowel", height: "mid-high", backness: "front", round: false },
  "í": { type: "vowel", height: "high", backness: "front", round: false },
  "ó": { type: "vowel", height: "mid-high", backness: "back", round: true },
  "ú": { type: "vowel", height: "high", backness: "back", round: true },
  "ā": { type: "vowel", height: "low", backness: "central", round: false, long: true },
  "ē": { type: "vowel", height: "mid-high", backness: "front", round: false, long: true },
  "ī": { type: "vowel", height: "high", backness: "front", round: false, long: true },
  "ō": { type: "vowel", height: "mid-high", backness: "back", round: true, long: true },
  "ū": { type: "vowel", height: "high", backness: "back", round: true, long: true },
  "ḗ": { type: "vowel", height: "mid-high", backness: "front", round: false, long: true },
  // Nasal vowels (Phase 20e). Used by Proto-Germanic and Romance presets
  // for historical nasalisation. Stored as single codepoints (precomposed
  // tilde) so both `formToString` and lookup work without combining-mark
  // sequences.
  "ã": { type: "vowel", height: "low", backness: "central", round: false, nasal: true },
  "ẽ": { type: "vowel", height: "mid-high", backness: "front", round: false, nasal: true },
  "ĩ": { type: "vowel", height: "high", backness: "front", round: false, nasal: true },
  "õ": { type: "vowel", height: "mid-high", backness: "back", round: true, nasal: true },
  "ũ": { type: "vowel", height: "high", backness: "back", round: true, nasal: true },

  // Phase 48 T6: missing pulmonic consonants from IPA-2020.
  // Plosives
  "c": { type: "consonant", place: "palatal", manner: "stop", voice: false },
  "ɟ": { type: "consonant", place: "palatal", manner: "stop", voice: true },
  "ɢ": { type: "consonant", place: "uvular", manner: "stop", voice: true },
  // Nasals
  "ɱ": { type: "consonant", place: "labiodental", manner: "nasal", voice: true },
  "ɴ": { type: "consonant", place: "uvular", manner: "nasal", voice: true },
  // Trills + taps
  "ʙ": { type: "consonant", place: "labial", manner: "trill", voice: true },
  "ⱱ": { type: "consonant", place: "labiodental", manner: "tap", voice: true },
  "ɽ": { type: "consonant", place: "retroflex", manner: "tap", voice: true },
  // Fricatives
  "ɸ": { type: "consonant", place: "labial", manner: "fricative", voice: false },
  "ç": { type: "consonant", place: "palatal", manner: "fricative", voice: false },
  "ʝ": { type: "consonant", place: "palatal", manner: "fricative", voice: true },
  "χ": { type: "consonant", place: "uvular", manner: "fricative", voice: false },
  "ʁ": { type: "consonant", place: "uvular", manner: "fricative", voice: true },
  "ʕ": { type: "consonant", place: "pharyngeal", manner: "fricative", voice: true },
  "ɦ": { type: "consonant", place: "glottal", manner: "fricative", voice: true },
  // Lateral fricatives (new manner)
  "ɬ": { type: "consonant", place: "alveolar", manner: "lateral-fricative", voice: false },
  "ɮ": { type: "consonant", place: "alveolar", manner: "lateral-fricative", voice: true },
  // Approximants
  "ʋ": { type: "consonant", place: "labiodental", manner: "approximant", voice: true },
  "ɻ": { type: "consonant", place: "retroflex", manner: "approximant", voice: true },
  "ɰ": { type: "consonant", place: "velar", manner: "approximant", voice: true },
  // Lateral approximants (uses new manner)
  "ɭ": { type: "consonant", place: "retroflex", manner: "lateral-approximant", voice: true },
  "ʎ": { type: "consonant", place: "palatal", manner: "lateral-approximant", voice: true },
  "ʟ": { type: "consonant", place: "velar", manner: "lateral-approximant", voice: true },

  // Phase 48 T7: voiced implosives (ɓ ɗ ʄ ɠ ʛ).
  "ɓ": { type: "consonant", place: "labial", manner: "stop", voice: true, implosive: true },
  "ɗ": { type: "consonant", place: "alveolar", manner: "stop", voice: true, implosive: true },
  "ʄ": { type: "consonant", place: "palatal", manner: "stop", voice: true, implosive: true },
  "ɠ": { type: "consonant", place: "velar", manner: "stop", voice: true, implosive: true },
  "ʛ": { type: "consonant", place: "uvular", manner: "stop", voice: true, implosive: true },

  // Phase 48 T7: missing IPA cardinal vowels.
  "ɘ": { type: "vowel", height: "mid-high", backness: "central", round: false },
  "ɵ": { type: "vowel", height: "mid-high", backness: "central", round: true },
  "ɤ": { type: "vowel", height: "mid-high", backness: "back", round: false },
  "ɞ": { type: "vowel", height: "mid-low", backness: "central", round: true },
  "ɜ": { type: "vowel", height: "mid-low", backness: "central", round: false },
  "ɐ": { type: "vowel", height: "low", backness: "central", round: false, advanced: true },
  "ɶ": { type: "vowel", height: "low", backness: "front", round: true },
  "ä": { type: "vowel", height: "low", backness: "central", round: false, centralized: true },
};

export type FeatureQuery =
  | ({ type?: "consonant" } & Partial<Omit<ConsonantFeatures, "type">>)
  | ({ type?: "vowel" } & Partial<Omit<VowelFeatures, "type">>);

const HEIGHT_ORDER: Height[] = ["low", "mid-low", "mid", "mid-high", "high"];

const FEATURES_CACHE: Record<string, FeatureBundle | null> = Object.create(null);
const TONE_MARKS = ["˥", "˧", "˩", "˧˥", "˥˩"];

export function featuresOf(p: Phoneme): FeatureBundle | undefined {
  const direct = PHONE_FEATURES[p];
  if (direct) return direct;
  const cached = FEATURES_CACHE[p];
  if (cached !== undefined) return cached === null ? undefined : cached;
  const computed = computeFeatures(p);
  FEATURES_CACHE[p] = computed ?? null;
  return computed;
}

function computeFeatures(p: Phoneme): FeatureBundle | undefined {
  for (const m of TONE_MARKS) {
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
  if (p.endsWith("ʰ")) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f && f.type === "consonant") return { ...f, aspirated: true };
  }
  if (p.endsWith("ʷ")) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f && f.type === "consonant") return { ...f, labialised: true };
  }
  if (p.endsWith("ʲ")) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f && f.type === "consonant") return { ...f, palatalised: true };
  }
  if (p.length >= 2 && (p.endsWith("̥") || p.endsWith("̩"))) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f) return f;
  }
  if (p.length >= 2 && p.endsWith("́")) {
    const base = p.slice(0, -1);
    const f = PHONE_FEATURES[base];
    if (f) return f;
  }
  return undefined;
}

const QUERY_KEYS_CACHE = new WeakMap<object, Array<[string, unknown]>>();

function queryEntries(q: FeatureQuery): Array<[string, unknown]> {
  const cached = QUERY_KEYS_CACHE.get(q as object);
  if (cached) return cached;
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(q)) {
    if (k === "type") continue;
    if (v === undefined) continue;
    out.push([k, v]);
  }
  QUERY_KEYS_CACHE.set(q as object, out);
  return out;
}

export function matchesQuery(p: Phoneme, q: FeatureQuery | undefined): boolean {
  if (!q) return true;
  const f = featuresOf(p);
  if (!f) return false;
  if (q.type && f.type !== q.type) return false;
  const entries = queryEntries(q);
  const fRecord = f as unknown as Record<string, unknown>;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (fRecord[e[0]] !== e[1]) return false;
  }
  return true;
}

export function shiftHeight(p: Phoneme, n: number): Phoneme | undefined {
  const f = featuresOf(p);
  if (!f || f.type !== "vowel") return undefined;
  const idx = HEIGHT_ORDER.indexOf(f.height);
  if (idx < 0) return undefined;
  const target = Math.max(0, Math.min(HEIGHT_ORDER.length - 1, idx + n));
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

// (findVowel exported below — see Phase 48 T7 expanded version.)

export function findConsonant(c: ConsonantFeatures): Phoneme | undefined {
  // Pass 1: full match — every feature flag must agree.
  for (const [p, bundle] of Object.entries(PHONE_FEATURES)) {
    if (bundle.type !== "consonant") continue;
    if (
      bundle.place === c.place &&
      bundle.manner === c.manner &&
      bundle.voice === c.voice &&
      !!bundle.aspirated === !!c.aspirated &&
      !!bundle.palatalised === !!c.palatalised &&
      !!bundle.labialised === !!c.labialised &&
      // Phase 48 T5 + T7: phonation contrasts must match too.
      !!bundle.implosive === !!c.implosive &&
      !!bundle.breathy === !!c.breathy &&
      !!bundle.creaky === !!c.creaky
    ) {
      return p;
    }
  }
  // Pass 2: relaxed match — only place/manner/voice agree.
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
 * Phase 48 T7: feature-based vowel search.
 *
 * Pass 1 enforces every flag (height, backness, round, nasal, long,
 * tense, centralized, advanced, retracted). Pass 2 relaxes to just
 * height/backness/round so a query for "any mid-high back unrounded
 * vowel" still recovers something even if no exact match exists.
 */
export function findVowel(v: VowelFeatures): Phoneme | undefined {
  for (const [p, bundle] of Object.entries(PHONE_FEATURES)) {
    if (bundle.type !== "vowel") continue;
    if (
      bundle.height === v.height &&
      bundle.backness === v.backness &&
      bundle.round === v.round &&
      !!bundle.nasal === !!v.nasal &&
      !!bundle.long === !!v.long &&
      !!bundle.tense === !!v.tense &&
      !!bundle.centralized === !!v.centralized &&
      !!bundle.advanced === !!v.advanced &&
      !!bundle.retracted === !!v.retracted
    ) {
      return p;
    }
  }
  for (const [p, bundle] of Object.entries(PHONE_FEATURES)) {
    if (bundle.type !== "vowel") continue;
    if (
      bundle.height === v.height &&
      bundle.backness === v.backness &&
      bundle.round === v.round
    ) {
      return p;
    }
  }
  return undefined;
}

export function isIntervocalic(
  left: Phoneme | undefined,
  right: Phoneme | undefined,
): boolean {
  if (!left || !right) return false;
  return isVowel(left) && isVowel(right);
}
