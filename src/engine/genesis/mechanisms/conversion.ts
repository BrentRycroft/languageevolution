import type { CoinageMechanism } from "./types";
import { clusterOf } from "../../semantics/clusters";
import { lexGet, lexKeys } from "../../lexicon/access";

/**
 * conversion.ts
 *
 * Word-coinage mechanisms (compound, derivation, conversion, clipping, ideophone, calque, blending, reduplication). Key exports: MECHANISM_CONVERSION.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const MECHANISM_CONVERSION: CoinageMechanism = {
  id: "mechanism.conversion",
  label: "zero-derivation",
  originTag: "conversion",
  baseWeight: 0.5,
  tryCoin: (lang, target, _tree, rng) => {
    const targetCluster = clusterOf(target);
    if (!targetCluster) return null;
    const candidates = lexKeys(lang).filter(
      (m) => m !== target && clusterOf(m) === targetCluster,
    );
    if (candidates.length === 0) return null;
    const base = candidates[rng.int(candidates.length)]!;
    const form = lexGet(lang, base)!.slice();
    return { form };
  },
};
