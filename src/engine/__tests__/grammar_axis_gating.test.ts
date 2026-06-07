import { describe, it, expect } from "vitest";
import { satSet } from "../lexicon/satellites";
import { lexSet } from "../lexicon/access";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import { maybeGrammaticalize } from "../morphology/evolve";
import {
  deriveGrammaticalisedAxes,
  pathwayTargetsForLang,
  PATHWAYS,
} from "../semantics/grammaticalization";
import type { SemanticTag } from "../semantics/grammaticalization";

/**
 * Phase 73c Tier C Phase 1 — grammaticalisedAxes gates the pathway map.
 *
 * Verifies the new opt-in gate: when a language sets
 * `grammar.grammaticalisedAxes.aspect = ["pfv","ipfv"]`, the
 * grammaticalisation driver no longer offers `verb.aspect.prog`
 * (or `.hab` / `.perf` / `.prosp`) as a target — they're filtered
 * out by `pathwayTargetsForLang` before `maybeGrammaticalize`
 * even considers them as candidates.
 *
 * The legacy path (unset axes) is also exercised to confirm
 * Phase 1 stays back-compat — no behaviour change when the gate
 * is absent.
 */

describe("Phase 73c Phase 1 — grammaticalisedAxes gating", () => {
  it("a pfv-ipfv-only language never seeds prog/hab/perf/prosp via pathway", () => {
    const sim = createSimulation(defaultConfig());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.grammar.grammaticalisedAxes = { aspect: ["pfv", "ipfv"] };
    // 'go' carries the 'motion' tag whose pathway includes
    // verb.aspect.prosp + .pfv + .ipfv. After gating, only pfv/ipfv
    // remain — verb.tense.fut is on the tense axis (not declared
    // grammaticalised in this test) so it ALSO drops out.
    const filtered = pathwayTargetsForLang("motion", lang);
    expect(filtered).toContain("verb.aspect.pfv");
    expect(filtered).toContain("verb.aspect.ipfv");
    expect(filtered).not.toContain("verb.aspect.prosp");
    expect(filtered).not.toContain("verb.aspect.hab");
  });

  it("Phase 5b: unset axes DERIVE the gate from the language's typology", () => {
    const sim = createSimulation(defaultConfig());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.grammar.grammaticalisedAxes = undefined;
    // A PERMISSIVE typology (marks tense; aspect undeclared so that axis is
    // ungated) derives axes that allow the full motion pathway — the old
    // "unfiltered" behaviour now follows from a tense-marking, aspect-open
    // typology rather than from the gate being off.
    lang.grammar.tenseMarking = "both";
    lang.grammar.aspectSystem = undefined;
    const targets = pathwayTargetsForLang("motion", lang);
    expect(targets).toContain("verb.tense.fut");
    expect(targets).toContain("verb.aspect.prosp");
    expect(targets).toContain("verb.aspect.pfv");
    expect(targets).toContain("verb.aspect.ipfv");
  });

  it("Phase 5b: an isolating typology (no tense, no case) gates those pathways out", () => {
    const sim = createSimulation(defaultConfig());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.grammar.grammaticalisedAxes = undefined;
    lang.grammar.tenseMarking = "none";
    lang.grammar.hasCase = false;
    // No declared axes set; the derived gate must drop tense + case targets.
    const motion = pathwayTargetsForLang("motion", lang);
    expect(motion).not.toContain("verb.tense.fut");
    // Across EVERY pathway tag, a caseless language is offered no noun.case target.
    const allTargets = (Object.keys(PATHWAYS) as SemanticTag[]).flatMap(
      (t) => pathwayTargetsForLang(t, lang),
    );
    expect(allTargets.some((c) => c.startsWith("noun.case."))).toBe(false);
  });

  it("maybeGrammaticalize honours the gate — gated paradigms never get seeded", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "axis-gate" });
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.grammar.grammaticalisedAxes = { aspect: ["pfv", "ipfv"], tense: [] };
    // Wipe any pre-seeded paradigms in the gated slots.
    for (const c of ["verb.aspect.prosp", "verb.aspect.hab", "verb.aspect.perf", "verb.tense.fut", "verb.tense.past"] as const) {
      delete lang.morphology.paradigms[c];
    }
    lexSet(lang, "go", ["g", "o"]);
    satSet(lang, "wordFrequencyHints", "go", 0.95);
    // Fire many times; with the gate, no gated paradigm should
    // ever be seeded from 'go'.
    for (let i = 0; i < 50; i++) {
      maybeGrammaticalize(lang, makeRng(`gate-${i}`), 1.0);
    }
    expect(lang.morphology.paradigms["verb.aspect.prosp"]).toBeUndefined();
    expect(lang.morphology.paradigms["verb.aspect.hab"]).toBeUndefined();
    expect(lang.morphology.paradigms["verb.aspect.perf"]).toBeUndefined();
    expect(lang.morphology.paradigms["verb.tense.fut"]).toBeUndefined();
  });

  it("deriveGrammaticalisedAxes maps tenseMarking/aspectSystem/etc cleanly", () => {
    const sim = createSimulation(defaultConfig());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.grammar.tenseMarking = "past";
    lang.grammar.aspectSystem = "pfv-ipfv";
    lang.grammar.moodMarking = "subjunctive";
    lang.grammar.evidentialMarking = "three-way";
    lang.grammar.voice = "active";
    lang.grammar.hasCase = true;
    lang.grammar.alignment = "nom-acc";
    const axes = deriveGrammaticalisedAxes(lang.grammar);
    expect(axes.tense).toEqual(["past"]);
    expect(axes.aspect).toEqual(["pfv", "ipfv"]);
    expect(axes.mood).toEqual(["subj"]);
    expect(axes.evidentiality).toEqual(["dir", "rep", "inf"]);
    expect(axes.voice).toEqual([]);
    expect(axes.case).toContain("nom");
    expect(axes.case).toContain("acc");
    expect(axes.case).not.toContain("erg");
  });

  it("an erg-abs language derives the erg+abs case set, not nom+acc", () => {
    const sim = createSimulation(defaultConfig());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.grammar.hasCase = true;
    lang.grammar.alignment = "erg-abs";
    const axes = deriveGrammaticalisedAxes(lang.grammar);
    expect(axes.case).toContain("erg");
    expect(axes.case).toContain("abs");
    expect(axes.case).not.toContain("nom");
    expect(axes.case).not.toContain("acc");
  });

  it("a caseless language derives an empty case axis", () => {
    const sim = createSimulation(defaultConfig());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.grammar.hasCase = false;
    const axes = deriveGrammaticalisedAxes(lang.grammar);
    expect(axes.case).toEqual([]);
  });
});
