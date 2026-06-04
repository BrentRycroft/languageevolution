import type { Language, SimulationState, WordForm } from "../types";
import { leafIds } from "../tree/split";
import { lexGet, lexHas, lexKeys } from "../lexicon/access";
import { levenshtein } from "../phonology/ipa";
import { SWADESH_LIST } from "../semantics/lexicostat";
import { embed, cosine } from "../semantics/embeddings";
import { colexWith } from "../lexicon/concepts";
import { neighborsOf } from "../semantics/neighbors";
import { areAntonyms } from "../semantics/antonyms";

/**
 * scorecard.ts — the holistic Simulation Scorecard engine (Lane 0).
 *
 * A scorecard is a flat list of DIAGNOSTIC ROWS. Each row reports an
 * `actual` value, the `preferred` value (the realism / correctness target),
 * a soft `band`, and a PASS/WARN/FAIL status. The scorecard is a REPORT, not
 * a brittle lock: a row going FAIL is a signal to investigate (the preferred
 * value may be wrong for the new system, per the MEGA-OVERHAUL calibration
 * note), not an automatic build failure.
 *
 * This module is PURE measurement: it reads an already-evolved `Language` /
 * `SimulationState` and never mutates the engine. The test harness
 * (realism_scorecard.test.ts) owns evolving the presets and printing.
 *
 * Diagnostic groups:
 *   - typology   : Greenberg-axis consistency + per-preset declared-axis match
 *   - lexicon    : size stationarity, birth/death balance
 *   - phonology  : onset profile, inventory diversity, regular-vs-per-word share
 *   - semantics  : colexification rate, antonym embedding separation, drift quality
 *   - retention  : Swadesh glottochronology curve
 *   - translator : the user test-phrase corpus (objects retained, no spurious coinage)
 *   - perf       : byte-identity / reproducibility (NON-GATING)
 */

// ──────────────────────────────────────────────────────────────────────────
// Row model
// ──────────────────────────────────────────────────────────────────────────

export type DiagnosticStatus = "PASS" | "WARN" | "FAIL" | "INFO";

export type DiagnosticGroup =
  | "typology"
  | "lexicon"
  | "phonology"
  | "semantics"
  | "retention"
  | "translator"
  | "perf";

export interface DiagnosticRow {
  group: DiagnosticGroup;
  /** Short human label for the metric. */
  label: string;
  /** The measured value rendered as a display string. */
  actual: string;
  /** The preferred / target value rendered as a display string. */
  preferred: string;
  /** Human description of the acceptance band. */
  band: string;
  status: DiagnosticStatus;
  /** Raw numeric value when the metric is scalar (for aggregation/tests). */
  value?: number;
}

/**
 * Band check for a scalar metric. `warn` widens the `pass` band; outside both
 * is FAIL. NaN ⇒ INFO (the metric couldn't be measured this run).
 */
export interface Band {
  /** [min, max] inclusive — inside ⇒ PASS. Use ±Infinity for one-sided. */
  pass: readonly [number, number];
  /** [min, max] inclusive — inside (but outside pass) ⇒ WARN. */
  warn?: readonly [number, number];
}

function classify(value: number, band: Band): DiagnosticStatus {
  if (Number.isNaN(value)) return "INFO";
  const [pLo, pHi] = band.pass;
  if (value >= pLo && value <= pHi) return "PASS";
  if (band.warn) {
    const [wLo, wHi] = band.warn;
    if (value >= wLo && value <= wHi) return "WARN";
  }
  return "FAIL";
}

function bandText(band: Band, fmt: (n: number) => string): string {
  const one = (n: number) => (Number.isFinite(n) ? fmt(n) : n > 0 ? "∞" : "−∞");
  const [lo, hi] = band.pass;
  if (lo === -Infinity) return `≤${one(hi)}`;
  if (hi === Infinity) return `≥${one(lo)}`;
  return `${one(lo)}–${one(hi)}`;
}

const num = (n: number, d = 2): string => (Number.isNaN(n) ? "n/a" : n.toFixed(d));
const pct = (x: number): string => (Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** Build a scalar diagnostic row, auto-classifying against the band. */
export function scalarRow(
  group: DiagnosticGroup,
  label: string,
  value: number,
  preferred: string,
  band: Band,
  fmt: (n: number) => string = (n) => num(n),
): DiagnosticRow {
  return {
    group,
    label,
    actual: Number.isNaN(value) ? "n/a" : fmt(value),
    preferred,
    band: bandText(band, fmt),
    status: classify(value, band),
    value,
  };
}

/** Build a categorical diagnostic row (match/mismatch against a preferred). */
export function categoricalRow(
  group: DiagnosticGroup,
  label: string,
  actual: string,
  preferred: string | undefined,
  opts: { warnOnMismatch?: boolean } = {},
): DiagnosticRow {
  let status: DiagnosticStatus = "INFO";
  if (preferred !== undefined) {
    status = actual === preferred ? "PASS" : opts.warnOnMismatch ? "WARN" : "FAIL";
  }
  return {
    group,
    label,
    actual,
    preferred: preferred ?? "(any)",
    band: preferred === undefined ? "(informational)" : "exact match",
    status,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// State helpers
// ──────────────────────────────────────────────────────────────────────────

export function soleLeaf(state: SimulationState): Language {
  const ids = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
  return state.tree[ids[0] ?? state.rootId]!.language;
}

function isLexeme(lang: Language, m: string): boolean {
  if (lang.boundMorphemes?.has(m)) return false;
  if (m.startsWith("-")) return false;
  return true;
}

export function captureSeed(lang: Language): Map<string, WordForm> {
  const out = new Map<string, WordForm>();
  for (const m of lexKeys(lang)) {
    const f = lexGet(lang, m);
    if (f && f.length > 0) out.set(m, f.slice());
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// RETENTION (glottochronology)
// ──────────────────────────────────────────────────────────────────────────

/** Swadesh-core cognate retention vs the gen-0 seed. */
export function swadeshRetention(seed: Map<string, WordForm>, lang: Language): number {
  let attested = 0;
  let retained = 0;
  for (const m of SWADESH_LIST) {
    const s = seed.get(m);
    const c = lexGet(lang, m);
    if (!s || !c || c.length === 0) continue;
    attested++;
    const d = levenshtein(s, c);
    const minLen = Math.min(s.length, c.length);
    const thr = Math.max(2, Math.ceil(minLen * 0.4));
    if (d <= thr) retained++;
  }
  return attested === 0 ? NaN : retained / attested;
}

/** Share of seed concepts whose current form is byte-identical to gen 0. */
export function identicalRetention(seed: Map<string, WordForm>, lang: Language): number {
  let total = 0;
  let same = 0;
  for (const [m, s] of seed) {
    const c = lexGet(lang, m);
    if (!c) continue;
    total++;
    if (c.join("") === s.join("")) same++;
  }
  return total === 0 ? NaN : same / total;
}

// ──────────────────────────────────────────────────────────────────────────
// PHONOLOGY
// ──────────────────────────────────────────────────────────────────────────

const VOICELESS_STOPS = new Set(["p", "t", "k"]);

export function onsetStats(lang: Language): {
  hShare: number;
  voicelessStopShare: number;
  distinctOnsets: number;
  top: Array<[string, number]>;
} {
  const counts = new Map<string, number>();
  let total = 0;
  for (const m of lexKeys(lang)) {
    if (!isLexeme(lang, m)) continue;
    const f = lexGet(lang, m);
    if (!f || f.length === 0) continue;
    const onset = f[0]!;
    counts.set(onset, (counts.get(onset) ?? 0) + 1);
    total++;
  }
  let h = 0;
  let vs = 0;
  for (const [seg, n] of counts) {
    if (seg === "h") h += n;
    if (VOICELESS_STOPS.has(seg)) vs += n;
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return {
    hShare: total === 0 ? NaN : h / total,
    voicelessStopShare: total === 0 ? NaN : vs / total,
    distinctOnsets: counts.size,
    top,
  };
}

/**
 * Actuation-mode share: of all logged sound-change/actuation events, the
 * fraction tagged as the REGULAR (exceptionless, global) sweep vs the
 * per-word/lexical-diffusion path. Lane A's calibration target is that the
 * regular sweep is the COMMON path and per-word change is the minority. The
 * parser keys off the description tags the engine emits ("regular"/"global"
 * for the sweep; "per-word"/"lexical" for diffusion).
 */
export function actuationShare(lang: Language): {
  regular: number;
  perWord: number;
  regularShare: number;
} {
  let regular = 0;
  let perWord = 0;
  for (const e of lang.events) {
    if (e.kind !== "sound_change" && e.kind !== "actuation") continue;
    const d = e.description.toLowerCase();
    if (d.includes("per-word") || d.includes("per word") || d.includes("lexical diffusion")) {
      perWord++;
    } else if (d.includes("regular") || d.includes("global") || d.includes("exceptionless") || d.includes("sweep")) {
      regular++;
    }
  }
  const total = regular + perWord;
  return { regular, perWord, regularShare: total === 0 ? NaN : regular / total };
}

/** Count of chain-shift / phonologisation events (texture of real diachrony). */
export function chainShiftEvents(lang: Language): number {
  let n = 0;
  for (const e of lang.events) {
    if (e.kind === "chain_shift" || e.kind === "phonologisation") n++;
  }
  return n;
}

// ──────────────────────────────────────────────────────────────────────────
// SEMANTICS
// ──────────────────────────────────────────────────────────────────────────

// Curated antonym/converse pairs for the embedding-cosine diagnostic (incl.
// co-element / converse pairs the audit flagged as embedding-degenerate).
const ANTONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["big", "small"], ["good", "bad"], ["hot", "cold"], ["new", "old"],
  ["black", "white"], ["day", "night"], ["alive", "dead"], ["water", "fire"],
  ["full", "empty"], ["dry", "wet"], ["long", "short"], ["light", "dark"],
  ["high", "low"], ["near", "far"], ["give", "take"], ["come", "go"],
  ["love", "hate"], ["open", "close"], ["happy", "sad"], ["fast", "slow"],
];

/** Mean embedding cosine across curated antonym pairs (lower = better separated). */
export function antonymCosine(lang: Language): { mean: number; max: number; n: number } {
  let sum = 0;
  let max = -1;
  let n = 0;
  for (const [a, b] of ANTONYM_PAIRS) {
    if (!lexHas(lang, a) || !lexHas(lang, b)) continue;
    const c = cosine(embed(a, lang), embed(b, lang));
    sum += c;
    if (c > max) max = c;
    n++;
  }
  return { mean: n === 0 ? NaN : sum / n, max: n === 0 ? NaN : max, n };
}

/**
 * Colexification rate: share of content lexemes that carry at least one
 * recorded colexification edge (the CLICS pattern — one form spanning several
 * related senses). Cross-linguistically pervasive; realism wants this NON-zero.
 */
export function colexificationRate(lang: Language): { rate: number; meanDegree: number } {
  const colex = lang.colexifiedAs ?? {};
  let lexemes = 0;
  let withEdge = 0;
  let edgeSum = 0;
  for (const m of lexKeys(lang)) {
    if (!isLexeme(lang, m)) continue;
    lexemes++;
    const edges = colex[m];
    if (edges && edges.length > 0) {
      withEdge++;
      edgeSum += edges.length;
    }
  }
  return {
    rate: lexemes === 0 ? NaN : withEdge / lexemes,
    meanDegree: withEdge === 0 ? 0 : edgeSum / withEdge,
  };
}

/**
 * TRUE accidental homophony: share of lexemes sharing a form with an
 * UNRELATED lexeme (recorded colexification excluded — that's healthy polysemy).
 */
export function homophonyRate(lang: Language): number {
  const byForm = new Map<string, string[]>();
  let total = 0;
  for (const m of lexKeys(lang)) {
    if (!isLexeme(lang, m)) continue;
    const f = lexGet(lang, m);
    if (!f || f.length === 0) continue;
    const k = f.join("");
    const arr = byForm.get(k);
    if (arr) arr.push(m);
    else byForm.set(k, [m]);
    total++;
  }
  let collide = 0;
  for (const ms of byForm.values()) {
    if (ms.length < 2) continue;
    for (const m of ms) {
      const colex = new Set(lang.colexifiedAs?.[m] ?? []);
      if (ms.some((o) => o !== m && !colex.has(o))) collide++;
    }
  }
  return total === 0 ? NaN : collide / total;
}

/**
 * Drift-target quality. Parses `<tag>: <from> → <to>` drift events; scores
 * how many land on a curated neighbour/colexification of the source (good)
 * vs on the source's own antonym (the Phase 3b bug). antonym-drift must be 0.
 */
export function driftQuality(lang: Language): {
  total: number;
  curated: number;
  antonym: number;
  antonymRate: number;
} {
  let total = 0;
  let curated = 0;
  let antonym = 0;
  for (const e of lang.events) {
    if (e.kind !== "semantic_drift") continue;
    const mt = e.description.match(/: ([\w-]+) → ([\w-]+)$/);
    if (!mt) continue;
    const from = mt[1]!;
    const to = mt[2]!;
    total++;
    const curatedSet = new Set([...neighborsOf(from), ...colexWith(from)]);
    if (curatedSet.has(to)) curated++;
    if (areAntonyms(from, to)) antonym++;
  }
  return { total, curated, antonym, antonymRate: total === 0 ? NaN : antonym / total };
}

// ──────────────────────────────────────────────────────────────────────────
// LEXICON LIFECYCLE
// ──────────────────────────────────────────────────────────────────────────

/** Counts of birth (coinage/replacement) vs death (merger/obsolescence/replacement-loss) events. */
export function lexiconLifecycle(lang: Language): {
  births: number;
  deaths: number;
  balance: number;
} {
  let births = 0;
  let deaths = 0;
  for (const e of lang.events) {
    if (e.kind === "coinage") births++;
    else if (e.kind === "lexical_replacement") {
      // A replacement is both a birth (new form) and a death (old form retired).
      births++;
      deaths++;
    } else if (e.kind === "merger") deaths++;
  }
  // balance = deaths / births → ~1.0 is a stationary replacement cycle.
  return { births, deaths, balance: births === 0 ? NaN : deaths / births };
}

// ──────────────────────────────────────────────────────────────────────────
// TYPOLOGY (Greenberg-axis consistency)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Greenberg implicational-universal consistency, read directly off the evolved
 * grammar (mirrors `grammar/universals.enforceTypologicalUniversals`, but as a
 * non-mutating diagnostic). Returns the count of satisfied vs checked
 * implications so a language that drifts into an inconsistent state shows up.
 */
export function greenbergConsistency(lang: Language): {
  satisfied: number;
  checked: number;
  violations: string[];
} {
  const g = lang.grammar;
  const violations: string[] = [];
  let checked = 0;
  let satisfied = 0;

  const check = (cond: boolean, ok: boolean, label: string) => {
    if (!cond) return;
    checked++;
    if (ok) satisfied++;
    else violations.push(label);
  };

  // U1: SOV ↔ postpositional; V-initial ↔ prepositional.
  check(
    g.wordOrder === "SOV" && g.caseStrategy !== undefined && g.caseStrategy !== "case",
    g.caseStrategy === "postposition" || g.caseStrategy === "mixed",
    "U1:SOV→preposition",
  );
  check(
    (g.wordOrder === "VSO" || g.wordOrder === "VOS") &&
      g.caseStrategy !== undefined &&
      g.caseStrategy !== "case",
    g.caseStrategy === "preposition" || g.caseStrategy === "mixed",
    "U1:Vinit→postposition",
  );
  // U2: SOV ↔ pre-noun modifiers (adjective, numeral, possessor/GenN).
  check(g.wordOrder === "SOV" && g.adjectivePosition !== undefined, g.adjectivePosition === "pre", "U2:SOV→post-adj");
  check(g.wordOrder === "SOV" && g.numeralPosition !== undefined, g.numeralPosition === "pre", "U2:SOV→post-num");
  check(g.wordOrder === "SOV" && g.possessorPosition !== undefined, g.possessorPosition === "pre", "U2:SOV→post-poss");
  // U3: no morphological case is consistent with any strategy — informational only.

  return { satisfied, checked, violations };
}

/** Declared (preferred) typology per preset, used as the categorical target. */
export interface DeclaredTypology {
  wordOrder?: GrammarStr;
  caseStrategy?: GrammarStr;
  adjectivePosition?: GrammarStr;
  possessorPosition?: GrammarStr;
}
type GrammarStr = string;

export function readTypology(lang: Language): Required<DeclaredTypology> {
  const g = lang.grammar;
  return {
    wordOrder: g.wordOrder ?? "—",
    caseStrategy: g.caseStrategy ?? (g.hasCase ? "case" : "—"),
    adjectivePosition: g.adjectivePosition ?? "—",
    possessorPosition: g.possessorPosition ?? "—",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Aggregation helpers
// ──────────────────────────────────────────────────────────────────────────

export interface ScorecardSummary {
  pass: number;
  warn: number;
  fail: number;
  info: number;
}

export function summarize(rows: readonly DiagnosticRow[]): ScorecardSummary {
  const s: ScorecardSummary = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const r of rows) {
    if (r.status === "PASS") s.pass++;
    else if (r.status === "WARN") s.warn++;
    else if (r.status === "FAIL") s.fail++;
    else s.info++;
  }
  return s;
}

const STATUS_GLYPH: Record<DiagnosticStatus, string> = {
  PASS: "✓ PASS",
  WARN: "~ WARN",
  FAIL: "✗ FAIL",
  INFO: "· INFO",
};

/** Render a block of diagnostic rows as an aligned text report. */
export function renderRows(title: string, rows: readonly DiagnosticRow[]): string {
  const lines: string[] = [``, `═══ ${title} ═══`];
  const labelW = Math.max(20, ...rows.map((r) => r.label.length));
  const actualW = Math.max(8, ...rows.map((r) => r.actual.length));
  const prefW = Math.max(8, ...rows.map((r) => r.preferred.length));
  let group = "";
  for (const r of rows) {
    if (r.group !== group) {
      group = r.group;
      lines.push(`  ── ${group} ──`);
    }
    lines.push(
      `  ${STATUS_GLYPH[r.status]}  ${r.label.padEnd(labelW)}  ` +
        `act=${r.actual.padStart(actualW)}  pref=${r.preferred.padStart(prefW)}  band[${r.band}]`,
    );
  }
  const s = summarize(rows);
  lines.push(
    `  ──────── ${s.pass} PASS · ${s.warn} WARN · ${s.fail} FAIL · ${s.info} INFO ────────`,
  );
  return lines.join("\n");
}

export { pct, num };
