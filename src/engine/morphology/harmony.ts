import type { Phoneme, WordForm } from "../types";
import { featuresOf } from "../phonology/features";

export type HarmonyKind = "none" | "front-back" | "rounding" | "atr";

const FRONT_BACK_PAIRS: Record<string, string> = {
  i: "ɯ", "ɨ": "ɯ", e: "o", "ɛ": "ɔ", y: "u", "ø": "o", "œ": "ɔ", æ: "ɑ",
  "ɯ": "i", o: "e", "ɔ": "ɛ", u: "y", "ɑ": "æ",
};

const ROUNDING_PAIRS: Record<string, string> = {
  i: "y", e: "ø", "ɛ": "œ",
  u: "ɯ", o: "ɤ", "ɔ": "ʌ",
  y: "i", "ø": "e", "œ": "ɛ",
  "ɯ": "u", "ɤ": "o", "ʌ": "ɔ",
};

const ATR_PAIRS: Record<string, string> = {
  i: "ɪ", e: "ɛ", u: "ʊ", o: "ɔ", a: "ɑ",
  "ɪ": "i", "ɛ": "e", "ʊ": "u", "ɔ": "o", "ɑ": "a",
};

function dominantStemVowel(stem: WordForm): Phoneme | null {
  for (let i = stem.length - 1; i >= 0; i--) {
    const p = stripDiacritics(stem[i]!);
    const f = featuresOf(p);
    if (f && f.type === "vowel") return p;
  }
  return null;
}

function stripDiacritics(p: Phoneme): Phoneme {
  return p.replace(/[ːˈˌ˥˧˩˧˥˥˩]/gu, "");
}

function harmonizeFrontBack(affix: WordForm, stemVowel: Phoneme): WordForm {
  const stemFeatures = featuresOf(stripDiacritics(stemVowel));
  if (!stemFeatures || stemFeatures.type !== "vowel") return affix;
  const wantBack = stemFeatures.backness === "back";
  return affix.map((p) => {
    const base = stripDiacritics(p);
    const f = featuresOf(base);
    if (!f || f.type !== "vowel") return p;
    const isBack = f.backness === "back";
    if (isBack === wantBack) return p;
    const pair = FRONT_BACK_PAIRS[base];
    if (!pair) return p;
    return p.length > base.length ? pair + p.slice(base.length) : pair;
  });
}

function harmonizeRounding(affix: WordForm, stemVowel: Phoneme): WordForm {
  const stemFeatures = featuresOf(stripDiacritics(stemVowel));
  if (!stemFeatures || stemFeatures.type !== "vowel") return affix;
  const wantRound = stemFeatures.round === true;
  return affix.map((p) => {
    const base = stripDiacritics(p);
    const f = featuresOf(base);
    if (!f || f.type !== "vowel") return p;
    if (f.round === wantRound) return p;
    const pair = ROUNDING_PAIRS[base];
    if (!pair) return p;
    return p.length > base.length ? pair + p.slice(base.length) : pair;
  });
}

function harmonizeAtr(affix: WordForm, stemVowel: Phoneme): WordForm {
  const stemFeatures = featuresOf(stripDiacritics(stemVowel));
  if (!stemFeatures || stemFeatures.type !== "vowel") return affix;
  const wantTense = stemFeatures.tense !== false;
  return affix.map((p) => {
    const base = stripDiacritics(p);
    const f = featuresOf(base);
    if (!f || f.type !== "vowel") return p;
    const isTense = f.tense !== false;
    if (isTense === wantTense) return p;
    const pair = ATR_PAIRS[base];
    if (!pair) return p;
    return p.length > base.length ? pair + p.slice(base.length) : pair;
  });
}

export function harmonizeAffix(
  affix: WordForm,
  stem: WordForm,
  kind: HarmonyKind | undefined,
): WordForm {
  if (!kind || kind === "none") return affix;
  const stemVowel = dominantStemVowel(stem);
  if (!stemVowel) return affix;
  switch (kind) {
    case "front-back":
      return harmonizeFrontBack(affix, stemVowel);
    case "rounding":
      return harmonizeRounding(affix, stemVowel);
    case "atr":
      return harmonizeAtr(affix, stemVowel);
    default:
      return affix;
  }
}
