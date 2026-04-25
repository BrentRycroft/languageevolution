import type { CoinageMechanism } from "./types";
import { relatedMeanings } from "../../semantics/clusters";
import { neighborsOf } from "../../semantics/neighbors";
import { complexityFor } from "../../lexicon/complexity";
import { phonotacticFit } from "../phonotactics";
import { otFit } from "../../phonology/ot";

/**
 * Compound: take two existing words from related semantic territory and
 * glue them together. If the length falls below the complexity floor,
 * pad with a schwa. Reject obviously-bad phonotactics.
 */
export const MECHANISM_COMPOUND: CoinageMechanism = {
  id: "mechanism.compound",
  label: "A + B → AB",
  originTag: "compound",
  baseWeight: 1.2,
  tryCoin: (lang, target, _tree, rng) => {
    const meanings = Object.keys(lang.lexicon);
    if (meanings.length < 2) return null;

    // Pick two parts that plausibly relate to the target: one from the
    // target's own cluster, the other from anywhere.
    const clusterPool = relatedMeanings(target).filter((m) => lang.lexicon[m]);
    const neighborPool = neighborsOf(target).filter((m) => lang.lexicon[m]);
    const pool = clusterPool.length > 0 ? clusterPool : neighborPool;
    const partA = pool.length > 0 ? pool[rng.int(pool.length)]! : meanings[rng.int(meanings.length)]!;
    // Second part: prefer a different cluster-mate; fall back to random.
    const otherPool = pool.filter((m) => m !== partA);
    const partB = otherPool.length > 0 ? otherPool[rng.int(otherPool.length)]! : meanings[rng.int(meanings.length)]!;
    if (partA === partB) return null;

    const fa = lang.lexicon[partA]!;
    const fb = lang.lexicon[partB]!;
    if (fa.length + fb.length > 10) return null;
    let form = [...fa, ...fb];
    const minLen = 2 + complexityFor(target);
    if (form.length < minLen) form = [...form, "ə"];
    const fit = 0.5 * phonotacticFit(form, lang) + 0.5 * otFit(form, lang);
    if (fit < 0.25) return null;
    return { form };
  },
};
