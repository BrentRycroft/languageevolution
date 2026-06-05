import type { CoinageMechanism } from "./types";
import { composeForGap } from "../../semantics/gapComposition";

/**
 * vectorComposition.ts — Track B: gap-driven compositional coinage.
 *
 * Builds a word for the target concept from the two morphemes whose meaning points are most
 * RELATED to it (composeForGap — the kenning model: whale → fish+bird, the long-tail generalisation
 * of the curated-decomposition compound path). Deterministic (composeForGap uses no RNG); the
 * genesis loop smooths the assembled form and records the `partMeanings` etymology, so the coinage
 * surfaces in the Dictionary's composition row like any compound.
 */
export const MECHANISM_VECTOR_COMPOSITION: CoinageMechanism = {
  id: "mechanism.vectorComposition",
  label: "⟨A·B⟩ → AB (nearest-meaning compound)",
  originTag: "compound",
  baseWeight: 1.3,
  tryCoin: (lang, target) => {
    const g = composeForGap(lang, target);
    if (!g) return null;
    return { form: g.form, sources: { partMeanings: g.parts } };
  },
};
