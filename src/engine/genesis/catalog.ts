import type { GenesisRule } from "./types";
import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";
import { isVowel, isConsonant } from "../phonology/ipa";
import { neighborsOf } from "../semantics/neighbors";
import { relatedMeanings } from "../semantics/clusters";
import { phonotacticFit } from "./phonotactics";
import { otFit } from "../phonology/ot";
import { complexityFor } from "../lexicon/complexity";

function combinedFit(form: WordForm, lang: Language): number {
  return 0.5 * phonotacticFit(form, lang) + 0.5 * otFit(form, lang);
}

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

const FALLBACK_SUFFIXES: ReadonlyArray<{ affix: WordForm; semanticSuffix: string }> = [
  { affix: ["e", "r"], semanticSuffix: "-er" },
  { affix: ["n", "e", "s"], semanticSuffix: "-ness" },
  { affix: ["i", "k"], semanticSuffix: "-ic" },
  { affix: ["a", "l"], semanticSuffix: "-al" },
  { affix: ["i", "n"], semanticSuffix: "-ine" },
];

function suffixPool(lang: Language): ReadonlyArray<{ affix: WordForm; semanticSuffix: string }> {
  const custom = lang.derivationalSuffixes;
  if (custom && custom.length > 0) {
    return custom.map((s) => ({ affix: s.affix, semanticSuffix: s.tag }));
  }
  return FALLBACK_SUFFIXES;
}

export const GENESIS_CATALOG: GenesisRule[] = [
  {
    id: "genesis.compound",
    label: "A + B → AB",
    category: "compound",
    description: "Concatenate two existing forms; register under combined meaning.",
    enabledByDefault: true,
    baseWeight: 1,
    tryCoin: (lang, rng) => {
      let a: Meaning | undefined;
      let b: Meaning | undefined;
      const meanings = Object.keys(lang.lexicon);
      if (meanings.length === 0) return null;
      if (rng.chance(0.7)) {
        a = meanings[rng.int(meanings.length)];
        const pool = a
          ? relatedMeanings(a).filter((n) => lang.lexicon[n])
          : [];
        const legacy = a ? neighborsOf(a).filter((n) => lang.lexicon[n]) : [];
        const combined = pool.length > 0 ? pool : legacy;
        if (a && combined.length > 0) b = combined[rng.int(combined.length)];
      }
      if (!a || !b || a === b) {
        const pick = pickMeanings(lang, rng, 2);
        a = pick[0];
        b = pick[1];
      }
      if (!a || !b || a === b) return null;
      const newMeaning: Meaning = `${a}-${b}`;
      if (lang.lexicon[newMeaning]) return null;
      const fa = lang.lexicon[a]!;
      const fb = lang.lexicon[b]!;
      if (fa.length + fb.length > 10) return null;
      let form = [...fa, ...fb];
      const minLen = 2 + complexityFor(newMeaning);
      if (form.length < minLen) {
        form = [...form, "ə"];
      }
      if (combinedFit(form, lang) < 0.25) return null;
      return { meaning: newMeaning, form };
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
      const pool = suffixPool(lang);
      const suffix = pool[rng.int(pool.length)]!;
      const newMeaning: Meaning = `${base}${suffix.semanticSuffix}`;
      if (lang.lexicon[newMeaning]) return null;
      const baseForm = lang.lexicon[base]!;
      if (baseForm.length + suffix.affix.length > 10) return null;
      const form = [...baseForm, ...suffix.affix];
      if (combinedFit(form, lang) < 0.25) return null;
      return { meaning: newMeaning, form };
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
