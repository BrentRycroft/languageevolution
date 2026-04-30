import type { Language, WordForm } from "../types";
import { romanize } from "./orthography";
import { narrowTranscribe } from "./narrow";

export type DisplayScript = "ipa" | "roman" | "both";

/**
 * Format a word form according to the user's script preference.
 *   "ipa"   → narrow IPA in brackets (e.g. [ˈkɔr.pʊs]): syllable break,
 *             primary stress, laxed mid/high vowels. See
 *             `phonology/narrow.ts` for the rendering rules.
 *   "roman" → the language's drifted Latin-ish orthography.
 *   "both"  → "[narrow IPA] · Aa" joined.
 *
 * Engine storage stays broad — just `/k/ /o/ /r/ /p/ /u/ /s/` in the
 * phoneme array — so this helper enriches at display time without
 * touching the lexicon. Bracket convention: `[…]` is the linguistic
 * mark for narrow phonetic transcription (vs `/…/` for broad phonemic).
 */
export function formatForm(
  form: WordForm,
  lang: Language,
  script: DisplayScript,
  /** Optional meaning key — lets the IPA renderer pick a per-word
   *  lexical-stress override when `lang.stressPattern === "lexical"`. */
  meaning?: string,
): string {
  const ipa = narrowTranscribe(form, lang, meaning);
  if (script === "ipa") return `[${ipa}]`;
  const roman = romanize(form, lang);
  if (script === "roman") return roman;
  return `[${ipa}] · ${roman}`;
}
