import type { CoinageMechanism } from "./types";
import type { Meaning, WordForm } from "../../types";

/**
 * calque.ts
 *
 * Word-coinage mechanisms (compound, derivation, conversion, clipping, ideophone, calque, blending, reduplication). Key exports: MECHANISM_CALQUE.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const MECHANISM_CALQUE: CoinageMechanism = {
  id: "mechanism.calque",
  label: "calque from sister",
  originTag: "calque",
  register: "high",
  baseWeight: 0.6,
  tryCoin: (lang, target, tree, _rng) => {
    if (!target.includes("-")) return null;
    const parts = target.split("-") as Meaning[];
    if (parts.length !== 2) return null;
    const a = lang.lexicon[parts[0]!];
    const b = lang.lexicon[parts[1]!];
    if (!a || !b) return null;
    let donorId: string | null = null;
    for (const id of Object.keys(tree)) {
      if (id === lang.id) continue;
      if (tree[id]!.language.extinct) continue;
      if (tree[id]!.language.lexicon[target]) {
        donorId = id;
        break;
      }
    }
    if (!donorId) return null;
    const form: WordForm = [...a, ...b];
    if (form.length > 10) return null;
    return {
      form,
      sources: {
        partMeanings: [parts[0]!, parts[1]!],
        donorLangId: donorId,
        donorMeaning: target,
      },
    };
  },
};
