import type { Language, WordForm } from "../types";
import { formToString } from "./ipa";
import { romanize } from "./orthography";

export type DisplayScript = "ipa" | "roman" | "both";

/**
 * Format a word form according to the user's script preference.
 *   "ipa"   → phonemic IPA string (e.g. /ˈwɔtər/).
 *   "roman" → the language's drifted Latin-ish orthography.
 *   "both"  → "IPA · Aa" joined.
 * Shared across Lexicon, Timeline tooltips, Narrative, Translator,
 * Compare, and any view that shows word-level phonology.
 */
export function formatForm(
  form: WordForm,
  lang: Language,
  script: DisplayScript,
): string {
  const ipa = formToString(form);
  if (script === "ipa") return ipa;
  const roman = romanize(form, lang);
  if (script === "roman") return roman;
  return `${ipa} · ${roman}`;
}
