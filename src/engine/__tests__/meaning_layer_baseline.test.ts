import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetGermanic } from "../presets/germanic";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { formToString } from "../phonology/ipa";
import { fnv1a } from "../rng";
import { lexKeys, lexGet } from "../lexicon/access";
import type { SimulationConfig } from "../types";

/**
 * meaning_layer_baseline.test.ts — the byte-identical SAFETY NET for the
 * meaning-layer migration (see docs/planning/archive/MEANING-LAYER-MIGRATION.md).
 *
 * The migration decouples word MEANING from English strings and turns words
 * into morphological building blocks. Its hard invariant is byte-identical
 * determinism: no phase may change any language's evolved forms. This test
 * locks a hash of every preset's lexicon (meaning → IPA form) + word forms.
 *
 * Two tiers:
 *  - FAST (every run): gen-0 forms for all 6 presets — catches init/shim
 *    regressions cheaply (no stepping).
 *  - RUN_SLOW: the full 30-step trajectory for all 6 presets — catches any
 *    determinism perturbation along the evolution path. Run this explicitly at
 *    each migration phase gate: `RUN_SLOW=1 npx vitest run meaning_layer_baseline`.
 *
 * Expected hashes are the CURRENT (pre-migration) baseline. If a future change
 * legitimately alters forms, re-baseline DELIBERATELY (and justify it).
 */

const RUN_SLOW = !!(globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.RUN_SLOW;

const PRESETS: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  bantu: presetBantu,
  romance: presetRomance,
  germanic: presetGermanic,
  tokipona: presetTokipona,
  english: presetEnglish,
};

const STEPS = 30;

/** Deterministic hash of every tree node's sorted lexicon forms + word forms. */
function signature(sim: ReturnType<typeof createSimulation>): string {
  const tree = sim.getState().tree;
  const parts: string[] = [];
  for (const id of Object.keys(tree).sort()) {
    const lang = tree[id]!.language;
    // Route through the accessor seam (lexKeys/lexGet) so the signature locks
    // GLOSS → form, not the physical store key. Pre-flip the seam yields the
    // glosses directly; post-flip (concept re-key R2) it resolves the
    // ConceptId store key back to its gloss. Either way the linguistic
    // content — what this test guards — is identical, so the locked hashes
    // survive a pure storage refactor and still catch any real form change.
    // NB: sort the GLOSSES (as the original Object.keys(...).sort() did), not
    // the combined "gloss=form" strings — a prefix gloss with a low-ASCII
    // continuation (e.g. "a" vs "a-thing") would otherwise reorder.
    const lex = lexKeys(lang)
      .sort()
      .map((m) => `${m}=${formToString(lexGet(lang, m)!)}`)
      .join("|");
    const words = (lang.words ?? [])
      .map((w) => w.formKey)
      .sort()
      .join("|");
    parts.push(`${id}#${lex}#${words}`);
  }
  return fnv1a(parts.join("\n")).toString(16).padStart(8, "0");
}

// Baseline hashes from the current (pre-migration) engine. Locked.
// GEN0 re-baselined 2026-06-01 (item 3 enrichment, all presets): each preset
// gained appended seedCompounds built from existing primitives (verified to
// materialise as exact part concatenations), so each gen-0 lexicon gained those
// entries. Per preset (authentic, family-calibrated): pie +master (*dem-pótis);
// bantu +student/citizen/fisherman (mwana/mu-+X); romance +wallet/scarecrow (V+N);
// germanic +rainbow/firewood/daylight/seabird (N+N); english +rainbow/firewood/
// seaside/sunflower/footpath; tokipona +king/soldier/city (landed 2026-05-31).
const GEN0: Record<string, string> = {
  pie: "8e1e516d",
  bantu: "cb709a71",
  romance: "28661e99",
  germanic: "442a10cb",
  tokipona: "963106db",
  english: "77c30563",
};
// RE-BASELINED 2026-05-31 (B1-Y — content-addressed per-concept RNG). ALL SIX
// presets shifted, as expected and intended: sound change in apply.ts now draws
// from a per-concept sub-rng seeded by `config.seed|lang.id|generation|conceptId`
// instead of the shared sequential stream, so a word's phonological draws depend
// on its own identity rather than its position in the iteration order. This is
// the ONE deliberate full-trajectory re-baseline the migration plan reserved for
// the (Y) work (see docs/planning/archive/STAGE-B-PLAN.md §5). GEN0 is unchanged
// (no draws in the seed state). The payoff: adding vocabulary no longer scrambles
// existing words' sound trajectories — verified 0/427 perturbation in an
// append-a-concept probe. Machinery cost is negligible (isolated per-call delta
// within noise). Reproducibility-determinism is fully preserved (same config →
// identical output; re-run confirmed).
// GENN re-baselined 2026-06-01 (item 3 enrichment): each preset's gen-30 shifted
// by ITS OWN appended compounds + their localized genesis/obsolescence cascade.
// Each enrichment is ISOLATED — appending one preset's compounds left every OTHER
// preset byte-identical (B1-Y insulates existing words' per-concept sound
// trajectories), proven by the staged re-baseline (tokipona unchanged when the
// other 5 were enriched, and vice-versa). This is the clean, reviewable enrichment
// diff B1-Y was built to enable.
const GENN: Record<string, string> = {
  pie: "d7fb34d7",
  bantu: "e0b0c09d",
  romance: "81bf802b",
  germanic: "cdf934f8",
  tokipona: "6efea09c",
  english: "67c3b025",
};

describe("meaning-layer baseline — gen-0 forms byte-identical (fast)", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: gen-0 lexicon + word forms match the locked baseline`, () => {
      const sig = signature(createSimulation(build()));
      expect(sig, `${name} gen-0 byte-identity`).toBe(GEN0[name]);
    });
  }
});

describe("meaning-layer baseline — full trajectory byte-identical (RUN_SLOW)", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it.skipIf(!RUN_SLOW)(`${name}: lexicon + word forms match after ${STEPS} steps`, () => {
      const sim = createSimulation(build());
      for (let i = 0; i < STEPS; i++) sim.step();
      expect(signature(sim), `${name} gen-${STEPS} byte-identity`).toBe(GENN[name]);
    });
  }
});
