import type { LexiconState } from "../domains";
import type { Language, WordForm } from "../types";
import type { Meaning } from "../types";
import { buildLexemeIdToGloss, type LexemeId } from "./lexemeIdentity";
import { satGet } from "./satellites";
import { glossOf } from "../semantics/anchors";
import { posOf, type POS } from "./pos";

export const KEYLESS_MATURITY_FREQ = 0.5;

export function evolvableLexemes(lang: LexiconState): LexemeId[] {
  const g = buildLexemeIdToGloss(lang);
  const seeded: LexemeId[] = [];
  const keyless: LexemeId[] = [];
  for (const id of Object.keys(lang.lexemes) as LexemeId[]) {
    if (g.has(id)) seeded.push(id);
    else keyless.push(id);
  }
  keyless.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [...seeded, ...keyless];
}

export function isKeyless(lang: LexiconState, id: LexemeId): boolean {
  return lang.lexemes[id]?.gloss === undefined;
}

export function effectiveGlossFor(lang: LexiconState, id: LexemeId): Meaning {
  const rec = lang.lexemes[id];
  if (rec?.gloss !== undefined) return rec.gloss;
  return glossOf(Int32Array.from(rec!.point));
}

export function effectiveFormOf(lang: LexiconState, id: LexemeId): WordForm | undefined {
  return lang.lexemes[id]?.form;
}

/**
 * Effective POS via the EMERGENT gloss: seeded → `posOf(storedGloss)` (byte-identical to before);
 * keyless → `posOf(glossOf(point))`, i.e. the POS of the nearest-anchor concept. This gives keyless
 * words a real 18-way POS (S2b: "give keyless words real POS"), derived from geometry without mutating
 * the stored point — so a keyless word coined near a verb concept participates in verb-gated processes.
 */
export function effectivePosOf(lang: LexiconState, id: LexemeId): POS {
  return posOf(effectiveGlossFor(lang, id));
}

export function keylessMature(lang: Language, id: LexemeId): boolean {
  return (satGet(lang, "wordFrequencyHints", id) ?? 0.4) >= KEYLESS_MATURITY_FREQ;
}
