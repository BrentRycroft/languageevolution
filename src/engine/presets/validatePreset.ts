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
  code:
    | "unknown_phoneme"
    | "empty_form"
    | "stale_freq"
    | "stale_suppletion"
    // Phase 48 T10: hardened checks
    | "raw_r_in_rhotic_approximant"
    | "missing_tone"
    | "reconstruction_phoneme_outside_mode";
  meaning?: string;
  detail: string;
}

export function validatePresetIpa(config: SimulationConfig): PresetValidationIssue[] {
  const issues: PresetValidationIssue[] = [];
  const lex = config.seedLexicon ?? {};

  // Phase 48 T10: per-preset profile flags. `rhoticApproximant` flags
  // languages that should use ɹ (English) not the alveolar trill r.
  // `tonal` flags languages where every vowel nucleus must carry a
  // tone mark. `reconstructionMode` allows laryngeals/triple-diacritic
  // phonemes (PIE-style) without flagging them.
  const cfgWithFlags = config as SimulationConfig & {
    rhoticApproximant?: boolean;
    reconstructionMode?: boolean;
  };
  const tonal = config.seedToneRegime === "tonal";
  const rhoticApprox = cfgWithFlags.rhoticApproximant === true;
  const reconstructionMode = cfgWithFlags.reconstructionMode === true;

  for (const [meaning, form] of Object.entries(lex)) {
    if (!form || form.length === 0) {
      issues.push({
        code: "empty_form",
        meaning,
        detail: `seedLexicon["${meaning}"] is empty`,
      });
      continue;
    }
    let hasToneMark = false;
    for (const phoneme of form as WordForm) {
      if (!isKnownPhoneme(phoneme)) {
        issues.push({
          code: "unknown_phoneme",
          meaning,
          detail: `seedLexicon["${meaning}"] contains unknown phoneme "${phoneme}" (codepoints: ${codepoints(phoneme)})`,
        });
      }
      // Phase 48 T10 (b): English-style preset using raw `r` should
      // use ɹ (alveolar approximant). Flag only when the preset has
      // declared `rhoticApproximant: true`.
      if (rhoticApprox && phoneme === "r") {
        issues.push({
          code: "raw_r_in_rhotic_approximant",
          meaning,
          detail: `seedLexicon["${meaning}"] uses raw "r" (alveolar trill); rhotic-approximant preset should use "ɹ"`,
        });
      }
      // Phase 48 T10 (d): laryngeals + triple-diacritic phonemes
      // outside an explicit reconstructionMode flag.
      if (!reconstructionMode && isReconstructionPhoneme(phoneme)) {
        issues.push({
          code: "reconstruction_phoneme_outside_mode",
          meaning,
          detail: `seedLexicon["${meaning}"] contains reconstruction-only phoneme "${phoneme}"; set reconstructionMode: true to allow`,
        });
      }
      if (TONE_MARKS_REGEX.test(phoneme)) hasToneMark = true;
    }
    // Phase 48 T10 (c): tonal-preset entries lacking any tone mark.
    if (tonal && !hasToneMark) {
      issues.push({
        code: "missing_tone",
        meaning,
        detail: `seedLexicon["${meaning}"] has no tone mark; tonal presets should mark every vowel nucleus`,
      });
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

/**
 * Phase 48 T10: tone-mark detection. The simulator stores tones as
 * combining marks attached to vowels (˩ ˧ ˥) or as integrated
 * diacritics (á è ē). Match either style.
 */
const TONE_MARKS_REGEX = /[˥˦˧˨˩̀-̏]/;

/**
 * Phase 48 T10: reconstruction-only phonemes. Laryngeals (h₁/h₂/h₃)
 * and triple-stacked diacritic phonemes (gʲʰ, kʲʰ) are PIE-tradition
 * notation, not standard IPA-2020. Allowed only under
 * `reconstructionMode: true`.
 */
function isReconstructionPhoneme(p: string): boolean {
  if (p === "h₁" || p === "h₂" || p === "h₃") return true;
  // Triple-diacritic stacks: contains both palatalised (ʲ) and
  // aspirated (ʰ) modifiers.
  if (p.includes("ʲ") && p.includes("ʰ")) return true;
  return false;
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
