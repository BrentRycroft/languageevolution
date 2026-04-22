import type { Language } from "../types";
import type { GeneratedRule } from "../phonology/generated";

export interface RuleDiff {
  onlyInA: GeneratedRule[];
  onlyInB: GeneratedRule[];
  both: Array<{ template: string; a: GeneratedRule; b: GeneratedRule }>;
}

export function diffActiveRules(a: Language, b: Language): RuleDiff {
  const aByTpl = new Map<string, GeneratedRule>();
  for (const r of a.activeRules ?? []) aByTpl.set(r.templateId, r);
  const bByTpl = new Map<string, GeneratedRule>();
  for (const r of b.activeRules ?? []) bByTpl.set(r.templateId, r);

  const onlyInA: GeneratedRule[] = [];
  const onlyInB: GeneratedRule[] = [];
  const both: Array<{ template: string; a: GeneratedRule; b: GeneratedRule }> = [];

  for (const [tpl, rule] of aByTpl) {
    if (bByTpl.has(tpl)) {
      both.push({ template: tpl, a: rule, b: bByTpl.get(tpl)! });
    } else {
      onlyInA.push(rule);
    }
  }
  for (const [tpl, rule] of bByTpl) {
    if (!aByTpl.has(tpl)) onlyInB.push(rule);
  }
  return { onlyInA, onlyInB, both };
}

export interface OtDiffRow {
  constraint: string;
  aRank: number | null;
  bRank: number | null;
}

/**
 * Align two OT rankings and report each constraint's rank in A vs B.
 * Lower rank = higher priority (0 is "highest-ranked constraint").
 * Null means the constraint is absent from that language's ranking.
 */
export function diffOtRankings(a: Language, b: Language): OtDiffRow[] {
  const rows = new Map<string, OtDiffRow>();
  a.otRanking.forEach((c, i) => {
    rows.set(c, { constraint: c, aRank: i, bRank: null });
  });
  b.otRanking.forEach((c, i) => {
    const row = rows.get(c);
    if (row) row.bRank = i;
    else rows.set(c, { constraint: c, aRank: null, bRank: i });
  });
  // Sort by largest rank disagreement so biggest differences surface first.
  return Array.from(rows.values()).sort((x, y) => {
    const deltaX = Math.abs((x.aRank ?? 0) - (x.bRank ?? 0));
    const deltaY = Math.abs((y.aRank ?? 0) - (y.bRank ?? 0));
    return deltaY - deltaX;
  });
}

export interface GrammarDiffRow {
  feature: string;
  a: string;
  b: string;
  different: boolean;
}

export function diffGrammar(a: Language, b: Language): GrammarDiffRow[] {
  const rows: GrammarDiffRow[] = [];
  const keys = Object.keys(a.grammar) as (keyof typeof a.grammar)[];
  for (const k of keys) {
    const av = String(a.grammar[k]);
    const bv = String(b.grammar[k]);
    rows.push({ feature: String(k), a: av, b: bv, different: av !== bv });
  }
  return rows;
}
