import type { CoinageMechanism } from "./types";
import type { WordForm } from "../../types";
import { isVowel, isConsonant } from "../../phonology/ipa";
import { lexGet, lexHas } from "../../lexicon/access";
import { relatedMeanings } from "../../semantics/clusters";
import { neighborsOf } from "../../semantics/neighbors";

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
    // Phase 2b (evolution-realism): reduplication intensifies/iterates a
    // RELATED root, not a random word (the mechanism previously did
    // `void target` and reduplicated an arbitrary lexeme). AA conventionally
    // means an intensified/iterated/plural A, so the base must be
    // semantically linked to the target (target ≈ intensified base). Pick a
    // SHORT related lexeme; if none, refuse rather than file an orphan
    // etymology under the target.
    const pool = [...relatedMeanings(target), ...neighborsOf(target)].filter(
      (m) => m !== target && lexHas(lang, m) && (lexGet(lang, m)?.length ?? 99) <= 4,
    );
    if (pool.length === 0) return null;
    const base = pool[rng.int(pool.length)]!;
    const form = lexGet(lang, base)!;
    if (form.length === 0 || form.length > 4) return null;
    const first = form[0]!;
    const second = form[1];
    const redup: WordForm =
      second && isVowel(second)
        ? [first, second]
        : isConsonant(first)
          ? [first, "a"]
          : [first];
    return { form: [...redup, ...form] };
  },
};
