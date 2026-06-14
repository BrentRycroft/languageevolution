import type { createSimulation } from "../simulation";
import { formToString } from "../phonology/ipa";
import { fnv1a } from "../rng";
import { lexIds, lexFormById } from "../lexicon/access";
import { meaningForLexemeId } from "../lexicon/lexemeIdentity";

/**
 * Deterministic hash of every tree node's lexicon (gloss → form, gloss-sorted)
 * + word formKeys. Shared by the reproducibility gate and (until retired) the
 * meaning-layer baseline. Locks GLOSS → form via the id-native seam.
 */
export function signature(sim: ReturnType<typeof createSimulation>): string {
  const tree = sim.getState().tree;
  const parts: string[] = [];
  for (const id of Object.keys(tree).sort()) {
    const lang = tree[id]!.language;
    const lex = lexIds(lang)
      .map((idk) => ({ g: meaningForLexemeId(lang, idk)!, f: formToString(lexFormById(lang, idk)!) }))
      .sort((a, b) => (a.g < b.g ? -1 : a.g > b.g ? 1 : 0))
      .map((e) => `${e.g}=${e.f}`)
      .join("|");
    const words = (lang.words ?? []).map((w) => w.formKey).sort().join("|");
    parts.push(`${id}#${lex}#${words}`);
  }
  return fnv1a(parts.join("\n")).toString(16).padStart(8, "0");
}
