import type { GenesisRule } from "./types";
import type { Language, Meaning, WordForm } from "../types";
import { isVowel, isConsonant } from "../phonology/ipa";
import { neighborsOf } from "../semantics/neighbors";
import { relatedMeanings } from "../semantics/clusters";
import { phonotacticFit } from "./phonotactics";
import { otFit } from "../phonology/ot";
import { complexityFor } from "../lexicon/complexity";
import { lexIds, lexFormById, idForGloss, lexHasById } from "../lexicon/access";
import { meaningForLexemeId } from "../lexicon/lexemeIdentity";

/**
 * catalog.ts
 *
 * Word-coinage mechanisms (compound, derivation, conversion, clipping, ideophone, calque, blending, reduplication). Key exports: GENESIS_CATALOG, GENESIS_BY_ID.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function combinedFit(form: WordForm, lang: Language): number {
  return 0.5 * phonotacticFit(form, lang) + 0.5 * otFit(form, lang);
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
      const ids = lexIds(lang);
      if (ids.length === 0) return null;
      // Phase 2c (evolution-realism): a spontaneous compound must glue two
      // SEMANTICALLY-RELATED lexemes. The old path had a fully-random
      // pickMeanings(rng, 2) fallback — a SECOND unfixed mashup generator,
      // gluing two unrelated words (the "very weird" coinages the audit and
      // the user flagged). Drop it: if the seed word has no related partner
      // in the lexicon, refuse to coin (the caller's cascade moves on).
      const aId = ids[rng.int(ids.length)];
      if (!aId) return null;
      const a: Meaning = meaningForLexemeId(lang, aId)!;
      const pool = relatedMeanings(a).filter((n) => lexHasById(lang, idForGloss(lang, n)));
      const legacy = neighborsOf(a).filter((n) => lexHasById(lang, idForGloss(lang, n)));
      const combined = pool.length > 0 ? pool : legacy;
      const candidates = combined.filter((n) => n !== a);
      if (candidates.length === 0) return null;
      const b: Meaning = candidates[rng.int(candidates.length)]!;
      const newMeaning: Meaning = `${a}-${b}`;
      if (lexHasById(lang, idForGloss(lang, newMeaning))) return null;
      const fa = lexFormById(lang, aId)!;
      const bId = idForGloss(lang, b);
      if (!bId) return null;
      const fb = lexFormById(lang, bId)!;
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
      const ids = lexIds(lang);
      if (ids.length === 0) return null;
      const baseId = ids[rng.int(ids.length)]!;
      const base: Meaning = meaningForLexemeId(lang, baseId)!;
      const pool = suffixPool(lang);
      const suffix = pool[rng.int(pool.length)]!;
      const newMeaning: Meaning = `${base}${suffix.semanticSuffix}`;
      if (lexHasById(lang, idForGloss(lang, newMeaning))) return null;
      const baseForm = lexFormById(lang, baseId)!;
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
      const ids = lexIds(lang);
      if (ids.length === 0) return null;
      const baseId = ids[rng.int(ids.length)]!;
      const base: Meaning = meaningForLexemeId(lang, baseId)!;
      const newMeaning: Meaning = `${base}-intens`;
      if (lexHasById(lang, idForGloss(lang, newMeaning))) return null;
      const form = lexFormById(lang, baseId)!;
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
