import type { Language, WordForm } from "../types";
import { rhymesWith, rhymeSyllable } from "../phonology/rhyme";
import { lineMeterPattern, meterScore, METER_TARGETS, type MeterName } from "../phonology/meter";

/**
 * Phase 26d: poetic stanza generator scoring helpers.
 *
 * Composes a multi-line stanza by scoring candidate lines on meter
 * adherence + rhyme-scheme fit. Doesn't regenerate the underlying
 * sentences itself — those come from the standard composer; this
 * module receives candidate lines (each with a target-language form
 * sequence + English caption) and selects the best fit per slot.
 */

export type RhymeScheme = "AABB" | "ABAB" | "ABCB" | "free";

export interface CandidateLine {
  /** Per-token surface form sequence — used for meter computation. */
  forms: WordForm[];
  /** Pretty surface string (joined). */
  text: string;
  /** English gloss for the comparison panel. */
  english: string;
}

export interface PoetryOptions {
  meter: MeterName | "free";
  scheme: RhymeScheme;
  lineCount: number;
}

export interface ScoredLine extends CandidateLine {
  meterScore: number;
  rhymeWord: WordForm;
}

/**
 * Score a candidate line on its meter adherence (0..1) and extract its
 * final stress-bearing word (for rhyme matching). Empty / single-token
 * lines score 0.
 */
export function scoreCandidateLine(
  candidate: CandidateLine,
  lang: Language,
  meter: MeterName | "free",
): ScoredLine {
  const lastForm = candidate.forms[candidate.forms.length - 1] ?? [];
  const pattern = lineMeterPattern(candidate.forms, lang.stressPattern);
  const score =
    meter === "free" ? 1 : meterScore(pattern, METER_TARGETS[meter]);
  return {
    ...candidate,
    meterScore: score,
    rhymeWord: lastForm,
  };
}

/**
 * Pick `n` lines from a pool of candidates that best fit the target
 * meter and rhyme scheme. Greedy: fills each slot in order, picking the
 * highest-meter-scoring line whose final word rhymes with whichever
 * earlier slot dictates the rhyme group.
 *
 * Rhyme schemes (4-line stanzas):
 *   AABB → lines 1↔2 rhyme; lines 3↔4 rhyme.
 *   ABAB → lines 1↔3 rhyme; lines 2↔4 rhyme.
 *   ABCB → only lines 2↔4 rhyme.
 *   free → no rhyme constraint.
 *
 * Returns the chosen lines in order. If no candidate satisfies a rhyme
 * slot, falls back to the highest-meter-scoring available candidate
 * (graceful degradation rather than crashing).
 */
export function pickStanza(
  pool: CandidateLine[],
  lang: Language,
  options: PoetryOptions,
): ScoredLine[] {
  if (pool.length === 0) return [];
  const scored = pool.map((c) => scoreCandidateLine(c, lang, options.meter));
  scored.sort((a, b) => b.meterScore - a.meterScore);

  const selected: ScoredLine[] = [];
  const schemeMap = rhymeGroupsFor(options.scheme, options.lineCount);

  for (let lineIdx = 0; lineIdx < options.lineCount; lineIdx++) {
    const group = schemeMap[lineIdx]!;
    const constraint = constraintForGroup(group, lineIdx, selected, schemeMap);
    let pick = scored.find((c) => !selected.includes(c) && satisfies(c, constraint, lang));
    if (!pick) {
      // Graceful fallback: take the next-best by meter score, ignoring
      // rhyme.
      pick = scored.find((c) => !selected.includes(c));
    }
    if (!pick) break;
    selected.push(pick);
  }
  return selected;
}

function rhymeGroupsFor(scheme: RhymeScheme, lineCount: number): string[] {
  // Returns one letter per line, repeated as needed for stanza length.
  // 4-line patterns; extend to lineCount by cycling.
  const base =
    scheme === "AABB" ? ["A", "A", "B", "B"] :
    scheme === "ABAB" ? ["A", "B", "A", "B"] :
    scheme === "ABCB" ? ["A", "B", "C", "B"] :
    ["A", "B", "C", "D"];
  const out: string[] = [];
  for (let i = 0; i < lineCount; i++) out.push(base[i % base.length]!);
  return out;
}

function constraintForGroup(
  group: string,
  lineIdx: number,
  selected: ScoredLine[],
  schemeMap: string[],
): WordForm | null {
  // Find an earlier line in the same group whose rhyme we should match.
  for (let i = 0; i < lineIdx; i++) {
    if (schemeMap[i] === group && selected[i]) {
      return selected[i]!.rhymeWord;
    }
  }
  return null;
}

function satisfies(
  candidate: ScoredLine,
  constraint: WordForm | null,
  lang: Language,
): boolean {
  if (!constraint) return true;
  return rhymesWith(candidate.rhymeWord, constraint, lang.stressPattern);
}

/**
 * Diagnostic helper: returns a summary of how many rhyme pairs the
 * stanza actually achieved (vs how many the scheme called for).
 */
export interface StanzaDiagnostics {
  metricFitMean: number;
  rhymePairsAchieved: number;
  rhymePairsExpected: number;
}

export function diagnoseStanza(
  stanza: ScoredLine[],
  scheme: RhymeScheme,
  lang: Language,
): StanzaDiagnostics {
  const meanScore =
    stanza.length > 0
      ? stanza.reduce((s, c) => s + c.meterScore, 0) / stanza.length
      : 0;
  const groups = rhymeGroupsFor(scheme, stanza.length);
  let achieved = 0;
  let expected = 0;
  // Count distinct group-pairs expected.
  const seenGroups = new Map<string, number[]>();
  groups.forEach((g, i) => {
    const list = seenGroups.get(g) ?? [];
    list.push(i);
    seenGroups.set(g, list);
  });
  for (const list of seenGroups.values()) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i++) {
      expected++;
      const a = stanza[list[0]!];
      const b = stanza[list[i]!];
      if (a && b && rhymesWith(a.rhymeWord, b.rhymeWord, lang.stressPattern)) {
        achieved++;
      }
    }
  }
  return {
    metricFitMean: meanScore,
    rhymePairsAchieved: achieved,
    rhymePairsExpected: expected,
  };
}

void rhymeSyllable; // re-export available for callers
