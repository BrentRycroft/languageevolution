import type { Language, LanguageTree, Meaning, WordForm } from "../../types";
import type { Rng } from "../../rng";

export interface CoinageMechanism {
  id: string;
  label: string;
  originTag: string;
  register?: "high" | "low";
  baseWeight: number;
  tryCoin: (
    lang: Language,
    target: Meaning,
    tree: LanguageTree,
    rng: Rng,
  ) => { form: WordForm } | null;
}
