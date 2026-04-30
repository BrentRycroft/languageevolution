import type { CoinageMechanism } from "./types";
import type { Meaning, WordForm } from "../../types";

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
