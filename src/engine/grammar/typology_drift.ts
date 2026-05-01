import type { GrammarFeatures, Language } from "../types";

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
  const currentSynth = g.synthesisIndex ?? 2.0;
  const targetSynth = Math.max(0.8, Math.min(4.5, synthFromParadigms));
  const newSynth = currentSynth * 0.85 + targetSynth * 0.15;

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
  const newFusion = currentFusion * 0.85 + fusionFromAffixes * 0.15;

  g.synthesisIndex = newSynth;
  g.fusionIndex = newFusion;
  const previousType = g.morphologicalType;
  g.morphologicalType = recomputeMorphologicalType(g);
  if (previousType && previousType !== g.morphologicalType) {
    lang.events.push({
      generation,
      kind: "grammar_shift",
      description: `morphological type drifted: ${previousType} → ${g.morphologicalType} (synth ${newSynth.toFixed(2)}, fusion ${newFusion.toFixed(2)})`,
    });
  }
}
