import type { Morphology, Paradigm } from "./types";

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
