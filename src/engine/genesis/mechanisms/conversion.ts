import type { CoinageMechanism } from "./index";
import { clusterOf } from "../../semantics/clusters";

/**
 * Conversion / zero-derivation: take an existing word from a related
 * meaning without any form change. This is how English gets "a run"
 * from "to run" — same form, new category/meaning.
 *
 * We only fire when the target and source share a cluster.
 */
export const MECHANISM_CONVERSION: CoinageMechanism = {
  id: "mechanism.conversion",
  label: "zero-derivation",
  originTag: "conversion",
  baseWeight: 0.5,
  tryCoin: (lang, target, _tree, rng) => {
    const targetCluster = clusterOf(target);
    if (!targetCluster) return null;
    const candidates = Object.keys(lang.lexicon).filter(
      (m) => m !== target && clusterOf(m) === targetCluster,
    );
    if (candidates.length === 0) return null;
    const base = candidates[rng.int(candidates.length)]!;
    const form = lang.lexicon[base]!.slice();
    return { form };
  },
};
