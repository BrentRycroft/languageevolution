import { describe, it, expect } from "vitest";
import { PRESETS } from "../presets";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";
import { lexGet, lexHas, lexKeys } from "../lexicon/access";
import { levenshtein } from "../phonology/ipa";
import { SWADESH_LIST } from "../semantics/lexicostat";
import { embed, cosine } from "../semantics/embeddings";
import { CONCEPTS, colexWith } from "../lexicon/concepts";
import { neighborsOf } from "../semantics/neighbors";
import { areAntonyms } from "../semantics/antonyms";
import { YEARS_PER_GENERATION } from "../constants";
import type { Language, WordForm, SimulationConfig, SimulationState } from "../types";

/**
 * realism_scorecard.test.ts  (RUN_SLOW)
 *
 * Phase 0 of the Evolution-Realism Milestone (docs/planning/
 * EVOLUTION-REALISM-MILESTONE.md). This is the measurement spine for the
 * whole milestone: a tolerance-banded numerical report of how realistic
 * each preset's evolution is, so every later phase can prove it helped
 * and nothing regressed. It is NOT a byte-identity lock — the milestone
 * deliberately re-baselines `meaning_layer_baseline` each phase.
 *
 * Each preset is evolved as a SINGLE non-splitting, non-dying lineage
 * (splitProbabilityPerGeneration = 0, modes.death = false) so the Swadesh
 * retention curve tracks one clean glottochronology lineage vs the gen-0
 * seed — the classical lexicostatistic measurement.
 *
 * The bands here are intentionally WIDE (a "don't regress past today's
 * baseline" floor). Each milestone phase tightens the specific metric it
 * targets toward the column in the scorecard table. The console report
 * prints the live numbers so they can be compared to the audit and to
 * post-phase runs.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

// 25 yr/gen → 40 gens = 1000 years (the glottochronology checkpoint).
const CHECKPOINTS = [40, 100, 200] as const; // 1000, 2500, 5000 years
const HORIZON = CHECKPOINTS[CHECKPOINTS.length - 1];

// Pairs for the embedding-COSINE metric (separate from the engine's
// gradable-only antonym set): includes co-element / converse pairs
// (water/fire, day/night, give/take) the audit cited as embedding-
// degenerate (cos≈0.99) even though they are not gradable antonyms.
const ANTONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["big", "small"], ["good", "bad"], ["hot", "cold"], ["new", "old"],
  ["black", "white"], ["day", "night"], ["alive", "dead"], ["water", "fire"],
  ["full", "empty"], ["dry", "wet"], ["long", "short"], ["light", "dark"],
  ["high", "low"], ["near", "far"], ["give", "take"], ["come", "go"],
  ["love", "hate"], ["open", "close"], ["happy", "sad"], ["fast", "slow"],
];

const VOICELESS_STOPS = new Set(["p", "t", "k"]);

function scorecardConfig(build: () => SimulationConfig): SimulationConfig {
  const cfg = build();
  // Single clean lineage: no cladogenesis, no extinction.
  cfg.tree = { ...cfg.tree, splitProbabilityPerGeneration: 0 };
  cfg.modes = { ...cfg.modes, death: false };
  return cfg;
}

function soleLeaf(state: SimulationState): Language {
  const ids = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
  return state.tree[ids[0] ?? state.rootId]!.language;
}

/** Snapshot every content lexeme's gen-0 form, keyed by gloss. */
function captureSeed(lang: Language): Map<string, WordForm> {
  const out = new Map<string, WordForm>();
  for (const m of lexKeys(lang)) {
    const f = lexGet(lang, m);
    if (f && f.length > 0) out.set(m, f.slice());
  }
  return out;
}

function isLexeme(lang: Language, m: string): boolean {
  if (lang.boundMorphemes?.has(m)) return false;
  if (m.startsWith("-")) return false;
  return true;
}

/** Swadesh-core cognate retention vs the gen-0 seed (glottochronology). */
function swadeshRetention(seed: Map<string, WordForm>, lang: Language): number {
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
function identicalRetention(seed: Map<string, WordForm>, lang: Language): number {
  let total = 0;
  let same = 0;
  for (const [m, s] of seed) {
    const c = lexGet(lang, m);
    if (!c) continue;
    total++;
    if (c.join("") === s.join("")) same++;
  }
  return total === 0 ? NaN : same / total;
}

function onsetStats(lang: Language): {
  hShare: number;
  voicelessStopShare: number;
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
    top,
  };
}

/**
 * TRUE (accidental) homophony: share of lexemes sharing a form with an
 * UNRELATED lexeme. Deliberate colexification (recorded polysemy in
 * `colexifiedAs` — related senses sharing a form, the CLICS pattern Phase 3a
 * increases) is EXCLUDED — that is healthy, not pathological homophony.
 */
function homophonyRate(lang: Language): number {
  const byForm = new Map<string, string[]>();
  let total = 0;
  for (const m of lexKeys(lang)) {
    if (!isLexeme(lang, m)) continue;
    const _f0 = lexGet(lang, m);
    if (!_f0 || _f0.length === 0) continue;
    const _k0 = _f0.join("");
    const arr = byForm.get(_k0);
    if (arr) arr.push(m);
    else byForm.set(_k0, [m]);
    total++;
  }
  let collide = 0;
  for (const ms of byForm.values()) {
    if (ms.length < 2) continue;
    for (const m of ms) {
      const colex = new Set(lang.colexifiedAs?.[m] ?? []);
      // homophonous only if it shares the form with an UNRELATED meaning
      if (ms.some((o) => o !== m && !colex.has(o))) collide++;
    }
  }
  return total === 0 ? NaN : collide / total;
}

/**
 * Senses-per-word (a cleaner aggregate of lexical ambiguity than the
 * collision %). `total` counts every meaning on a form — INCLUDING
 * colexification (polysemy), so a realistic language sits ~1.1–1.3 because
 * CLICS-style colexification is pervasive (and Phase 3a grows it).
 * `accidental` first merges each form's colexified meanings into one
 * sense-CLUSTER (recorded polysemy), then counts unrelated clusters per
 * form — this is the homophony signal, and the realism target is ≤ ~1.05.
 */
function sensesPerWord(lang: Language): { total: number; accidental: number } {
  const byForm = new Map<string, string[]>();
  let lexemes = 0;
  for (const m of lexKeys(lang)) {
    if (!isLexeme(lang, m)) continue;
    const f = lexGet(lang, m);
    if (!f || f.length === 0) continue;
    const k = f.join("");
    const arr = byForm.get(k);
    if (arr) arr.push(m);
    else byForm.set(k, [m]);
    lexemes++;
  }
  const forms = byForm.size;
  let clusters = 0;
  for (const ms of byForm.values()) {
    // connected components of `ms` under the colexification relation
    const seen = new Set<string>();
    for (const start of ms) {
      if (seen.has(start)) continue;
      clusters++;
      const stack = [start];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const o of lang.colexifiedAs?.[cur] ?? []) {
          if (ms.includes(o) && !seen.has(o)) stack.push(o);
        }
      }
    }
  }
  return {
    total: forms === 0 ? NaN : lexemes / forms,
    accidental: forms === 0 ? NaN : clusters / forms,
  };
}

/** Zipf health: rank-1 / rank-100 frequency ratio + share pinned at the cap. */
function zipfStats(lang: Language): { ratio: number; capShare: number } {
  const vals = Object.values(lang.wordFrequencyHints).sort((a, b) => b - a);
  if (vals.length === 0) return { ratio: NaN, capShare: NaN };
  const top = vals[0]!;
  const rank100 = vals[Math.min(99, vals.length - 1)]!;
  const capShare = vals.filter((v) => v >= 0.94).length / vals.length;
  return { ratio: rank100 > 0 ? top / rank100 : Infinity, capShare };
}

/**
 * Compound coherence = of TRUE compounds (both parts are content lexemes,
 * not affixes/bound morphemes — derivations like child+-ish are excluded)
 * whose target concept carries a curated cross-linguistic `decomposition`,
 * the share whose recorded parts MATCH it (an authentic head-final kenning
 * like breeze=small+wind rather than the random-sibling mash breeze=
 * ridge+frost). This directly tracks Phase 2a. (The old `parts.includes(m)`
 * metric was 0% by construction — no compounding system puts the target's
 * own meaning among its parts — so it measured nothing.)
 */
function compoundCoherence(lang: Language): {
  trueCompounds: number;
  decomposable: number;
  matched: number;
} {
  const cps = lang.compounds ?? {};
  let trueCompounds = 0;
  let decomposable = 0;
  let matched = 0;
  for (const [m, c] of Object.entries(cps)) {
    if (c.parts.length < 2) continue;
    const hasAffix = c.parts.some(
      (p) => p.startsWith("-") || p.endsWith("-") || lang.boundMorphemes?.has(p),
    );
    if (hasAffix) continue;
    trueCompounds++;
    const decomp = CONCEPTS[m]?.decomposition;
    if (!decomp || decomp.length === 0) continue;
    decomposable++;
    const a = new Set(c.parts);
    if (a.size === decomp.length && decomp.every((x) => a.has(x))) matched++;
  }
  return { trueCompounds, decomposable, matched };
}

/**
 * Drift-target quality. Parses `<tag>: <from> → <to>` drift events and
 * scores how many land on a CURATED neighbour/colexification of the source
 * (tight, CLICS-aligned — the Phase 3a target) vs. how many land on the
 * source's own antonym (the Phase 3b bug). High curated-share + zero
 * antonyms = realistic drift.
 */
function driftQuality(lang: Language): { total: number; curated: number; antonym: number } {
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
  return { total, curated, antonym };
}

/**
 * Mean embedding cosine between curated antonym pairs (the audit's actual
 * finding: cos(water,fire)=0.987 — antonyms share a cluster centroid so
 * drift can carry a word toward its opposite). Phase 3b drives this down.
 */
function antonymCosine(lang: Language): { mean: number; max: number; n: number } {
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

function pct(x: number): string {
  return Number.isNaN(x) ? "  n/a" : `${(x * 100).toFixed(1)}%`;
}

describe("realism scorecard (RUN_SLOW)", () => {
  for (const preset of PRESETS) {
    it(`${preset.id}: realism metrics within baseline bands`, () => {
      const sim = createSimulation(scorecardConfig(preset.build));
      const seed = captureSeed(soleLeaf(sim.getState()));
      const seedInvSize = soleLeaf(sim.getState()).phonemeInventory.segmental.length;

      const curve: Array<{ gen: number; swadesh: number; identical: number }> = [];
      let gen = 0;
      for (const cp of CHECKPOINTS) {
        while (gen < cp) {
          sim.step();
          gen++;
        }
        const l = soleLeaf(sim.getState());
        curve.push({
          gen,
          swadesh: swadeshRetention(seed, l),
          identical: identicalRetention(seed, l),
        });
      }

      const lang = soleLeaf(sim.getState());
      const onset = onsetStats(lang);
      const zipf = zipfStats(lang);
      const compound = compoundCoherence(lang);
      const swadesh1000 = curve[0]!.swadesh; // 40 gens = 1000 yr
      const identical1000 = curve[0]!.identical;
      const identical5000 = curve[curve.length - 1]!.identical;
      const homophony = homophonyRate(lang);
      const senses = sensesPerWord(lang);
      const drift = driftQuality(lang);
      const antonymCos = antonymCosine(lang);
      const sizeRatio = lexKeys(lang).length / Math.max(1, seed.size);
      const synth = lang.grammar.synthesisIndex;
      const morphType = lang.grammar.morphologicalType;
      const invSize = lang.phonemeInventory.segmental.length;
      const invTarget = lang.phonemeTarget ?? NaN;

      const report = [
        ``,
        `═══ realism scorecard: ${preset.id} (single lineage, ${HORIZON} gens / ${HORIZON * YEARS_PER_GENERATION} yr) ═══`,
        `  Swadesh retention curve   ${curve
          .map((c) => `${c.gen * YEARS_PER_GENERATION}yr=${pct(c.swadesh)}`)
          .join("  ")}`,
        `  Swadesh @1000yr           ${pct(swadesh1000)}   (target 78–86%)`,
        `  Whole-lex identical @1000 ${pct(identical1000)}   (target ≥30%)`,
        `  Whole-lex identical @5000 ${pct(identical5000)}`,
        `  Onset /h/ share           ${pct(onset.hShare)}   (target <10%)`,
        `  Onset voiceless-stop p/t/k ${pct(onset.voicelessStopShare)}`,
        `  Onset top-6               ${onset.top.map(([s, n]) => `${s}:${n}`).join(" ")}`,
        `  Homophony rate            ${pct(homophony)}   (target <4%)`,
        `  Senses/word total|accid   ${senses.total.toFixed(3)} | ${senses.accidental.toFixed(3)}   (accidental target ≤1.05; total ~1.1–1.3 w/ colex)`,
        `  Synthesis index / type    ${synth?.toFixed(2) ?? "n/a"} / ${morphType ?? "n/a"}`,
        `  Inventory size            ${invSize} (seed ${seedInvSize}, target ${Number.isNaN(invTarget) ? "n/a" : invTarget})   (target: near tier target, not inflated)`,
        `  Lexicon size ratio        ${sizeRatio.toFixed(2)}×   (target ~1.0, stationary)`,
        `  Zipf rank1/rank100        ${Number.isFinite(zipf.ratio) ? zipf.ratio.toFixed(2) : "∞"}   cap-pinned ${pct(zipf.capShare)}   (target ratio≫1)`,
        `  Compound decomp-match     ${compound.matched}/${compound.decomposable} ${pct(compound.decomposable === 0 ? NaN : compound.matched / compound.decomposable)}  (true compounds=${compound.trueCompounds})  (target ≥80%)`,
        `  Antonym embed-cosine      mean ${Number.isNaN(antonymCos.mean) ? "n/a" : antonymCos.mean.toFixed(3)}  max ${Number.isNaN(antonymCos.max) ? "n/a" : antonymCos.max.toFixed(3)}  (n=${antonymCos.n})  (target ≪1)`,
        `  Drift-target curated      ${drift.curated}/${drift.total} ${pct(drift.total === 0 ? NaN : drift.curated / drift.total)}  antonym-drifts=${drift.antonym}  (target: high curated, 0 antonym)`,
      ].join("\n");
      // eslint-disable-next-line no-console
      console.log(report);

      // ── Sanity: the harness produced finite, in-range numbers ──
      expect(curve[0]!.swadesh).toBeGreaterThan(0);
      expect(swadesh1000).toBeGreaterThanOrEqual(0);
      expect(swadesh1000).toBeLessThanOrEqual(1);
      expect(onset.hShare).toBeGreaterThanOrEqual(0);
      expect(homophony).toBeGreaterThanOrEqual(0);
      expect(sizeRatio).toBeGreaterThan(0);
      expect(drift.antonym).toBeGreaterThanOrEqual(0);

      // ── Wide baseline bands (regression floor; tightened per phase) ──
      // These are deliberately loose "don't get WORSE than today's audited
      // baseline" guards, NOT the realism targets (those are in the report
      // and the scorecard table). Each phase tightens the metric it owns.
      //
      // Swadesh core @5000yr is a CATASTROPHE guard only — 200 gens of
      // un-damped single-lineage drift is far beyond the glottochronology
      // calibration target (@1000yr, owned by Phase 6) and is the noisiest
      // single-seed checkpoint (default has ranged 14–22% across phases from
      // RNG-stream reshuffles, not real erosion changes). Floor catches a
      // true collapse (<10%), not normal deep-time decay.
      expect(curve[curve.length - 1]!.swadesh).toBeGreaterThan(0.1);
      // /h/ onset share (worst today: germanic 23.5%). TARGET (P1): <10%.
      expect(onset.hShare).toBeLessThan(0.45);
      // Homophony (worst today: bantu 26.7%). TARGET (P1): <4%.
      expect(homophony).toBeLessThan(0.4);
      // Lexicon size ratio (worst today: tokipona 6.14×). TARGET (P4e): ~1.0.
      expect(sizeRatio).toBeGreaterThan(0.5);
      expect(sizeRatio).toBeLessThan(8);
    });
  }
});
