import type { CoinageMechanism } from "./index";

/**
 * Clipping: take a long existing word and shorten it (typically to its
 * first stressed syllable or first CVC). The clipped form is glossed
 * with the same meaning as the base, but the new-meaning slot is the
 * target we're trying to fill — so clipping effectively creates a
 * nickname for a related concept.
 *
 * Register: "low" — clipped forms are colloquial.
 */
export const MECHANISM_CLIPPING: CoinageMechanism = {
  id: "mechanism.clipping",
  label: "long → short",
  originTag: "clipping",
  register: "low",
  baseWeight: 0.7,
  tryCoin: (lang, target, _tree, rng) => {
    // Need a word with length ≥ 5 to meaningfully clip.
    const candidates = Object.entries(lang.lexicon)
      .filter(([m, f]) => m !== target && f.length >= 5)
      .map(([m]) => m);
    if (candidates.length === 0) return null;
    const base = candidates[rng.int(candidates.length)]!;
    const form = lang.lexicon[base]!;
    // Keep first 3-4 phonemes ending on a consonant if possible.
    let clipLen = 4;
    if (clipLen > form.length) clipLen = form.length - 1;
    if (clipLen < 2) return null;
    const clipped = form.slice(0, clipLen);
    return { form: clipped };
  },
};
