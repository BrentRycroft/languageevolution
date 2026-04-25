import type { CoinageMechanism } from "./types";
import type { Meaning, WordForm } from "../../types";

/**
 * Calque: when a sister language has a compound meaning we lack
 * (e.g. "sky-piercer"), coin the same compound structure using OUR
 * words for the parts. Fits the "high" register because calques
 * tend to enter via educated / scholarly contact.
 */
export const MECHANISM_CALQUE: CoinageMechanism = {
  id: "mechanism.calque",
  label: "calque from sister",
  originTag: "calque",
  register: "high",
  baseWeight: 0.6,
  tryCoin: (lang, target, tree, _rng) => {
    // Only calque compound-meaning targets like "sky-piercer".
    if (!target.includes("-")) return null;
    const parts = target.split("-") as Meaning[];
    if (parts.length !== 2) return null;
    // Both parts must exist in our lexicon so we can assemble the calque.
    const a = lang.lexicon[parts[0]!];
    const b = lang.lexicon[parts[1]!];
    if (!a || !b) return null;
    // Require at least one sister to have the target already — that's the
    // "pressure" that motivates the calque.
    let someoneHas = false;
    for (const id of Object.keys(tree)) {
      if (id === lang.id) continue;
      if (tree[id]!.language.extinct) continue;
      if (tree[id]!.language.lexicon[target]) {
        someoneHas = true;
        break;
      }
    }
    if (!someoneHas) return null;
    const form: WordForm = [...a, ...b];
    if (form.length > 10) return null;
    return { form };
  },
};
