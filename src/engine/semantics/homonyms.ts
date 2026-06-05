/**
 * homonyms.ts — distinguish HOMONYMS from POLYSEMY.
 *
 * Two meanings that share a surface form are HOMONYMS when their meaning points are far apart
 * (low cosine) — distinct words that merely sound alike (knight/night), typically from sound
 * change collapsing two unrelated forms. When the shared-form meanings are CLOSE in the space
 * they are polysemy instead (related senses of one word). Read-only analysis over the static
 * meaning points (lexPoint); never runs in the simulation step.
 */
import type { Language, Meaning } from "../types";
import { lexKeys, lexGet } from "../lexicon/access";
import { formToString } from "../phonology/ipa";
import { lexPoint } from "./meaningPoint";
import { cosineFixed } from "./vec";

/** Below this cosine, two same-form meanings are treated as distinct words (homonyms),
 * not related senses (polysemy). Tunable (Track A spec open question H). */
export const HOMONYMY_COSINE = 0.3;

/**
 * The other meanings sharing `meaning`'s surface form whose points are distant enough to be
 * true homonyms (not polysemy). Sorted; empty if the form is unique or every sharer is near.
 */
export function homonymsOf(lang: Language, meaning: Meaning): Meaning[] {
  const form = lexGet(lang, meaning);
  if (!form || form.length === 0) return [];
  const key = formToString(form);
  const here = lexPoint(meaning);
  const out: Meaning[] = [];
  for (const other of lexKeys(lang)) {
    if (other === meaning) continue;
    const otherForm = lexGet(lang, other);
    if (!otherForm || otherForm.length === 0) continue;
    if (formToString(otherForm) !== key) continue;
    if (cosineFixed(here, lexPoint(other)) < HOMONYMY_COSINE) out.push(other);
  }
  return out.sort();
}
