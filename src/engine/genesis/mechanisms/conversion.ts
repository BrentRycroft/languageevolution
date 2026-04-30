import type { CoinageMechanism } from "./types";
import { clusterOf } from "../../semantics/clusters";

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
