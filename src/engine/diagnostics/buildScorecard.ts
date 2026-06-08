import type { Language, WordForm } from "../types";
import { lexIds } from "../lexicon/access";
import {
  type DiagnosticRow,
  scalarRow,
  categoricalRow,
  swadeshRetention,
  identicalRetention,
  onsetStats,
  actuationShare,
  chainShiftEvents,
  antonymCosine,
  colexificationRate,
  homophonyRate,
  driftQuality,
  lexiconLifecycle,
  greenbergConsistency,
  readTypology,
} from "./scorecard";
import { runCorpus, phraseRows } from "./translatorCorpus";

/**
 * buildScorecard.ts — assemble the full per-preset diagnostic row list.
 *
 * Pure: consumes the gen-0 seed snapshot + the evolved language and emits
 * every scorecard row. The harness owns evolving + printing; this owns the
 * preferred values and bands (the single source of truth for "what good
 * looks like", per the calibration philosophy in MEGA-OVERHAUL §Lane 0).
 */

/** Per-preset declared (preferred) typology axes — the categorical targets. */
export interface PresetTypology {
  wordOrder?: string;
  caseStrategy?: string;
  adjectivePosition?: string;
  possessorPosition?: string;
}

/**
 * The declared typology of each bundled preset (read from its seedGrammar).
 * These are the PREFERRED values for the typology categorical rows: a lineage
 * that drifts off its seeded axis shows as a mismatch (WARN — drift is allowed,
 * but flagged). Presets not listed fall back to "no preferred" (informational).
 */
export const PRESET_TYPOLOGY: Readonly<Record<string, PresetTypology>> = {
  pie: { wordOrder: "SOV", caseStrategy: "case", adjectivePosition: "pre", possessorPosition: "pre" },
  germanic: { wordOrder: "SVO", caseStrategy: "preposition", adjectivePosition: "pre", possessorPosition: "pre" },
  romance: { wordOrder: "SVO", caseStrategy: "case", adjectivePosition: "pre", possessorPosition: "post" },
  bantu: { wordOrder: "SVO", caseStrategy: "preposition", adjectivePosition: "post", possessorPosition: "post" },
  tokipona: { wordOrder: "SVO", caseStrategy: "preposition", adjectivePosition: "pre", possessorPosition: "pre" },
  english: { wordOrder: "SVO", caseStrategy: "preposition", adjectivePosition: "pre", possessorPosition: "pre" },
};

export interface BuildScorecardInput {
  presetId: string;
  seed: Map<string, WordForm>;
  seedInvSize: number;
  /** Final evolved language (sole leaf). */
  lang: Language;
  /** Swadesh retention at the 1000-year (40-gen) checkpoint. */
  swadesh1000: number;
  horizonGens: number;
}

export function buildScorecard(input: BuildScorecardInput): DiagnosticRow[] {
  const { presetId, seed, seedInvSize, lang, swadesh1000, horizonGens } = input;
  const rows: DiagnosticRow[] = [];

  // ── RETENTION (glottochronology) ──
  const swadeshFinal = swadeshRetention(seed, lang);
  rows.push(
    scalarRow(
      "retention",
      "Swadesh @1000yr",
      swadesh1000,
      "~82%",
      { pass: [0.78, 0.86], warn: [0.6, 0.95] },
      (n) => `${(n * 100).toFixed(1)}%`,
    ),
  );
  rows.push(
    scalarRow(
      "retention",
      `Swadesh @${horizonGens}gen (deep-time)`,
      swadeshFinal,
      "decays, no collapse",
      { pass: [0.1, 1], warn: [0.05, 1] },
      (n) => `${(n * 100).toFixed(1)}%`,
    ),
  );
  rows.push(
    scalarRow(
      "retention",
      "Whole-lex identical @1000yr",
      identicalRetention(seed, lang),
      "≥30%",
      { pass: [0.3, 1], warn: [0.1, 1] },
      (n) => `${(n * 100).toFixed(1)}%`,
    ),
  );

  // ── LEXICON LIFECYCLE ──
  const sizeRatio = lexIds(lang).length / Math.max(1, seed.size);
  rows.push(
    scalarRow(
      "lexicon",
      "size ratio (stationarity)",
      sizeRatio,
      "~1.0×",
      { pass: [0.7, 1.5], warn: [0.5, 3.0] },
      (n) => `${n.toFixed(2)}×`,
    ),
  );
  const life = lexiconLifecycle(lang);
  rows.push(
    scalarRow(
      "lexicon",
      "birth/death balance (death÷birth)",
      life.balance,
      "~1.0 (stationary cycle)",
      { pass: [0.5, 2.0], warn: [0.1, 5.0] },
      (n) => `${n.toFixed(2)}`,
    ),
  );
  rows.push({
    group: "lexicon",
    label: "births | deaths (events)",
    actual: `${life.births} | ${life.deaths}`,
    preferred: "both > 0",
    band: "(informational)",
    status: life.births > 0 && life.deaths > 0 ? "PASS" : "INFO",
  });

  // ── PHONOLOGY ──
  const onset = onsetStats(lang);
  rows.push(
    scalarRow(
      "phonology",
      "onset /h/ share",
      onset.hShare,
      "<10%",
      { pass: [0, 0.1], warn: [0, 0.25] },
      (n) => `${(n * 100).toFixed(1)}%`,
    ),
  );
  rows.push(
    scalarRow(
      "phonology",
      "onset voiceless-stop p/t/k share",
      onset.voicelessStopShare,
      "healthy (>5%)",
      { pass: [0.05, 1], warn: [0.02, 1] },
      (n) => `${(n * 100).toFixed(1)}%`,
    ),
  );
  const invSize = lang.phonemeInventory.segmental.length;
  const invTarget = lang.phonemeTarget;
  rows.push(
    scalarRow(
      "phonology",
      `inventory size (seed ${seedInvSize}, target ${invTarget ?? "n/a"})`,
      invSize,
      invTarget !== undefined ? `near ${invTarget}` : "near tier target",
      invTarget !== undefined
        ? { pass: [invTarget - 8, invTarget + 8], warn: [invTarget - 14, invTarget + 14] }
        : { pass: [12, 45], warn: [8, 60] },
      (n) => `${Math.round(n)}`,
    ),
  );
  rows.push(
    scalarRow(
      "phonology",
      "onset diversity (distinct onsets)",
      onset.distinctOnsets,
      "diverse (≥10)",
      { pass: [10, Infinity], warn: [6, Infinity] },
      (n) => `${Math.round(n)}`,
    ),
  );
  const act = actuationShare(lang);
  rows.push(
    scalarRow(
      "phonology",
      `regular-sweep share (reg ${act.regular} | per-word ${act.perWord})`,
      act.regularShare,
      "regular dominant (>60%)",
      { pass: [0.6, 1], warn: [0.4, 1] },
      (n) => `${(n * 100).toFixed(0)}%`,
    ),
  );
  rows.push({
    group: "phonology",
    label: "chain-shift / phonologisation events",
    actual: `${chainShiftEvents(lang)}`,
    preferred: ">0 (real diachrony texture)",
    band: "(informational)",
    status: chainShiftEvents(lang) > 0 ? "PASS" : "INFO",
  });

  // ── SEMANTICS ──
  const colex = colexificationRate(lang);
  rows.push(
    scalarRow(
      "semantics",
      "colexification rate (lexemes w/ edge)",
      colex.rate,
      "pervasive (>2%)",
      { pass: [0.02, 1], warn: [0.005, 1] },
      (n) => `${(n * 100).toFixed(1)}%`,
    ),
  );
  rows.push(
    scalarRow(
      "semantics",
      "homophony rate (accidental)",
      homophonyRate(lang),
      "<4%",
      { pass: [0, 0.04], warn: [0, 0.15] },
      (n) => `${(n * 100).toFixed(1)}%`,
    ),
  );
  const antos = antonymCosine(lang);
  rows.push(
    scalarRow(
      "semantics",
      `antonym embed-cosine (mean, n=${antos.n})`,
      antos.mean,
      "≪1 (well-separated)",
      { pass: [-1, 0.6], warn: [-1, 0.85] },
      (n) => `${n.toFixed(3)}`,
    ),
  );
  const drift = driftQuality(lang);
  rows.push(
    scalarRow(
      "semantics",
      `antonym-drift count (of ${drift.total} drifts)`,
      drift.antonym,
      "0 (no→opposite drift)",
      { pass: [0, 0], warn: [0, 1] },
      (n) => `${n}`,
    ),
  );
  rows.push({
    group: "semantics",
    label: "drift-target curated share",
    actual: drift.total === 0 ? "n/a" : `${drift.curated}/${drift.total}`,
    preferred: "high (curated neighbours)",
    band: "(informational)",
    status: drift.total === 0 ? "INFO" : drift.curated > 0 ? "PASS" : "WARN",
  });

  // ── TYPOLOGY (Greenberg consistency + declared-axis match) ──
  const greenberg = greenbergConsistency(lang);
  rows.push(
    scalarRow(
      "typology",
      `Greenberg consistency (${greenberg.satisfied}/${greenberg.checked} impl.)`,
      greenberg.checked === 0 ? NaN : greenberg.satisfied / greenberg.checked,
      "100% consistent",
      { pass: [1, 1], warn: [0.5, 1] },
      (n) => `${(n * 100).toFixed(0)}%`,
    ),
  );
  if (greenberg.violations.length > 0) {
    rows.push({
      group: "typology",
      label: "Greenberg violations",
      actual: greenberg.violations.join(","),
      preferred: "(none)",
      band: "(informational)",
      status: "WARN",
    });
  }
  const typ = readTypology(lang);
  const pref = PRESET_TYPOLOGY[presetId];
  rows.push(categoricalRow("typology", "wordOrder vs seed", typ.wordOrder, pref?.wordOrder, { warnOnMismatch: true }));
  rows.push(categoricalRow("typology", "caseStrategy vs seed", typ.caseStrategy, pref?.caseStrategy, { warnOnMismatch: true }));
  rows.push(categoricalRow("typology", "adjectivePosition vs seed", typ.adjectivePosition, pref?.adjectivePosition, { warnOnMismatch: true }));
  rows.push(categoricalRow("typology", "possessorPosition vs seed", typ.possessorPosition, pref?.possessorPosition, { warnOnMismatch: true }));

  // ── TRANSLATOR CORPUS ──
  rows.push(...phraseRows(runCorpus(lang)));

  return rows;
}
