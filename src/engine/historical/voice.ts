/**
 * historical/voice.ts — Phase 70 T4: narrative voice helper.
 *
 * Given a language and the simulation state, returns an optional
 * historical-context sentence describing the most recent milestone
 * that affected this lineage. UIs can prepend this to narrative
 * output, show it in tooltips, etc.
 *
 * Returns null when:
 *   - Historical Mode is off (no historicalRole on lang).
 *   - No milestone has fired for this lineage yet.
 *   - The most recent milestone is more than `windowGens` ago.
 *
 * The phrasing is intentionally history-flavored ("had begun to
 * show", "marked the divergence of") so it reads like a textbook
 * note rather than engine telemetry.
 */

import type { Language, SimulationState } from "../types";

export interface VoiceOptions {
  /** Look back at most this many generations for a recent milestone. */
  windowGens?: number;
}

/**
 * Phase 70 T4 sentinel string. UI consumers can prefix narrative
 * panes with this when present.
 */
export function narrativeHistoricalVoice(
  lang: Language,
  state: SimulationState,
  generation: number,
  opts: VoiceOptions = {},
): string | null {
  if (!lang.historicalRole) return null;
  const events = state.historicalEvents;
  if (!events || events.length === 0) return null;
  const window = opts.windowGens ?? 30;

  // Find the most recent fired milestone whose role matches this
  // language's role OR a parent role in the lineage chain. For T4
  // we just check direct role match — full lineage walk lives in T5+.
  const candidates = events.filter(
    (e) =>
      e.kind === "fired" &&
      e.generation <= generation &&
      generation - e.generation <= window &&
      (e.role === lang.historicalRole || e.role === "proto"),
  );
  if (candidates.length === 0) return null;
  const recent = candidates[candidates.length - 1]!;

  const yearsAgo = (generation - recent.generation) * 25;
  const ago =
    yearsAgo === 0
      ? "this generation"
      : `about ${yearsAgo} years ago`;

  // Phrasing varies slightly by role to keep tone fresh across the
  // tree. Falls back to a generic line for unfamiliar roles.
  const lineByRole: Partial<Record<string, string>> = {
    proto: `${lang.name} had recently entered ${recent.label.toLowerCase()} (${ago}), reshaping its sound system.`,
    western: `${lang.name} carries the marks of ${recent.label} (${ago}), separating it from the eastern dialects.`,
    eastern: `${lang.name} preserves features lost in the western branch — a legacy of ${recent.label} (${ago}).`,
    iberian: `${lang.name} retains the conservative profile of its Iberian ancestors after ${recent.label} (${ago}).`,
    gallo: `${lang.name} has been undergoing the dramatic reductions characteristic of its Gallo-Romance lineage (${recent.label}, ${ago}).`,
    italo: `${lang.name} shows the gemination retention typical of its Italo-Romance branch following ${recent.label} (${ago}).`,
    castilian: `${lang.name} bears the signature shifts of ${recent.label} (${ago}) — palatalisations and intervocalic lenition.`,
    lusitanian: `${lang.name} has begun the nasalisations and intervocalic deletions of ${recent.label} (${ago}).`,
    francien: `${lang.name} has entered the upheaval of ${recent.label} (${ago}), with sweeping vowel reduction.`,
    tuscan: `${lang.name} preserves the geminate consonants emphasised by ${recent.label} (${ago}).`,
  };

  return (
    lineByRole[lang.historicalRole] ??
    `${lang.name} was recently affected by ${recent.label} (${ago}).`
  );
}
