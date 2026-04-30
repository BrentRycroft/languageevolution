import type { Phoneme } from "../primitives";
import { featuresOf, PHONE_FEATURES } from "./features";
import type { FeatureBundle, ConsonantFeatures, VowelFeatures, Manner, Place } from "./features";

const ALL: Phoneme[] = Object.keys(PHONE_FEATURES);

function buildSet(pred: (f: FeatureBundle, p: Phoneme) => boolean): ReadonlySet<Phoneme> {
  const out = new Set<Phoneme>();
  for (const p of ALL) {
    const f = featuresOf(p);
    if (f && pred(f, p)) out.add(p);
  }
  return out;
}

function isCons(f: FeatureBundle): f is ConsonantFeatures {
  return f.type === "consonant";
}
function isVow(f: FeatureBundle): f is VowelFeatures {
  return f.type === "vowel";
}

export const ALL_VOICED_CONSONANTS = buildSet((f) => isCons(f) && f.voice);
export const ALL_VOICELESS_CONSONANTS = buildSet((f) => isCons(f) && !f.voice);

export const STOPS = buildSet((f) => isCons(f) && f.manner === "stop");
export const FRICATIVES = buildSet((f) => isCons(f) && f.manner === "fricative");
export const AFFRICATES = buildSet((f) => isCons(f) && f.manner === "affricate");
export const NASALS = buildSet((f) => isCons(f) && f.manner === "nasal");
export const LIQUIDS = buildSet((f) => isCons(f) && (f.manner === "liquid" || f.manner === "trill" || f.manner === "tap"));
export const GLIDES = buildSet((f) => isCons(f) && f.manner === "glide");

export const VOICED_OBSTRUENTS = buildSet(
  (f) => isCons(f) && f.voice && (f.manner === "stop" || f.manner === "fricative" || f.manner === "affricate"),
);
export const VOICELESS_OBSTRUENTS = buildSet(
  (f) => isCons(f) && !f.voice && (f.manner === "stop" || f.manner === "fricative" || f.manner === "affricate"),
);

export const LABIAL_CONSONANTS = buildSet((f) => isCons(f) && (f.place === "labial" || f.place === "labiodental"));
export const VELAR_CONSONANTS = buildSet((f) => isCons(f) && f.place === "velar");
export const VELAR_STOPS = buildSet((f) => isCons(f) && f.place === "velar" && f.manner === "stop");
export const ALVEOLAR_CONSONANTS = buildSet((f) => isCons(f) && f.place === "alveolar");

export const FRONT_VOWELS = buildSet((f) => isVow(f) && f.backness === "front");
export const BACK_VOWELS = buildSet((f) => isVow(f) && f.backness === "back");
export const HIGH_VOWELS = buildSet((f) => isVow(f) && f.height === "high");
export const LOW_VOWELS = buildSet((f) => isVow(f) && f.height === "low");

export function isLongVowel(p: Phoneme): boolean {
  const f = featuresOf(p);
  if (!f || !isVow(f)) return false;
  return f.long === true || p.endsWith("ː");
}

export function isVoicedConsonant(p: Phoneme): boolean {
  const f = featuresOf(p);
  return !!f && isCons(f) && f.voice;
}

export function isVoicelessConsonant(p: Phoneme): boolean {
  const f = featuresOf(p);
  return !!f && isCons(f) && !f.voice;
}

export function isVoicedObstruent(p: Phoneme): boolean {
  const f = featuresOf(p);
  if (!f || !isCons(f)) return false;
  if (!f.voice) return false;
  return f.manner === "stop" || f.manner === "fricative" || f.manner === "affricate";
}

export function isVelarStop(p: Phoneme): boolean {
  const f = featuresOf(p);
  return !!f && isCons(f) && f.place === "velar" && f.manner === "stop";
}

export function isFrontVowel(p: Phoneme): boolean {
  const f = featuresOf(p);
  return !!f && isVow(f) && f.backness === "front";
}

export function placeOf(p: Phoneme): Place | undefined {
  const f = featuresOf(p);
  return f && isCons(f) ? f.place : undefined;
}

export function mannerOf(p: Phoneme): Manner | undefined {
  const f = featuresOf(p);
  return f && isCons(f) ? f.manner : undefined;
}

const DIACRITIC_RE = /([ʰʷʲː]|̩|̥)+$/u;

export function diacriticTail(p: Phoneme): string {
  const m = p.match(DIACRITIC_RE);
  return m ? m[0] : "";
}

export function mirrorDiacritics(source: Phoneme, target: Phoneme): Phoneme {
  const tail = diacriticTail(source);
  if (!tail) return target;
  if (target.endsWith(tail)) return target;
  return target + tail;
}

