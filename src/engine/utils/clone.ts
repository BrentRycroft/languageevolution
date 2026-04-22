import type { GrammarFeatures, Lexicon } from "../types";
import type { Morphology } from "../morphology/types";

export function cloneLexicon(lex: Lexicon): Lexicon {
  const out: Lexicon = {};
  for (const m of Object.keys(lex)) out[m] = lex[m]!.slice();
  return out;
}

export function cloneGrammar(g: GrammarFeatures): GrammarFeatures {
  return { ...g };
}

export function cloneMorphology(morph: Morphology | undefined): Morphology {
  if (!morph) return { paradigms: {} };
  const paradigms: Morphology["paradigms"] = {};
  for (const k of Object.keys(morph.paradigms) as Array<
    keyof Morphology["paradigms"]
  >) {
    const p = morph.paradigms[k];
    if (!p) continue;
    paradigms[k] = {
      affix: p.affix.slice(),
      position: p.position,
      category: p.category,
    };
  }
  return { paradigms };
}
