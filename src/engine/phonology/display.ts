import type { Language, WordForm } from "../types";
import { romanize } from "./orthography";
import { narrowTranscribe } from "./narrow";

export type DisplayScript = "ipa" | "roman" | "both";

export function formatForm(
  form: WordForm,
  lang: Language,
  script: DisplayScript,
  meaning?: string,
): string {
  const ipa = narrowTranscribe(form, lang, meaning);
  if (script === "ipa") return `[${ipa}]`;
  const roman = romanize(form, lang);
  if (script === "roman") return roman;
  return `[${ipa}] · ${roman}`;
}
