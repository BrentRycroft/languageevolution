import type { CoinageMechanism } from "./types";
import { relatedMeanings } from "../../semantics/clusters";

export const MECHANISM_BLENDING: CoinageMechanism = {
  id: "mechanism.blending",
  label: "A + B → blend",
  originTag: "blend",
  register: "low",
  baseWeight: 0.5,
  tryCoin: (lang, target, _tree, rng) => {
    const meanings = Object.keys(lang.lexicon);
    if (meanings.length < 2) return null;
    const related = relatedMeanings(target).filter((m) => lang.lexicon[m]);
    if (related.length < 2) return null;
    const a = related[rng.int(related.length)]!;
    const remaining = related.filter((m) => m !== a);
    if (remaining.length === 0) return null;
    const b = remaining[rng.int(remaining.length)]!;
    const fa = lang.lexicon[a]!;
    const fb = lang.lexicon[b]!;
    let overlap = 0;
    const maxOverlap = Math.min(fa.length, fb.length);
    for (let k = maxOverlap; k >= 1; k--) {
      const tailA = fa.slice(fa.length - k);
      const headB = fb.slice(0, k);
      if (tailA.join("") === headB.join("")) {
        overlap = k;
        break;
      }
    }
    if (overlap === 0) {
      const lastA = fa[fa.length - 1];
      const firstB = fb[0];
      if (!lastA || !firstB || lastA !== firstB) return null;
      overlap = 1;
    }
    const form = [...fa.slice(0, fa.length - overlap), ...fb];
    if (form.length > 10 || form.length < 2) return null;
    return { form };
  },
};
