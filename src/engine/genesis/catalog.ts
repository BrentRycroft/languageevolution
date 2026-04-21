import type { GenesisRule } from "./types";
import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";
import { isVowel, isConsonant } from "../phonology/ipa";

function pickMeanings(lang: Language, rng: Rng, n: number): Meaning[] {
  const keys = Object.keys(lang.lexicon);
  if (keys.length < n) return [];
  const chosen: Meaning[] = [];
  const used = new Set<number>();
  while (chosen.length < n && used.size < keys.length) {
    const idx = rng.int(keys.length);
    if (used.has(idx)) continue;
    used.add(idx);
    chosen.push(keys[idx]!);
  }
  return chosen;
}

const SUFFIXES: ReadonlyArray<{ affix: WordForm; semanticSuffix: string }> = [
  { affix: ["e", "r"], semanticSuffix: "-er" },
  { affix: ["n", "e", "s"], semanticSuffix: "-ness" },
  { affix: ["i", "k"], semanticSuffix: "-ic" },
  { affix: ["a", "l"], semanticSuffix: "-al" },
  { affix: ["i", "n"], semanticSuffix: "-ine" },
];

export const GENESIS_CATALOG: GenesisRule[] = [
  {
    id: "genesis.compound",
    label: "A + B → AB",
    category: "compound",
    description: "Concatenate two existing forms; register under combined meaning.",
    enabledByDefault: true,
    baseWeight: 1,
    tryCoin: (lang, rng) => {
      const [a, b] = pickMeanings(lang, rng, 2);
      if (!a || !b || a === b) return null;
      const newMeaning: Meaning = `${a}-${b}`;
      if (lang.lexicon[newMeaning]) return null;
      const fa = lang.lexicon[a]!;
      const fb = lang.lexicon[b]!;
      if (fa.length + fb.length > 10) return null;
      return { meaning: newMeaning, form: [...fa, ...fb] };
    },
  },
  {
    id: "genesis.derivation",
    label: "A + affix → A'",
    category: "derivation",
    description: "Attach a productive affix to an existing form.",
    enabledByDefault: true,
    baseWeight: 1,
    tryCoin: (lang, rng) => {
      const meanings = Object.keys(lang.lexicon);
      if (meanings.length === 0) return null;
      const base = meanings[rng.int(meanings.length)]!;
      const suffix = SUFFIXES[rng.int(SUFFIXES.length)]!;
      const newMeaning: Meaning = `${base}${suffix.semanticSuffix}`;
      if (lang.lexicon[newMeaning]) return null;
      const baseForm = lang.lexicon[base]!;
      if (baseForm.length + suffix.affix.length > 10) return null;
      return { meaning: newMeaning, form: [...baseForm, ...suffix.affix] };
    },
  },
  {
    id: "genesis.reduplication",
    label: "A → AA",
    category: "reduplication",
    description: "Reduplicate a short word as an intensified form.",
    enabledByDefault: false,
    baseWeight: 1,
    tryCoin: (lang, rng) => {
      const meanings = Object.keys(lang.lexicon);
      if (meanings.length === 0) return null;
      const base = meanings[rng.int(meanings.length)]!;
      const newMeaning: Meaning = `${base}-intens`;
      if (lang.lexicon[newMeaning]) return null;
      const form = lang.lexicon[base]!;
      if (form.length === 0 || form.length > 4) return null;
      const first = form[0]!;
      const second = form[1];
      const redup: WordForm =
        second && isVowel(second)
          ? [first, second]
          : isConsonant(first)
            ? [first, "a"]
            : [first];
      return { meaning: newMeaning, form: [...redup, ...form] };
    },
  },
];

export const GENESIS_BY_ID: Record<string, GenesisRule> = Object.fromEntries(
  GENESIS_CATALOG.map((g) => [g.id, g]),
);
