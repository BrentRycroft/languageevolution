import type { Language, WordForm } from "../types";
import { fnv1a } from "../rng";

/**
 * Deterministic per-language closed-class forms.
 *
 * Real languages don't borrow English `the`, `a`, `in`, `and` directly
 * — every language has its own short closed-class vocabulary. The
 * translator needs a way to emit a plausible target-language token for
 * each closed-class English lemma so the output reads like a real
 * sentence rather than dropping them silently (the previous behaviour).
 *
 * Forms are *synthesised* from the language's phoneme inventory + a
 * stable seed-derived hash. They are not coined into the lexicon (no
 * impact on cognate detection) — they live in this lookup only. So a
 * language may have a completely different closed-class system than its
 * sister, even though it inherits all the same content roots.
 *
 * The functions are deterministic given (lang.id, lemma) so repeated
 * translations of the same sentence in the same language produce
 * identical output.
 */

export type ClosedClassLemma =
  | "the" | "a"
  | "in" | "on" | "at" | "to" | "from" | "by" | "with" | "for" | "of"
  | "under" | "over" | "through" | "near" | "after" | "before"
  | "and" | "or" | "but"
  | "because" | "when" | "while" | "if"
  | "not"
  | "very" | "now" | "then"
  // Demonstratives — every language synthesises a distinct token
  // even when the language's lexicon also has "this"/"that".
  | "this" | "that"
  // Possessive determiners — each language synthesises distinct
  // tokens. Languages that conflate (e.g. genitive of pronoun)
  // ignore the synthesised form via the open-class lookup chain.
  | "my" | "your" | "his" | "her" | "its" | "our" | "their"
  // Numeral classifier: synthesised once per language; emitted
  // between numeral + noun when `lang.grammar.classifierSystem` is
  // true (Mandarin 个, Japanese 本, etc.).
  | "CLF"
  // Yes/no question particle: synthesised once; emitted at the
  // start or end of an interrogative when
  // `lang.grammar.interrogativeStrategy === "particle"`.
  | "Q";

const CLOSED_CLASS_LEMMAS: ClosedClassLemma[] = [
  "the", "a",
  "in", "on", "at", "to", "from", "by", "with", "for", "of",
  "under", "over", "through", "near", "after", "before",
  "and", "or", "but",
  "because", "when", "while", "if",
  "not",
  "very", "now", "then",
  "this", "that",
  "my", "your", "his", "her", "its", "our", "their",
  "CLF", "Q",
];

/**
 * Pick one phoneme from the language's inventory using a stable hash.
 * Falls back to common defaults if the inventory is empty.
 */
function pickPhone(
  inventory: readonly string[],
  hash: number,
  fallback: string,
): string {
  if (inventory.length === 0) return fallback;
  return inventory[hash % inventory.length]!;
}

/**
 * Build a target-language form for a closed-class English lemma.
 * Articles + conjunctions tend to be very short (1-2 phonemes);
 * prepositions slightly longer (2-3); subordinators longer (2-4).
 */
function synthesise(lang: Language, lemma: ClosedClassLemma): WordForm {
  const inv = lang.phonemeInventory;
  const vowels = inv.segmental.filter((p) =>
    /^[aeiouɑəɛɪɔʊʌæiː]/i.test(p),
  );
  const consonants = inv.segmental.filter((p) => !vowels.includes(p));
  // Hash includes the language's id, name, and phoneme-inventory
  // signature so that two unrelated languages with the same id but
  // different inventories or names diverge on closed-class forms. The
  // inventory string is sorted to keep the hash deterministic.
  const invSig = inv.segmental.slice().sort().join("");
  const seed = fnv1a(`${lang.id}::${lang.name}::${invSig}::cc::${lemma}`);
  const v1 = pickPhone(vowels, seed >>> 4, "a");
  const v2 = pickPhone(vowels, seed >>> 12, "e");
  const c1 = pickPhone(consonants, seed >>> 0, "t");
  const c2 = pickPhone(consonants, seed >>> 8, "n");
  const c3 = pickPhone(consonants, seed >>> 16, "k");
  // Length profile by syntactic weight.
  const targetLen =
    lemma === "the" || lemma === "a" || lemma === "and" || lemma === "or"
      ? 1 + ((seed >>> 20) & 1) // 1-2 phonemes
      : lemma === "but" || lemma === "if" || lemma === "not"
        ? 2 + ((seed >>> 22) & 1) // 2-3
        : 3 + ((seed >>> 24) & 1); // 3-4 for prepositions/subordinators
  const segs: string[] = [];
  // CV(C(V)) shape, biased to start with a consonant for prepositions
  // and a vowel for the article.
  const startWithVowel = lemma === "the" || lemma === "a";
  const order = startWithVowel
    ? [v1, c1, v2, c2, c3]
    : [c1, v1, c2, v2, c3];
  for (let i = 0; i < targetLen && i < order.length; i++) {
    segs.push(order[i]!);
  }
  return segs;
}

/**
 * Build (and memoise) the closed-class table for a language.
 */
const cache = new WeakMap<Language, Record<string, WordForm>>();

export function closedClassTable(lang: Language): Record<string, WordForm> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const out: Record<string, WordForm> = {};
  for (const lemma of CLOSED_CLASS_LEMMAS) {
    out[lemma] = synthesise(lang, lemma);
  }
  cache.set(lang, out);
  return out;
}

/**
 * Look up a closed-class English lemma's target-language form, or
 * undefined if the lemma isn't tracked. Convenience wrapper around
 * closedClassTable.
 */
export function closedClassForm(
  lang: Language,
  lemma: string,
): WordForm | undefined {
  return closedClassTable(lang)[lemma];
}
