import type { SimulationConfig, WordForm } from "../types";
import { featuresOf } from "../phonology/features";

/**
 * Validate a preset's seed lexicon for IPA conformance and structural
 * sanity. Returns a list of human-readable issues; empty means clean.
 *
 * Checks:
 *  - Every phoneme in every WordForm has an entry in PHONE_FEATURES.
 *  - No empty WordForms (a meaning with [] is malformed).
 *  - Frequency hints reference meanings that exist in the lexicon.
 *  - seedSuppletion entries reference meanings that exist in the lexicon.
 *
 * Used by `preset_ipa.test.ts` so future preset edits can't silently
 * introduce non-IPA characters or stale references.
 */
export interface PresetValidationIssue {
  code: "unknown_phoneme" | "empty_form" | "stale_freq" | "stale_suppletion";
  meaning?: string;
  detail: string;
}

export function validatePresetIpa(config: SimulationConfig): PresetValidationIssue[] {
  const issues: PresetValidationIssue[] = [];
  const lex = config.seedLexicon ?? {};

  for (const [meaning, form] of Object.entries(lex)) {
    if (!form || form.length === 0) {
      issues.push({
        code: "empty_form",
        meaning,
        detail: `seedLexicon["${meaning}"] is empty`,
      });
      continue;
    }
    for (const phoneme of form as WordForm) {
      if (!isKnownPhoneme(phoneme)) {
        issues.push({
          code: "unknown_phoneme",
          meaning,
          detail: `seedLexicon["${meaning}"] contains unknown phoneme "${phoneme}" (codepoints: ${codepoints(phoneme)})`,
        });
      }
    }
  }

  // Frequency hints reference meanings.
  if (config.seedFrequencyHints) {
    for (const m of Object.keys(config.seedFrequencyHints)) {
      if (!lex[m]) {
        issues.push({
          code: "stale_freq",
          meaning: m,
          detail: `seedFrequencyHints["${m}"] has no matching seedLexicon entry`,
        });
      }
    }
  }

  // Suppletion references meanings.
  const suppletion = (config as { seedSuppletion?: Record<string, unknown> }).seedSuppletion;
  if (suppletion) {
    for (const m of Object.keys(suppletion)) {
      if (!lex[m]) {
        issues.push({
          code: "stale_suppletion",
          meaning: m,
          detail: `seedSuppletion["${m}"] has no matching seedLexicon entry`,
        });
      }
    }
  }

  return issues;
}

function isKnownPhoneme(p: string): boolean {
  // featuresOf strips tone marks internally; if it returns undefined, the
  // base phoneme is unknown.
  return featuresOf(p) !== undefined;
}

function codepoints(s: string): string {
  return Array.from(s)
    .map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}

/** Stringify a list of issues into a single human-readable summary. */
export function summarizePresetIssues(issues: PresetValidationIssue[]): string {
  if (issues.length === 0) return "(clean)";
  return issues.map((i) => `[${i.code}] ${i.detail}`).join("\n");
}
