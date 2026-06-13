import type { CoinageMechanism } from "./types";
import { clusterOf } from "../../semantics/clusters";
import { lexIds, lexFormById } from "../../lexicon/access";
import { meaningForLexemeId } from "../../lexicon/lexemeIdentity";

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
    const allIds = lexIds(lang);
    const candidateIds = allIds.filter((id) => {
      const m = meaningForLexemeId(lang, id);
      return m !== undefined && m !== target && clusterOf(m) === targetCluster;
    });
    if (candidateIds.length === 0) return null;
    const baseId = candidateIds[rng.int(candidateIds.length)]!;
    const form = lexFormById(lang, baseId)!.slice();
    return { form };
  },
};
