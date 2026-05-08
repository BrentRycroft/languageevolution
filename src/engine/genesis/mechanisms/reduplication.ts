import type { CoinageMechanism } from "./types";
import type { WordForm } from "../../types";
import { isVowel, isConsonant } from "../../phonology/ipa";

/**
 * reduplication.ts
 *
 * Word-coinage mechanisms (compound, derivation, conversion, clipping, ideophone, calque, blending, reduplication). Key exports: MECHANISM_REDUPLICATION.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const MECHANISM_REDUPLICATION: CoinageMechanism = {
  id: "mechanism.reduplication",
  label: "A → AA",
  originTag: "reduplication",
  register: "low",
  baseWeight: 0.8,
  tryCoin: (lang, target, _tree, rng) => {
    const meanings = Object.keys(lang.lexicon);
    if (meanings.length === 0) return null;
    const shortMeanings = meanings.filter(
      (m) => (lang.lexicon[m]?.length ?? 0) <= 4,
    );
    const pool = shortMeanings.length > 0 ? shortMeanings : meanings;
    const base = pool[rng.int(pool.length)]!;
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
    void target;
    return { form: [...redup, ...form] };
  },
};
