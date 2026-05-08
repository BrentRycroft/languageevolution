import type { CoinageMechanism } from "./types";

/**
 * clipping.ts
 *
 * Word-coinage mechanisms (compound, derivation, conversion, clipping, ideophone, calque, blending, reduplication). Key exports: MECHANISM_CLIPPING.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const MECHANISM_CLIPPING: CoinageMechanism = {
  id: "mechanism.clipping",
  label: "long → short",
  originTag: "clipping",
  register: "low",
  baseWeight: 0.7,
  tryCoin: (lang, target, _tree, rng) => {
    const candidates = Object.entries(lang.lexicon)
      .filter(([m, f]) => m !== target && f.length >= 5)
      .map(([m]) => m);
    if (candidates.length === 0) return null;
    const base = candidates[rng.int(candidates.length)]!;
    const form = lang.lexicon[base]!;
    let clipLen = 4;
    if (clipLen > form.length) clipLen = form.length - 1;
    if (clipLen < 2) return null;
    const clipped = form.slice(0, clipLen);
    return { form: clipped };
  },
};
