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
  aspirated?: boolean;
  palatalised?: boolean;
  labialised?: boolean;
}

export interface VowelFeatures {
  type: "vowel";
  height: Height;
  backness: Backness;
  round: boolean;
  nasal?: boolean;
  long?: boolean;
  tense?: boolean;
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
};

export type FeatureQuery =
  | ({ type?: "consonant" } & Partial<Omit<ConsonantFeatures, "type">>)
  | ({ type?: "vowel" } & Partial<Omit<VowelFeatures, "type">>);

const HEIGHT_ORDER: Height[] = ["low", "mid-low", "mid", "mid-high", "high"];

const FEATURES_CACHE = new Map<Phoneme, FeatureBundle | undefined>();
const TONE_MARKS = ["˥", "˧", "˩", "˧˥", "˥˩"];

export function featuresOf(p: Phoneme): FeatureBundle | undefined {
  if (PHONE_FEATURES[p]) return PHONE_FEATURES[p];
  if (FEATURES_CACHE.has(p)) return FEATURES_CACHE.get(p);
  const computed = computeFeatures(p);
  FEATURES_CACHE.set(p, computed);
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

export function matchesQuery(p: Phoneme, q: FeatureQuery | undefined): boolean {
  if (!q) return true;
  const f = featuresOf(p);
  if (!f) return false;
  if (q.type && f.type !== q.type) return false;
  const fRecord = f as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(q)) {
    if (k === "type") continue;
    if (v === undefined) continue;
    if (fRecord[k] !== v) return false;
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
  for (const [p, bundle] of Object.entries(PHONE_FEATURES)) {
    if (bundle.type !== "vowel") continue;
    if (bundle.height === v.height && bundle.backness === v.backness) return p;
  }
  return undefined;
}

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

export function isIntervocalic(
  left: Phoneme | undefined,
  right: Phoneme | undefined,
): boolean {
  if (!left || !right) return false;
  return isVowel(left) && isVowel(right);
}
