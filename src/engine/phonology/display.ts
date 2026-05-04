import type { Language, WordForm } from "../types";
import { romanize } from "./orthography";
import { narrowTranscribe } from "./narrow";
import { capToneStacking } from "./tone";

export type DisplayScript = "ipa" | "roman" | "both";

/**
 * Phase 30 Tranche 30g: defensive display-layer cap on tone marks.
 * The runtime sandhi / tonogenesis sites already cap, but a stale
 * v6 save loaded into a fresh app could carry unbounded contour
 * stacks. Cap once here so the rendered surface stays readable
 * regardless of upstream storage.
 */
function capTonesInForm(form: WordForm): WordForm {
  let changed = false;
  const out = form.map((p) => {
    const capped = capToneStacking(p);
    if (capped !== p) changed = true;
    return capped;
  });
  return changed ? out : form;
}

export function formatForm(
  form: WordForm,
  lang: Language,
  script: DisplayScript,
  meaning?: string,
): string {
  const display = capTonesInForm(form);
  const ipa = narrowTranscribe(display, lang, meaning);
  if (script === "ipa") return `[${ipa}]`;
  const roman = romanize(display, lang, meaning);
  if (script === "roman") return roman;
  return `[${ipa}] · ${roman}`;
}
