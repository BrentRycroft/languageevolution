import type { Morphology, Paradigm } from "./types";

/**
 * defaults.ts
 *
 * Morphological paradigms, suppletion, gender, analogical levelling, ablaut, runtime productive derivation. Key exports: DEFAULT_MORPHOLOGY.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function p(
  category: Paradigm["category"],
  affix: string[],
  position: Paradigm["position"] = "suffix",
): Paradigm {
  return { affix, position, category };
}

export const DEFAULT_MORPHOLOGY: Morphology = {
  paradigms: {
    "noun.case.nom": p("noun.case.nom", []),
    "noun.case.acc": p("noun.case.acc", ["m"]),
    "noun.case.gen": p("noun.case.gen", ["s"]),
    "noun.num.pl": p("noun.num.pl", ["e", "s"]),
    "verb.tense.past": p("verb.tense.past", ["e", "d"]),
    "verb.person.3sg": p("verb.person.3sg", ["s"]),
  },
};
