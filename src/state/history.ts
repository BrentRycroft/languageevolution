import type { SimulationState, Meaning, WordForm } from "../engine/types";

export const MAX_HISTORY = 500;
export const MAX_ACTIVITY = 200;

export interface TimelineEntry {
  generation: number;
  form: WordForm;
  formKey: string;
}

export interface HistoryByLangMeaning {
  [langId: string]: {
    [meaning: string]: TimelineEntry[];
  };
}

export interface ActivityPoint {
  generation: number;
  /** Total form-mutations in the generation across all leaves. */
  count: number;
  /** Number of procedural rules that were born this generation. */
  ruleBirths?: number;
}

export function recordHistory(
  history: HistoryByLangMeaning,
  state: SimulationState,
): { next: HistoryByLangMeaning; changeCount: number } {
  const next: HistoryByLangMeaning = { ...history };
  let changeCount = 0;
  for (const id of Object.keys(state.tree)) {
    const node = state.tree[id]!;
    if (node.childrenIds.length > 0) continue;
    const lex = node.language.lexicon;
    if (!next[id]) next[id] = {};
    const byMeaning = (next[id] = { ...next[id] });
    for (const m of Object.keys(lex)) {
      const form = lex[m]!;
      const key = form.join("");
      const arr = byMeaning[m] ?? [];
      const last = arr[arr.length - 1];
      if (!last || last.formKey !== key) {
        const nextArr = arr.concat({
          generation: state.generation,
          form: form.slice(),
          formKey: key,
        });
        byMeaning[m] =
          nextArr.length > MAX_HISTORY
            ? nextArr.slice(nextArr.length - MAX_HISTORY)
            : nextArr;
        if (last) changeCount++;
      }
    }
  }
  return { next, changeCount };
}

export function recordActivity(
  history: ActivityPoint[],
  generation: number,
  count: number,
  ruleBirths = 0,
): ActivityPoint[] {
  const next = [...history, { generation, count, ruleBirths }];
  return next.length > MAX_ACTIVITY ? next.slice(next.length - MAX_ACTIVITY) : next;
}

/**
 * Count how many "new sound law" events landed on `generation` across the
 * state's tree. Used to populate ActivityPoint.ruleBirths.
 */
export function countRuleBirthsAt(
  state: import("../engine/types").SimulationState,
  generation: number,
): number {
  let n = 0;
  for (const id of Object.keys(state.tree)) {
    const lang = state.tree[id]!.language;
    for (const e of lang.events) {
      if (
        e.generation === generation &&
        e.kind === "sound_change" &&
        e.description.startsWith("new sound law:")
      ) {
        n++;
      }
    }
  }
  return n;
}

/**
 * Look up the form for `meaning` in `langId` as it existed at or before
 * `generation`. Returns undefined if no history exists that early.
 * Used by the timeline scrubber to render a past generation.
 */
export function formAtGeneration(
  history: HistoryByLangMeaning,
  langId: string,
  meaning: Meaning,
  generation: number,
): WordForm | undefined {
  const entries = history[langId]?.[meaning];
  if (!entries || entries.length === 0) return undefined;
  let candidate: WordForm | undefined;
  for (const e of entries) {
    if (e.generation <= generation) candidate = e.form;
    else break;
  }
  return candidate;
}

/**
 * All meanings ever recorded for any leaf. Used by the global search so that
 * meanings retired via obsolescence are still searchable.
 */
export function allHistoricalMeanings(history: HistoryByLangMeaning): Set<string> {
  const out = new Set<string>();
  for (const byLang of Object.values(history)) {
    for (const m of Object.keys(byLang)) out.add(m);
  }
  return out;
}
