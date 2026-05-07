import type { CoinageMechanism } from "./types";
import type { Phoneme, WordForm } from "../../types";
import { isVowel, isConsonant } from "../../phonology/ipa";

/**
 * Phase 55 T1: Semitic-style root + template (transfixational)
 * coinage. Picks a consonantal root from `lang.rootInventory` and a
 * CV pattern from `lang.rootPatterns`, interleaves: every `C` in the
 * pattern is filled with the next consonant from the root, every `V`
 * is filled with a vowel sampled from the language's inventory.
 *
 * Strictly opt-in: the mechanism returns null unless `lang.rootInventory`
 * AND `lang.rootPatterns` are both populated. Non-templatic presets
 * (English, PIE, Romance, Germanic) keep their existing genesis
 * behaviour because they don't carry root inventories.
 *
 * Linguistic basis: Aronoff 1976; templatic morphology in Semitic
 * (Arabic root k-t-b "write" + pattern CaCiC → kaːtib "writer";
 * pattern CaCCaC → kattab "intensify writing").
 */
export const MECHANISM_TEMPLATE: CoinageMechanism = {
  id: "mechanism.template",
  label: "C-C-C + CaCiC → CaCiC",
  originTag: "template",
  baseWeight: 1.0,
  tryCoin: (lang, _target, _tree, rng) => {
    if (!lang.rootInventory || !lang.rootPatterns) return null;
    const rootMeanings = Object.keys(lang.rootInventory);
    if (rootMeanings.length === 0) return null;
    if (lang.rootPatterns.length === 0) return null;

    const rootMeaning = rootMeanings[rng.int(rootMeanings.length)]!;
    const root = lang.rootInventory[rootMeaning]!;
    if (!root || root.length < 2) return null;
    const pattern = lang.rootPatterns[rng.int(lang.rootPatterns.length)]!;

    const inv = lang.phonemeInventory.segmental;
    const vowels: Phoneme[] = inv.filter(isVowel);
    if (vowels.length === 0) return null;

    const form: WordForm = [];
    let rootIdx = 0;
    for (const ch of pattern) {
      if (ch === "C") {
        if (rootIdx >= root.length) return null;
        const cons = root[rootIdx]!;
        if (!isConsonant(cons)) return null;
        form.push(cons);
        rootIdx++;
      } else if (ch === "V") {
        form.push(vowels[rng.int(vowels.length)]!);
      } else if (ch === "a" || ch === "i" || ch === "u" || ch === "e" || ch === "o") {
        // Literal vowels in the pattern stay literal (e.g. CaCiC has
        // hardcoded a / i positions).
        form.push(ch as Phoneme);
      } else {
        // Unrecognised pattern char: skip rather than crash.
        continue;
      }
    }
    if (form.length === 0) return null;
    return {
      form,
      sources: { partMeanings: [rootMeaning], via: pattern },
    };
  },
};
