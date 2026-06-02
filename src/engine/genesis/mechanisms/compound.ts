import type { CoinageMechanism } from "./types";
import { relatedMeanings } from "../../semantics/clusters";
import { neighborsOf } from "../../semantics/neighbors";
import { complexityFor } from "../../lexicon/complexity";
import { phonotacticFit } from "../phonotactics";
import { otFit } from "../../phonology/ot";
import { lexGet, lexHas, lexKeys } from "../../lexicon/access";
import { attemptConceptDecomposition } from "../../lexicon/synthesis";
import { CONCEPTS } from "../../lexicon/concepts";

/**
 * compound.ts
 *
 * Word-coinage mechanisms (compound, derivation, conversion, clipping, ideophone, calque, blending, reduplication). Key exports: MECHANISM_COMPOUND.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const MECHANISM_COMPOUND: CoinageMechanism = {
  id: "mechanism.compound",
  label: "A + B → AB",
  originTag: "compound",
  baseWeight: 1.2,
  tryCoin: (lang, target, _tree, rng) => {
    const meanings = lexKeys(lang);
    if (meanings.length < 2) return null;

    // Phase 2a (evolution-realism): prefer the concept's curated cross-
    // linguistic decomposition — an authentic MODIFIER+HEAD kenning that is
    // head-final and endocentric by construction (breeze = small+wind, hail
    // = hard+rain, council = many+person, citizen = person+city) — over a
    // random pair of cluster-siblings. The sibling pool produced the "weird
    // mashup" coinages the audit flagged (breeze = ridge+frost, council =
    // relief+marriage) by ignoring the very decomposition that gives a
    // coherent head. attemptConceptDecomposition already requires every part
    // to be in the lexicon and refuses primitives.
    const decomp = attemptConceptDecomposition(lang, target);
    if (decomp && decomp.parts.length >= 2 && decomp.form.length <= 10) {
      let form = decomp.form.slice();
      const minLen = 2 + complexityFor(target);
      if (form.length < minLen) form = [...form, "ə"];
      const fit = 0.5 * phonotacticFit(form, lang) + 0.5 * otFit(form, lang);
      if (fit >= 0.25) {
        return {
          form,
          sources: { partMeanings: decomp.parts.map((p) => p.meaning) },
        };
      }
    }

    // Phase 2a: if the target HAS a curated decomposition but it isn't
    // satisfiable yet (a part isn't lexicalised, or the fit failed), REFUSE
    // to mint a random-sibling mashup for it. Wait until the authentic parts
    // exist (or let another mechanism handle it) rather than coining
    // breeze=ridge+frost when the language's own answer is small+wind. Only
    // decomposition-LESS targets fall through to the related-sibling pool.
    if (CONCEPTS[target]?.decomposition && CONCEPTS[target]!.decomposition!.length > 0) {
      return null;
    }

    const clusterPool = relatedMeanings(target).filter((m) => lexHas(lang, m));
    const neighborPool = neighborsOf(target).filter((m) => lexHas(lang, m));
    const pool = clusterPool.length > 0 ? clusterPool : neighborPool;
    // A compound must be built from two SEMANTICALLY-RELATED existing lexemes
    // (kenning/calque: "firewater" = fire + water), never a random mash of two
    // unrelated words. If the language has no ≥2 coherent related parts for this
    // target, don't coin — the caller's cascade moves on, and the translator
    // leaves the term untranslated rather than minting garbage. (Previously, an
    // empty pool fell back to two RANDOM lexicon meanings — the "very weird"
    // coinages the user reported.)
    if (pool.length < 2) return null;
    const partA = pool[rng.int(pool.length)]!;
    const otherPool = pool.filter((m) => m !== partA);
    if (otherPool.length === 0) return null;
    const partB = otherPool[rng.int(otherPool.length)]!;

    const fa = lexGet(lang, partA)!;
    const fb = lexGet(lang, partB)!;
    if (fa.length + fb.length > 10) return null;
    let form = [...fa, ...fb];
    const minLen = 2 + complexityFor(target);
    if (form.length < minLen) form = [...form, "ə"];
    const fit = 0.5 * phonotacticFit(form, lang) + 0.5 * otFit(form, lang);
    if (fit < 0.25) return null;
    return { form, sources: { partMeanings: [partA, partB] } };
  },
};
