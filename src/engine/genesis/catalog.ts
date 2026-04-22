import type { GenesisRule } from "./types";
import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";
import { isVowel, isConsonant } from "../phonology/ipa";
import { neighborsOf } from "../semantics/neighbors";
import { relatedMeanings } from "../semantics/clusters";
import { phonotacticFit } from "./phonotactics";
import { complexityFor } from "../lexicon/complexity";

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
      // 70% of the time, prefer a semantically related pair so coinages are
      // coherent (dark+night rather than stone+foot). Fall back to random.
      let a: Meaning | undefined;
      let b: Meaning | undefined;
      const meanings = Object.keys(lang.lexicon);
      if (meanings.length === 0) return null;
      if (rng.chance(0.7)) {
        a = meanings[rng.int(meanings.length)];
        // Prefer a cluster-mate (body+body, environment+environment, etc.)
        // Fall back to the static neighbor table, then random.
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
      // Complexity-length bias: coinages for more abstract meanings stay
      // longer. If the combined form is shorter than 2 + complexity, append
      // a simple schwa to pad it.
      const minLen = 2 + complexityFor(newMeaning);
      if (form.length < minLen) {
        form = [...form, "ə"];
      }
      // Reject on obviously-bad phonotactics (score < 0.25).
      if (phonotacticFit(form, lang) < 0.25) return null;
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
      const suffix = SUFFIXES[rng.int(SUFFIXES.length)]!;
      const newMeaning: Meaning = `${base}${suffix.semanticSuffix}`;
      if (lang.lexicon[newMeaning]) return null;
      const baseForm = lang.lexicon[base]!;
      if (baseForm.length + suffix.affix.length > 10) return null;
      const form = [...baseForm, ...suffix.affix];
      if (phonotacticFit(form, lang) < 0.25) return null;
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
