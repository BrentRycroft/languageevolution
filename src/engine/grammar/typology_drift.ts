import type { GrammarFeatures, Language } from "../types";
import { pushEvent } from "../steps/helpers";

/**
 * typology_drift.ts
 *
 * Word-order / case / alignment / classifier drift; typological-universal repair. Key exports: recomputeMorphologicalType, stepTypologyDrift.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const TYPOLOGY_CADENCE = 10;

export function recomputeMorphologicalType(g: GrammarFeatures): GrammarFeatures["morphologicalType"] {
  const synth = g.synthesisIndex ?? 2.0;
  const fusion = g.fusionIndex ?? 0.5;
  if (synth >= 3.0) return "polysynthetic";
  if (synth < 1.3) return "isolating";
  if (fusion >= 0.45) return "fusional";
  return "agglutinating";
}

export function stepTypologyDrift(lang: Language, generation: number): void {
  if (generation % TYPOLOGY_CADENCE !== 0) return;
  const g = lang.grammar;
  const paradigmCount = Object.keys(lang.morphology.paradigms).length;
  const synthFromParadigms = 0.8 + 0.2 * paradigmCount;
  // Phase 4a: analytic case-marking pulls the synthesis target DOWN, so the
  // index isn't a one-way function of paradigm count alone. A language that
  // has gone adpositional (English "of/to", Romance de/à vs Latin -ī/-ō) or
  // shed its case system is drifting analytic regardless of residual paradigm
  // entries — the Latin→French direction the ratchet used to forbid.
  let analyticPull = 0;
  if (g.caseStrategy === "preposition" || g.caseStrategy === "postposition") {
    analyticPull += 0.5;
  }
  if (g.hasCase === false) analyticPull += 0.3;
  const currentSynth = g.synthesisIndex ?? 2.0;
  const targetSynth = Math.max(0.8, Math.min(4.5, synthFromParadigms - analyticPull));
  // Phase 73d D5: smoothing reduced 0.85 → 0.70 so daughters'
  // synthesis index adapts faster to their paradigm-richness
  // trajectory. Combined with D1's split-time seed delta, sisters
  // diverge sharply on the analytic-vs-synthetic axis instead of
  // converging on the same paradigm-count target.
  const newSynth = currentSynth * 0.70 + targetSynth * 0.30;

  let avgAffixLen = 0;
  let n = 0;
  for (const cat of Object.keys(lang.morphology.paradigms)) {
    const p = lang.morphology.paradigms[cat as keyof typeof lang.morphology.paradigms];
    if (!p) continue;
    avgAffixLen += p.affix.length;
    n++;
  }
  if (n > 0) avgAffixLen /= n;
  const fusionFromAffixes = avgAffixLen <= 1.2 ? 0.7 : avgAffixLen >= 2.5 ? 0.25 : 0.45;
  const currentFusion = g.fusionIndex ?? 0.5;
  // Phase 73d D5: smoothing reduced 0.85 → 0.70 alongside synth.
  const newFusion = currentFusion * 0.70 + fusionFromAffixes * 0.30;

  g.synthesisIndex = newSynth;
  g.fusionIndex = newFusion;
  const previousType = g.morphologicalType;
  g.morphologicalType = recomputeMorphologicalType(g);
  if (previousType && previousType !== g.morphologicalType) {
    // Phase 4a: route through the pushEvent chokepoint so this event obeys
    // MAX_EVENTS_PER_LANGUAGE. It was a raw lang.events.push (the one event
    // sink that bypassed the ring-buffer cap); now that 4a's analytic pull
    // makes type-drift fire more often it could tip a long-lived leaf to 81.
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `morphological type drifted: ${previousType} → ${g.morphologicalType} (synth ${newSynth.toFixed(2)}, fusion ${newFusion.toFixed(2)})`,
    });
  }
}
