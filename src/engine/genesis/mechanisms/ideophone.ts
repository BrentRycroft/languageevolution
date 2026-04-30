import type { CoinageMechanism } from "./types";
import type { Phoneme, WordForm } from "../../types";
import { isVowel, isConsonant } from "../../phonology/ipa";

export const MECHANISM_IDEOPHONE: CoinageMechanism = {
  id: "mechanism.ideophone",
  label: "ideophone",
  originTag: "ideophone",
  register: "low",
  baseWeight: 0.3,
  tryCoin: (lang, _target, _tree, rng) => {
    const inv = lang.phonemeInventory.segmental;
    const consonants: Phoneme[] = inv.filter(isConsonant);
    const vowels: Phoneme[] = inv.filter(isVowel);
    if (consonants.length === 0 || vowels.length === 0) return null;
    const c1 = consonants[rng.int(consonants.length)]!;
    const v1 = vowels[rng.int(vowels.length)]!;
    const syllables = rng.chance(0.5) ? 2 : 3;
    const form: WordForm = [];
    for (let i = 0; i < syllables; i++) {
      const c = rng.chance(0.7) ? c1 : consonants[rng.int(consonants.length)]!;
      const v = rng.chance(0.7) ? v1 : vowels[rng.int(vowels.length)]!;
      form.push(c, v);
    }
    return { form };
  },
};
