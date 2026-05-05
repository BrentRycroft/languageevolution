import type { Language, WordForm } from "../types";
import { fnv1a } from "../rng";

export type ClosedClassLemma =
  | "the" | "a"
  | "in" | "on" | "at" | "to" | "from" | "by" | "with" | "for" | "of"
  | "under" | "over" | "through" | "near" | "after" | "before"
  | "and" | "or" | "but"
  | "because" | "when" | "while" | "if"
  | "not"
  | "very" | "now" | "then"
  | "this" | "that" | "that_near" | "that_far" | "that_remote"
  | "my" | "your" | "his" | "her" | "its" | "our" | "their"
  | "who" | "whom" | "whose" | "what" | "which"
  | "where" | "when" | "why" | "how"
  // Phase 29-2b: personal pronouns. Pre-29-2b "it", "I", "you" etc.
  // weren't in the closed-class table, so the reverse translator
  // emitted `kind:"missing"` for them on round-trips. Source of two
  // failing translator_roundtrip tests.
  | "i" | "me" | "you" | "he" | "him" | "she" | "we" | "us" | "they" | "them" | "it"
  // Phase 36 Tranche 36k: T-V politeness distinction. Synthesised
  // distinct forms via the per-lemma fnv1a hash; languages with
  // politenessRegister "T-V" (or "binary") use these in addition to
  // the bare "you".
  | "you_fml" | "you_fam"
  // Phase 36 Tranche 36j: logophoric pronouns.
  | "3sg.log" | "3pl.log"
  | "CLF"
  | "Q";

export const CLOSED_CLASS_LEMMAS: ClosedClassLemma[] = [
  "the", "a",
  "in", "on", "at", "to", "from", "by", "with", "for", "of",
  "under", "over", "through", "near", "after", "before",
  "and", "or", "but",
  "because", "when", "while", "if",
  "not",
  "very", "now", "then",
  "this", "that", "that_near", "that_far", "that_remote",
  "my", "your", "his", "her", "its", "our", "their",
  "who", "whom", "whose", "what", "which",
  "where", "when", "why", "how",
  "i", "me", "you", "he", "him", "she", "we", "us", "they", "them", "it",
  "you_fml", "you_fam",
  // Phase 36 Tranche 36j: logophoric pronouns. Distinct lemmas so
  // the closed-class synthesiser yields contrast against bare he/they.
  "3sg.log", "3pl.log",
  "CLF", "Q",
];

function pickPhone(
  inventory: readonly string[],
  hash: number,
  fallback: string,
): string {
  if (inventory.length === 0) return fallback;
  return inventory[hash % inventory.length]!;
}

function synthesise(lang: Language, lemma: string): WordForm {
  const inv = lang.phonemeInventory;
  const vowels = inv.segmental.filter((p) =>
    /^[aeiouɑəɛɪɔʊʌæiː]/i.test(p),
  );
  const consonants = inv.segmental.filter((p) => !vowels.includes(p));
  const invSig = inv.segmental.slice().sort().join("");
  const seed = fnv1a(`${lang.id}::${lang.name}::${invSig}::cc::${lemma}`);
  const v1 = pickPhone(vowels, seed >>> 4, "a");
  const v2 = pickPhone(vowels, seed >>> 12, "e");
  const c1 = pickPhone(consonants, seed >>> 0, "t");
  const c2 = pickPhone(consonants, seed >>> 8, "n");
  const c3 = pickPhone(consonants, seed >>> 16, "k");
  const targetLen =
    lemma === "the" || lemma === "a" || lemma === "and" || lemma === "or"
      ? 1 + ((seed >>> 20) & 1)
      : lemma === "but" || lemma === "if" || lemma === "not"
        ? 2 + ((seed >>> 22) & 1)
        : 3 + ((seed >>> 24) & 1);
  const segs: string[] = [];
  const startWithVowel = lemma === "the" || lemma === "a";
  const order = startWithVowel
    ? [v1, c1, v2, c2, c3]
    : [c1, v1, c2, v2, c3];
  for (let i = 0; i < targetLen && i < order.length; i++) {
    segs.push(order[i]!);
  }
  return segs;
}

const cache = new WeakMap<Language, Record<string, WordForm>>();

export function closedClassTable(lang: Language): Record<string, WordForm> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const out: Record<string, WordForm> = {};
  for (const lemma of CLOSED_CLASS_LEMMAS) {
    const seeded = lang.lexicon[lemma];
    out[lemma] = seeded && seeded.length > 0 ? seeded.slice() : synthesise(lang, lemma);
  }
  cache.set(lang, out);
  return out;
}

export function closedClassForm(
  lang: Language,
  lemma: string,
): WordForm | undefined {
  const remapped = remapDemonstrative(lang, lemma);
  const direct = closedClassTable(lang)[remapped];
  if (direct) return direct;
  return synthesise(lang, remapped);
}

/**
 * Phase 36 Tranche 36c/36i: when the language has a three-way or
 * four-way demonstrative system, a generic English "that" maps to
 * `that_near` (the medial/hearer-proximal slot). Distance lemmas
 * passed in directly (`that_far`, `that_remote`) pass through. A
 * two-way language receives the bare `"that"` form regardless.
 *
 * Phase 36 Tranche 36k: when the language has a T-V politeness
 * distinction, generic "you" maps to `you_fml` (the formal slot).
 * Speakers can opt into the familiar form by passing `you_fam`
 * directly. Languages without T-V politeness keep bare `"you"`.
 */
function remapDemonstrative(lang: Language, lemma: string): string {
  if (lemma === "that") {
    const d = lang.grammar.demonstrativeDistance ?? "two-way";
    if (d === "three-way" || d === "four-way") return "that_near";
    return "that";
  }
  if (lemma === "you") {
    const reg = lang.grammar.politenessRegister ?? "none";
    if (reg === "T-V" || reg === "binary") return "you_fml";
  }
  return lemma;
}
